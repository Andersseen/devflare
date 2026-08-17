#!/usr/bin/env bash
#
# Registers DevFlare as an OAuth client of Cloudflare (spec 007).
#
# Run once per account. Everything it sends has to line up with the code:
# the redirect URIs are compared byte for byte at the authorization endpoint,
# and the scopes must match CF_OAUTH_SCOPES in
# apps/devflare/src/server/lib/cloudflare-oauth.ts — a scope requested but not
# registered is refused at the consent screen.
#
# Needs an API token with `OAuth Clients Write`, which the Cloud section's own
# token deliberately does not have. Create one at
# https://dash.cloudflare.com/profile/api-tokens and pass it in:
#
#   CF_ADMIN_TOKEN=… ./scripts/create-cloudflare-oauth-client.sh
#
# The client secret is printed once and never again. Put it in
# apps/devflare/.dev.vars as CLOUDFLARE_OAUTH_CLIENT_SECRET, and the printed
# client id in apps/devflare/wrangler.toml as CLOUDFLARE_OAUTH_CLIENT_ID.

set -euo pipefail

ACCOUNT_ID="${CF_ACCOUNT_ID:-c32a93ee83fe9b5d53c63fcc73b90bb9}"
TOKEN="${CF_ADMIN_TOKEN:-}"

if [ -z "$TOKEN" ]; then
	echo "CF_ADMIN_TOKEN is not set (needs the 'OAuth Clients Write' permission)." >&2
	exit 1
fi

# Local dev is registered alongside production because the flow can only be
# tested end to end where the app actually runs. If Cloudflare refuses the
# http://localhost entry, drop it and test through a tunnel instead.
read -r -d '' PAYLOAD <<'JSON' || true
{
  "client_name": "DevFlare",
  "client_uri": "https://devflare.andersseen.dev",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "client_secret_post",
  "redirect_uris": [
    "https://devflare.andersseen.dev/api/v1/cloud/connect/callback",
    "http://localhost:4200/api/v1/cloud/connect/callback"
  ],
  "scopes": [
    "offline_access",
    "memberships.read",
    "page.read",
    "page.write",
    "workers-scripts.read",
    "d1.read",
    "workers-kv-storage.read",
    "workers-r2.read"
  ]
}
JSON

curl -sS -X POST \
	"https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/oauth_clients" \
	-H "Content-Type: application/json" \
	-H "Authorization: Bearer ${TOKEN}" \
	-d "$PAYLOAD"
