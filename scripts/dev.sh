#!/bin/bash
# Launch dev-auth, devflare and devtools in the same terminal (cross-platform)
# Uses concurrently for colored, labeled output

echo "🚀 Starting all three services..."
echo ""

pnpm dev:all
