/**
 * Utility functions for converting content to markdown using Cloudflare Workers AI
 */

interface Env {
  AI?: any; // Cloudflare Workers AI binding (optional)
}

interface ExaSearchResult {
  id: string;
  title: string;
  url: string;
  publishedDate: string;
  author: string;
  text: string;
  summary?: string;
  image?: string;
  favicon?: string;
  score?: number;
}

/**
 * Clean HTML content by removing navigation, ads, scripts, and other irrelevant elements
 * @param html The raw HTML content
 * @returns Cleaned HTML content
 */
function cleanHtmlContent(html: string): string {
  if (!html || typeof html !== 'string') return html;

  // Remove script and style tags
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove navigation and header elements
  html = html.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  html = html.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');

  // Remove footer elements
  html = html.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');

  // Remove common ad and widget selectors
  html = html.replace(/<div[^>]*class="[^"]*ad[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  html = html.replace(/<div[^>]*id="[^"]*ad[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  html = html.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');

  // Remove social media widgets and sharing buttons
  html = html.replace(/<div[^>]*class="[^"]*share[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  html = html.replace(/<div[^>]*class="[^"]*social[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

  // Remove image tags that are likely ads or icons
  html = html.replace(/<img[^>]*alt="[^"]*logo[^"]*"[^>]*>/gi, '');
  html = html.replace(/<img[^>]*class="[^"]*icon[^"]*"[^>]*>/gi, '');

  // Clean up excessive whitespace
  html = html.replace(/\s+/g, ' ');
  html = html.replace(/\n\s*\n/g, '\n');

  return html.trim();
}

/**
 * Convert text content to markdown using Cloudflare Workers AI toMarkdown
 * @param content The text content to convert
 * @param env Cloudflare Workers environment with AI binding
 * @param mimeType MIME type of the content (defaults to 'text/html')
 * @returns Promise<string> The converted markdown content or original content if conversion fails
 */
export async function convertToMarkdown(
  content: string,
  env?: Env,
  mimeType: string = 'text/html'
): Promise<string> {
  if (!content || content.trim() === '') {
    return content;
  }

  if (!env?.AI) {
    return content; // Return original content if AI binding not available
  }

  try {
    // Clean HTML content if it's HTML
    let processedContent = content;
    if (mimeType === 'text/html') {
      processedContent = cleanHtmlContent(content);
    }

    const markdownResult = await env.AI.toMarkdown([
      {
        name: 'content',
        blob: new Blob([processedContent], { type: mimeType })
      }
    ]);

    if (markdownResult && markdownResult.length > 0) {
      const conversion = markdownResult[0];
      if (conversion.format === 'markdown' && conversion.data) {
        return conversion.data;
      }
    }

    // Return original content if conversion doesn't produce valid markdown
    return content;
  } catch (error) {
    console.error('Markdown conversion error:', error);
    // Return original content on error
    return content;
  }
}

/**
 * Format search results into clean markdown format for chatbot consumption
 * @param results Array of search results from Exa API
 * @param query The original search query
 * @param env Cloudflare Workers environment with AI binding
 * @returns Promise<string> Formatted markdown results
 */
export async function formatSearchResultsToMarkdown(
  results: ExaSearchResult[],
  query: string,
  env?: Env
): Promise<string> {
  if (!results || results.length === 0) {
    return `No search results found for "${query}".`;
  }

  let markdown = `## 🔍 Search Results for "${query}"\n\n`;

  for (const result of results.slice(0, 10)) { // Limit to 10 results
    try {
      // Clean and convert the text content to markdown
      const cleanText = await convertToMarkdown(result.text, env, 'text/html');

      // Extract a concise summary (first 200 characters of clean text)
      const summary = cleanText
        .replace(/[#*`]/g, '') // Remove markdown formatting
        .replace(/\n+/g, ' ') // Replace newlines with spaces
        .trim()
        .substring(0, 200)
        .trim();

      // Add ellipsis if truncated
      const displaySummary = summary.length < cleanText.replace(/[#*`]/g, '').replace(/\n+/g, ' ').trim().length
        ? summary + '...'
        : summary;

      markdown += `### [${result.title}](${result.url})\n`;
      if (result.author) {
        markdown += `**Author:** ${result.author}  \n`;
      }
      if (result.publishedDate) {
        const date = new Date(result.publishedDate).toLocaleDateString();
        markdown += `**Published:** ${date}  \n`;
      }
      markdown += `${displaySummary}\n\n`;

    } catch (error) {
      console.error(`Error processing result ${result.id}:`, error);
      // Fallback to basic formatting
      markdown += `### [${result.title}](${result.url})\n`;
      markdown += `${result.text.substring(0, 200)}...\n\n`;
    }
  }

  if (results.length > 10) {
    markdown += `*And ${results.length - 10} more results...*\n\n`;
  }

  return markdown;
}

/**
 * Convert JSON data to markdown format
 * @param data The data to convert (object or string)
 * @param env Cloudflare Workers environment with AI binding
 * @returns Promise<string> The converted markdown content or JSON string if conversion fails
 */
export async function convertJsonToMarkdown(
  data: any,
  env?: Env
): Promise<string> {
  // First convert to JSON string if it's not already
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  // Use text/plain MIME type for JSON content
  return await convertToMarkdown(jsonString, env, 'text/plain');
}
