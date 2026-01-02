// Test script to verify service binding works
// Run this locally with: node test-service-binding.js

// This simulates how your chatbot would call the Exa MCP service
// In production, this would be a direct binding call with zero latency

const testMcpCall = async () => {
  const mcpRequest = {
    jsonrpc: '2.0',
    id: 'test-1',
    method: 'tools/call',
    params: {
      name: 'web_search_exa',
      arguments: {
        query: 'test query',
        numResults: 3
      }
    }
  }

  try {
    console.log('Testing MCP service call...')

    // For testing, we'll call the HTTP endpoint
    // In production, this would be: await env.EXA_MCP.fetch(request)
    const response = await fetch('https://exa-mcp-service.dreemrworld.workers.dev', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mcpRequest)
    })

    const result = await response.json()
    console.log('✅ Service is working!')
    console.log('Response:', JSON.stringify(result, null, 2))

  } catch (error) {
    console.error('❌ Service test failed:', error.message)
  }
}

testMcpCall()
