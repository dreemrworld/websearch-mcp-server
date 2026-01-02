// Example integration in your Hono-based chatbot
// Replace HTTP calls with direct service binding calls

import { Hono } from 'hono'

// Assuming your Hono app has access to the service binding
type Bindings = {
  EXA_MCP: Fetcher
}

const app = new Hono<{ Bindings: Bindings }>()

// Before: HTTP call (high latency)
// const response = await fetch('https://exa-mcp-service.dreemrworld.workers.dev', {
//   method: 'POST',
//   headers: { 'Content-Type': 'application/json' },
//   body: JSON.stringify(mcpRequest)
// })

// After: Direct service binding (minimal latency)
app.post('/api/search', async (c) => {
  const userQuery = await c.req.json()

  // Create MCP protocol request
  const mcpRequest = {
    jsonrpc: '2.0',
    id: 'search-1',
    method: 'tools/call',
    params: {
      name: 'web_search_exa',
      arguments: {
        query: userQuery.query,
        numResults: 5
      }
    }
  }

  try {
    // Direct service binding call - ZERO network latency!
    const response = await c.env.EXA_MCP.fetch(c.req.raw, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mcpRequest)
    })

    const result = await response.json()
    return c.json(result)
  } catch (error) {
    return c.json({ error: 'Search failed' }, 500)
  }
})

// For react-data-stream integration
app.post('/api/chat', async (c) => {
  const { messages, useSearch } = await c.req.json()

  if (useSearch) {
    // Extract search query from last message
    const lastMessage = messages[messages.length - 1]
    const searchQuery = extractSearchIntent(lastMessage.content)

    if (searchQuery) {
      // Call Exa search directly via binding
      const searchRequest = {
        jsonrpc: '2.0',
        id: 'chat-search',
        method: 'tools/call',
        params: {
          name: 'web_search_exa',
          arguments: { query: searchQuery }
        }
      }

      const searchResponse = await c.env.EXA_MCP.fetch(c.req.raw, {
        method: 'POST',
        body: JSON.stringify(searchRequest)
      })

      const searchResult = await searchResponse.json()

      // Include search results in AI context
      const enhancedMessages = [
        ...messages,
        {
          role: 'system',
          content: `Search results: ${JSON.stringify(searchResult)}`
        }
      ]

      // Continue with your AI processing...
      return c.json({ messages: enhancedMessages })
    }
  }

  // Normal chat processing
  return c.json({ messages })
})

function extractSearchIntent(message: string): string | null {
  // Simple intent detection - customize based on your needs
  const searchPatterns = [
    /search for (.+)/i,
    /find (.+)/i,
    /look up (.+)/i,
    /what is (.+)\?/i
  ]

  for (const pattern of searchPatterns) {
    const match = message.match(pattern)
    if (match) return match[1]
  }

  return null
}

export default app
