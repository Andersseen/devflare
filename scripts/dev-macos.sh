#!/bin/bash
# Launch dev-auth, devflare, devtools and dev-radar in separate Terminal windows (macOS)

osascript -e 'tell app "Terminal" to do script "cd '"$PWD"' && echo \"🚀 Starting DevFlare Auth...\" && pnpm dev:auth"'
osascript -e 'tell app "Terminal" to do script "cd '"$PWD"' && echo \"🚀 Starting DevFlare App...\" && pnpm dev:app"'
osascript -e 'tell app "Terminal" to do script "cd '"$PWD"' && echo \"🚀 Starting DevTools...\" && pnpm dev:tools"'
osascript -e 'tell app "Terminal" to do script "cd '"$PWD"' && echo \"🚀 Starting DevRadar...\" && pnpm dev:radar"'

echo ""
echo "✅ Four Terminal windows should have opened:"
echo "   1. DevFlare Auth  → http://localhost:8787"
echo "   2. DevFlare App   → http://localhost:4200"
echo "   3. DevTools       → http://localhost:4300"
echo "   4. DevRadar       → http://localhost:4400"
echo ""
echo "Next steps:"
echo "   pnpm seed:user     # Create test user"
echo "   open http://localhost:4200"
