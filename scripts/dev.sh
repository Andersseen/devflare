#!/bin/bash
# Launch dev-auth, devflare, devtools and dev-radar in the same terminal (cross-platform)
# Uses concurrently for colored, labeled output

echo "🚀 Starting all four services..."
echo ""

pnpm dev:all
