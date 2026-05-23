#!/bin/bash
# Launch dev-auth and devflare in separate Terminal windows (macOS)

osascript -e 'tell app "Terminal" to do script "cd '"$PWD"' && echo \"🚀 Starting DevFlare Auth...\" && pnpm dev:auth"'
osascript -e 'tell app "Terminal" to do script "cd '"$PWD"' && echo \"🚀 Starting DevFlare App...\" && pnpm dev:app"'

echo ""
echo "✅ Two Terminal windows should have opened:"
echo "   1. DevFlare Auth  → http://localhost:8787"
echo "   2. DevFlare App   → http://localhost:4200"
echo ""
echo "Next steps:"
echo "   pnpm seed:user     # Create test user"
echo "   open http://localhost:4200"
