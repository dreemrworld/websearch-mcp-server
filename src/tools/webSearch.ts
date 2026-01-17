import { z } from "zod";
import axios from "axios";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { API_CONFIG } from "./config.js";
import { ExaSearchRequest, ExaSearchResponse } from "../types.js";
import { createRequestLogger } from "../utils/logger.js";
import { checkpoint } from "agnost";
import { convertToMarkdown, formatSearchResultsToMarkdown } from "../utils/markdown.js";

interface Env {
  AI: any; // Cloudflare Workers AI binding
}

export function registerWebSearchTool(server: McpServer, config?: { exaApiKey?: string }, env?: Env): void {
  server.tool(
    "web_search_exa",
    "Search the web using Exa AI - performs real-time web searches and can scrape content from specific URLs. Supports configurable result counts and returns the content from the most relevant websites.",
    {
      query: z.string().describe("Websearch query"),
      numResults: z.number().optional().describe("Number of search results to return (default: 8)"),
      livecrawl: z.enum(['fallback', 'preferred']).optional().describe("Live crawl mode - 'fallback': use live crawling as backup if cached content unavailable, 'preferred': prioritize live crawling (default: 'fallback')"),
      type: z.enum(['auto', 'fast', 'deep']).optional().describe("Search type - 'auto': balanced search (default), 'fast': quick results, 'deep': comprehensive search"),
      contextMaxCharacters: z.number().optional().describe("Maximum characters for context string optimized for LLMs (default: 10000)")
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    },
    async ({ query, numResults, livecrawl, type, contextMaxCharacters }) => {
      const requestId = `web_search_exa-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const logger = createRequestLogger(requestId, 'web_search_exa');
      
      logger.start(query);
      
      try {
        // Create a fresh axios instance for each request
        const axiosInstance = axios.create({
          baseURL: API_CONFIG.BASE_URL,
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'x-api-key': config?.exaApiKey || process.env.EXA_API_KEY || '',
            'x-exa-integration': 'web-search-mcp'
          },
          timeout: 25000
        });

        const searchRequest: ExaSearchRequest = {
          query,
          type: type || "auto",
          numResults: numResults || API_CONFIG.DEFAULT_NUM_RESULTS,
          contents: {
            text: true,
            context: {
              maxCharacters: contextMaxCharacters || 10000
            },
            livecrawl: livecrawl || 'fallback'
          }
        };
        
        checkpoint('web_search_request_prepared');
        logger.log("Sending request to Exa API");
        
        const response = await axiosInstance.post<ExaSearchResponse>(
          API_CONFIG.ENDPOINTS.SEARCH,
          searchRequest,
          { timeout: 25000 }
        );
        
        checkpoint('exa_search_response_received');
        logger.log("Received response from Exa API");

        if (!response.data || !response.data.results || response.data.results.length === 0) {
          logger.log("Warning: Empty or invalid response from Exa API");
          checkpoint('web_search_complete');
          return {
            content: [{
              type: "text" as const,
              text: "No search results found. Please try a different query."
            }]
          };
        }

        logger.log(`Received ${response.data.results.length} search results`);

        // Format search results into clean markdown for chatbot consumption
        const markdownContent = await formatSearchResultsToMarkdown(
          response.data.results,
          query,
          env
        );

        const result = {
          content: [{
            type: "text" as const,
            text: markdownContent
          }]
        };
        
        checkpoint('web_search_complete');
        logger.complete();
        return result;
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
              text: `Search error (${statusCode}): ${errorMessage}`
            }],
            isError: true,
          };
        }
        
        // Handle generic errors
        return {
          content: [{
            type: "text" as const,
            text: `Search error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true,
        };
      }
    }
  );
}
