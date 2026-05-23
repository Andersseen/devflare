#!/bin/bash
# Launch dev-auth and devflare in the same terminal (cross-platform)
# Uses concurrently for colored, labeled output

echo "🚀 Starting both services..."
echo ""

pnpm dev:all
