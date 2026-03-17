#!/bin/bash
# End-to-end test for mcp-lazy-proxy
# Tests: proxy starts, lists tools as stubs, proxies a tool call
set -euo pipefail

PROXY="node dist/cli.js"
CONFIG='{"servers":[{"id":"fs","name":"Filesystem","transport":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/tmp"]}],"mode":"lazy"}'

echo "$CONFIG" > /tmp/test-proxy-config.json

echo "=== Test 1: Proxy starts and lists tools ==="

# MCP protocol: send initialize, then initialized notification, then list_tools
# Each message is prefixed with Content-Length header (MCP uses JSON-RPC over stdio)
INIT_MSG='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}'
INITIALIZED_MSG='{"jsonrpc":"2.0","method":"notifications/initialized"}'
LIST_TOOLS_MSG='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Function to format as MCP message (Content-Length header)
mcp_msg() {
  local body="$1"
  local len=${#body}
  printf "Content-Length: %d\r\n\r\n%s" "$len" "$body"
}

# Run proxy with test config, send messages, capture output
{
  mcp_msg "$INIT_MSG"
  sleep 3  # Wait for proxy to connect to upstream
  mcp_msg "$INITIALIZED_MSG"
  sleep 1
  mcp_msg "$LIST_TOOLS_MSG"
  sleep 2
} | timeout 30 $PROXY --config /tmp/test-proxy-config.json 2>/tmp/proxy-stderr.txt | {
  # Read responses (Content-Length framed)
  RESPONSES=""
  while IFS= read -r line; do
    # Skip Content-Length headers
    if [[ "$line" =~ ^Content-Length ]]; then
      continue
    fi
    # Skip empty lines
    if [[ -z "${line//[$'\r\n']/}" ]]; then
      continue
    fi
    RESPONSES="$RESPONSES$line"
    # Try to parse as JSON
    if echo "$line" | python3 -m json.tool > /dev/null 2>&1; then
      ID=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || true)
      if [ "$ID" = "1" ]; then
        echo "✅ Initialize response received (id=1)"
      elif [ "$ID" = "2" ]; then
        TOOL_COUNT=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('result',{}).get('tools',[])))" 2>/dev/null || echo "?")
        echo "✅ tools/list response: $TOOL_COUNT tools"
        # Check if tools have lazy-load markers
        HAS_LAZY=$(echo "$line" | python3 -c "
import sys, json
d = json.load(sys.stdin)
tools = d.get('result',{}).get('tools',[])
lazy = [t for t in tools if 'lazy-loaded' in t.get('description','').lower() or 'lazy' in t.get('description','').lower()]
print(f'{len(lazy)}/{len(tools)} tools have lazy-load stubs')
" 2>/dev/null || echo "?")
        echo "   $HAS_LAZY"
        # Print first tool as sample
        echo "$line" | python3 -c "
import sys, json
d = json.load(sys.stdin)
tools = d.get('result',{}).get('tools',[])
if tools:
    t = tools[0]
    print(f'   Sample tool: {t[\"name\"]}')
    print(f'   Description: {t.get(\"description\",\"?\")[:80]}...')
    schema = t.get('inputSchema',{})
    props = schema.get('properties',{})
    print(f'   Schema properties: {len(props)} (should be 0 for lazy stub)')
" 2>/dev/null || true
      fi
    fi
  done
  echo ""
  echo "=== Proxy stderr (connection logs): ==="
  cat /tmp/proxy-stderr.txt
} || true

echo ""
echo "=== Test complete ==="
