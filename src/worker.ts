import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Import tool implementations
import { registerWebSearchTool } from "./tools/webSearch.js";
import { registerDeepSearchTool } from "./tools/deepSearch.js";
import { registerCompanyResearchTool } from "./tools/companyResearch.js";
import { registerCrawlingTool } from "./tools/crawling.js";
import { registerLinkedInSearchTool } from "./tools/linkedInSearch.js";
import { registerDeepResearchStartTool } from "./tools/deepResearchStart.js";
import { registerDeepResearchCheckTool } from "./tools/deepResearchCheck.js";
import { registerExaCodeTool } from "./tools/exaCode.js";
import { log } from "./utils/logger.js";
// Note: Agnost analytics tracking removed for Cloudflare Workers compatibility

// Tool registry for managing available tools
const availableTools = {
  'web_search_exa': { name: 'Web Search (Exa)', description: 'Real-time web search using Exa AI', enabled: true },
  'get_code_context_exa': { name: 'Code Context Search', description: 'Search for code snippets, examples, and documentation from open source repositories', enabled: true },
  'deep_search_exa': { name: 'Deep Search (Exa)', description: 'Advanced web search with query expansion and high-quality summaries', enabled: false },
  'crawling_exa': { name: 'Web Crawling', description: 'Extract content from specific URLs', enabled: false },
  'deep_researcher_start': { name: 'Deep Researcher Start', description: 'Start a comprehensive AI research task', enabled: false },
  'deep_researcher_check': { name: 'Deep Researcher Check', description: 'Check status and retrieve results of research task', enabled: false },
  'linkedin_search_exa': { name: 'LinkedIn Search', description: 'Search LinkedIn profiles and companies', enabled: false },
  'company_research_exa': { name: 'Company Research', description: 'Research companies and organizations', enabled: false },
};

// Export the MCP server handler for Cloudflare Workers
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow POST requests for MCP
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
    // Get configuration from environment variables
    const serverConfig: {
      exaApiKey?: string;
      enabledTools?: string[] | string;
      debug: boolean;
    } = {
      exaApiKey: env.EXA_API_KEY,
      enabledTools: env.ENABLED_TOOLS,
      debug: env.DEBUG === 'true'
    };

    // Create MCP server
    const server = new McpServer({
      name: "exa-search-server",
      title: "Exa",
      version: "3.1.3"
    });

    // Parse and normalize tool selection
    let parsedEnabledTools: string[] | undefined;
    const toolsParam = serverConfig.enabledTools;

    if (toolsParam) {
      if (typeof toolsParam === 'string') {
        parsedEnabledTools = toolsParam
          .split(',')
          .map((tool: string) => tool.trim())
          .filter((tool: string) => tool.length > 0);
      } else if (Array.isArray(toolsParam)) {
        parsedEnabledTools = toolsParam;
      }
    }

    // Create normalized config with parsed tools
    const normalizedConfig = {
      ...serverConfig,
      enabledTools: parsedEnabledTools
    };

    if (serverConfig.debug) {
      log("Starting Exa MCP Server in debug mode");
      if (parsedEnabledTools) {
        log(`Enabled tools from config: ${parsedEnabledTools.join(', ')}`);
      }
    }

    // Helper function to check if a tool should be registered
    const shouldRegisterTool = (toolId: string): boolean => {
      if (normalizedConfig.enabledTools && normalizedConfig.enabledTools.length > 0) {
        return normalizedConfig.enabledTools.includes(toolId);
      }
      return availableTools[toolId as keyof typeof availableTools]?.enabled ?? false;
    };

    // Register tools based on configuration
    const registeredTools: string[] = [];

    if (shouldRegisterTool('web_search_exa')) {
      registerWebSearchTool(server, normalizedConfig);
      registeredTools.push('web_search_exa');
    }

    if (shouldRegisterTool('deep_search_exa')) {
      registerDeepSearchTool(server, normalizedConfig);
      registeredTools.push('deep_search_exa');
    }

    if (shouldRegisterTool('company_research_exa')) {
      registerCompanyResearchTool(server, normalizedConfig);
      registeredTools.push('company_research_exa');
    }

    if (shouldRegisterTool('crawling_exa')) {
      registerCrawlingTool(server, normalizedConfig);
      registeredTools.push('crawling_exa');
    }

    if (shouldRegisterTool('linkedin_search_exa')) {
      registerLinkedInSearchTool(server, normalizedConfig);
      registeredTools.push('linkedin_search_exa');
    }

    if (shouldRegisterTool('deep_researcher_start')) {
      registerDeepResearchStartTool(server, normalizedConfig);
      registeredTools.push('deep_researcher_start');
    }

    if (shouldRegisterTool('deep_researcher_check')) {
      registerDeepResearchCheckTool(server, normalizedConfig);
      registeredTools.push('deep_researcher_check');
    }

    if (shouldRegisterTool('get_code_context_exa')) {
      registerExaCodeTool(server, normalizedConfig);
      registeredTools.push('get_code_context_exa');
    }

    if (normalizedConfig.debug) {
      log(`Registered ${registeredTools.length} tools: ${registeredTools.join(', ')}`);
    }

    // Register prompts to help users get started
    server.prompt(
      "web_search_help",
      "Get help with web search using Exa",
      {},
      async () => {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: "I want to search the web for current information. Can you help me search for recent news about artificial intelligence breakthroughs?"
              }
            }
          ]
        };
      }
    );

    server.prompt(
      "code_search_help",
      "Get help finding code examples and documentation",
      {},
      async () => {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: "I need help with a programming task. Can you search for examples of how to use React hooks for state management?"
              }
            }
          ]
        };
      }
    );

    // Register resources to expose server information
    server.resource(
      "tools_list",
      "exa://tools/list",
      {
        mimeType: "application/json",
        description: "List of available Exa tools and their descriptions"
      },
      async () => {
        const toolsList = Object.entries(availableTools).map(([id, tool]) => ({
          id,
          name: tool.name,
          description: tool.description,
          enabled: registeredTools.includes(id)
        }));

        return {
          contents: [{
            uri: "exa://tools/list",
            text: JSON.stringify(toolsList, null, 2),
            mimeType: "application/json"
          }]
        };
      }
    );

    // Return the handler
    return createMcpHandler(server as any)(request, env, ctx);
    } catch (error) {
      console.error('MCP Server error:', error);
      return new Response(`Internal server error: ${error}`, { status: 500 });
    }
  }
};

// Type definitions for Cloudflare Workers environment
interface Env {
  EXA_API_KEY?: string;
  ENABLED_TOOLS?: string;
  DEBUG?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}
