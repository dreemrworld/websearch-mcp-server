/**
 * Utility functions for converting content to markdown using Cloudflare Workers AI
 */

interface Env {
  AI?: any; // Cloudflare Workers AI binding (optional)
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
    const markdownResult = await env.AI.toMarkdown([
      {
        name: 'content',
        blob: new Blob([content], { type: mimeType })
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
