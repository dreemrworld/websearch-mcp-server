import { z } from "zod";
import axios from "axios";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { API_CONFIG } from "./config.js";
import { createRequestLogger } from "../utils/logger.js";
import { checkpoint } from "agnost";

interface Env {
  AI: any; // Cloudflare Workers AI binding
}

export function registerCrawlingTool(server: McpServer, config?: { exaApiKey?: string }, env?: Env): void {
  server.tool(
    "crawling_exa",
    "Extract and crawl content from specific URLs using Exa AI - retrieves full text content, metadata, and structured information from web pages. Content is automatically converted to clean markdown format. Ideal for extracting detailed content from known URLs.",
    {
      url: z.string().describe("URL to crawl and extract content from"),
      maxCharacters: z.number().optional().describe("Maximum characters to extract (default: 3000)")
    },
    async ({ url, maxCharacters }) => {
      const requestId = `crawling_exa-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const logger = createRequestLogger(requestId, 'crawling_exa');

      logger.start(url);

      try {
        // Create a fresh axios instance for each request
        const axiosInstance = axios.create({
          baseURL: API_CONFIG.BASE_URL,
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'x-api-key': config?.exaApiKey || process.env.EXA_API_KEY || '',
            'x-exa-integration': 'crawling-mcp'
          },
          timeout: 25000
        });

        const crawlRequest = {
          ids: [url],
          contents: {
            text: {
              maxCharacters: maxCharacters || API_CONFIG.DEFAULT_MAX_CHARACTERS
            },
            livecrawl: 'preferred'
          }
        };

        checkpoint('crawl_request_prepared');
        logger.log("Sending crawl request to Exa API");

        const response = await axiosInstance.post(
          '/contents',
          crawlRequest,
          { timeout: 25000 }
        );

        checkpoint('crawl_response_received');
        logger.log("Received response from Exa API");

        if (!response.data || !response.data.results || response.data.results.length === 0) {
          logger.log("Warning: Empty or invalid response from Exa API");
          checkpoint('crawl_complete');
          return {
            content: [{
              type: "text" as const,
              text: "No content found for the provided URL."
            }]
          };
        }

        logger.log(`Successfully crawled content from URL, processing for markdown conversion`);

        // Extract the crawled content and prepare for markdown conversion
        const crawledResult = response.data.results[0];
        const crawledText = crawledResult?.text || '';

        // If no meaningful text content, return the raw JSON
        if (!crawledText.trim()) {
          logger.log("No text content found, returning raw JSON");
          const result = {
            content: [{
              type: "text" as const,
              text: JSON.stringify(response.data, null, 2)
            }]
          };
          checkpoint('crawl_complete');
          logger.complete();
          return result;
        }

        // Convert crawled HTML/text content to markdown using Cloudflare Workers AI
        try {
          if (!env?.AI) {
            logger.log("AI binding not available, falling back to raw text");
            const result = {
              content: [{
                type: "text" as const,
                text: crawledText
              }]
            };
            checkpoint('crawl_complete');
            logger.complete();
            return result;
          }

          const markdownResult = await env.AI.toMarkdown([
            {
              name: url,
              blob: new Blob([crawledText], { type: 'text/html' })
            }
          ]);

          if (markdownResult && markdownResult.length > 0) {
            const conversion = markdownResult[0];
            if (conversion.format === 'markdown' && conversion.data) {
              logger.log("Successfully converted content to markdown");
              const result = {
                content: [{
                  type: "text" as const,
                  text: conversion.data
                }]
              };
              checkpoint('crawl_complete');
              logger.complete();
              return result;
            }
          }

          // Fallback to raw text if conversion fails
          logger.log("Markdown conversion failed or returned no data, using raw text");
          const result = {
            content: [{
              type: "text" as const,
              text: crawledText
            }]
          };
          checkpoint('crawl_complete');
          logger.complete();
          return result;

        } catch (conversionError) {
          logger.log(`Markdown conversion error: ${conversionError instanceof Error ? conversionError.message : String(conversionError)}, falling back to raw text`);
          // Fallback to raw text if conversion fails
          const result = {
            content: [{
              type: "text" as const,
              text: crawledText
            }]
          };
          checkpoint('crawl_complete');
          logger.complete();
          return result;
        }

      } catch (error) {
        logger.error(error);

        if (axios.isAxiosError(error)) {
          // Handle Axios errors specifically
          const statusCode = error.response?.status || 'unknown';
          const errorMessage = error.response?.data?.message || error.message;

          logger.log(`Axios error (${statusCode}): ${errorMessage}`);
          return {
            content: [{
              type: "text" as const,
              text: `Crawling error (${statusCode}): ${errorMessage}`
            }],
            isError: true,
          };
        }

        // Handle generic errors
        return {
          content: [{
            type: "text" as const,
            text: `Crawling error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true,
        };
      }
    }
  );
}
