#!/bin/bash
set -e

# Load .env into shell environment (for generating config files)
set -a
source .env 2>/dev/null || true
set +a

# Generate .mcp.json from TIKHUB_TOKEN (Sorftime API Key)
if [ -n "$TIKHUB_TOKEN" ]; then
  cat > .mcp.json << MCPEOF
{
  "mcpServers": {
    "sorftime": {
      "url": "https://mcp.sorftime.com?key=${TIKHUB_TOKEN}"
    }
  }
}
MCPEOF
  echo "[entrypoint] .mcp.json generated"
fi

echo "[entrypoint] Starting server on port ${PORT:-3000}..."
exec npx tsx server/index.ts
