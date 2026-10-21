#!/bin/sh
set -eu
# Generic deployment template. Requires a dedicated, existing Caddy service.
: "${HOST:?Set HOST to your SSH user@host}"
: "${SHOP_DOMAIN:?Set SHOP_DOMAIN to your shop domain and configure its DNS first}"
case "$SHOP_DOMAIN" in
  *[!A-Za-z0-9.-]*|''|-*|.*) echo "Invalid SHOP_DOMAIN" >&2; exit 1 ;;
esac
cd "$(dirname "$0")/.."
# Stage a configuration for review; do not overwrite another application's config.
sed 's/{$SHOP_DOMAIN}/'"$SHOP_DOMAIN"'/g' deploy/Caddyfile.birdforge |
  ssh "$HOST" 'set -eu
    stage=$(mktemp /tmp/birdforge-caddy.XXXXXX)
    cat > "$stage"
    caddy validate --config "$stage" --adapter caddyfile
    echo "Validated config: $stage"
    echo "Review it and install it into your Caddy configuration, then reload Caddy."'
