#!/usr/bin/env bash
# Telvyo static web release for the existing Webuzo domain.
# Run as root on the authorized VPS: bash scripts/deploy-vps.sh --apply
set -Eeuo pipefail

SOURCE=/home/lightworld/.telvyo-source
PUBLIC=/home/lightworld/webapps/telvyo
BACKUPS=/home/lightworld/.telvyo-releases
DOMAIN=telvyo.lightworldtech.com
ORIGIN_IP=163.245.212.15

if [[ "${1:-}" != "--apply" ]]; then
  echo "Usage: bash scripts/deploy-vps.sh --apply"
  echo "Runs source tests, backs up the existing public shell and deploys dist/ only."
  exit 2
fi
if [[ $(id -u) -ne 0 ]]; then echo "Run as root for controlled deployment." >&2; exit 2; fi
for cmd in git npm runuser rsync curl; do command -v "$cmd" >/dev/null || { echo "Missing $cmd" >&2; exit 2; }; done
[[ -d "$SOURCE/.git" && -d "$PUBLIC" ]] || { echo "Expected Telvyo paths missing" >&2; exit 2; }
[[ -z "$(runuser -u lightworld -- git -C "$SOURCE" status --porcelain)" ]] || { echo "Source has local edits; refusing." >&2; exit 2; }

echo "Refreshing GitHub main and verifying source..."
runuser -u lightworld -- git -C "$SOURCE" fetch --no-tags origin main
runuser -u lightworld -- git -C "$SOURCE" switch --detach origin/main
SHA=$(runuser -u lightworld -- git -C "$SOURCE" rev-parse HEAD)
cd "$SOURCE"
runuser -u lightworld -- npm ci --no-audit --no-fund
runuser -u lightworld -- npm ci --prefix server --no-audit --no-fund
runuser -u lightworld -- npm test
runuser -u lightworld -- npm run check
for file in index.html app.js model.js connected-views.js styles.css service-worker.js manifest.webmanifest; do
  [[ -f "dist/$file" ]] || { echo "Missing static asset: $file" >&2; exit 1; }
done

echo "Checking Nginx configuration..."
/usr/local/apps/nginx/sbin/nginx -t
[[ -f /var/webuzo-data/nginx/custom/domains/telvyo.lightworldtech.com.conf ]] || {
  echo "Missing protected Telvyo domain configuration" >&2; exit 1;
}

mkdir -p "$BACKUPS"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="$BACKUPS/$TIMESTAMP"
mkdir -p "$BACKUP"
rsync -rlt "$PUBLIC/" "$BACKUP/"
DEPLOY_STARTED=0
rollback() {
  if [[ "$DEPLOY_STARTED" -eq 1 ]]; then
    echo "Deployment failed. Restoring prior public files from $BACKUP" >&2
    rsync -rlt --delete "$BACKUP/" "$PUBLIC/" || true
  fi
}
trap rollback ERR

echo "Publishing only dist/ to existing Webuzo document root..."
DEPLOY_STARTED=1
rsync -rlt --delete --delay-updates --exclude='.openai' "$SOURCE/dist/" "$PUBLIC/"

# Local origin checks avoid stale Cloudflare edge caches.
origin_url="https://$DOMAIN"
check_code() {
  local path="$1" expected="$2" actual
  actual=$(curl -ksS --max-time 8 --resolve "$DOMAIN:443:$ORIGIN_IP" -o /dev/null -w '%{http_code}' "$origin_url$path")
  if [[ "$actual" != "$expected" ]]; then
    echo "Unexpected $path status: $actual (wanted $expected)" >&2
    return 1
  fi
}
check_code / 200
check_code /app.js 200
check_code /styles.css 200
check_code /service-worker.js 200
check_code /admin 404
check_code /api/admin/status 404
check_code /v1/advisor 404
check_code /.env 404

curl -ksS --max-time 8 --resolve "$DOMAIN:443:$ORIGIN_IP" "$origin_url/" | grep -q 'Telvyo'
echo "$SHA" > "$BACKUPS/current-sha"
DEPLOY_STARTED=0
trap - ERR
echo "SUCCESS: Telvyo public browser app deployed at $origin_url"
echo "GitHub SHA: $SHA"
echo "Previous public files: $BACKUP"
echo "Important: owner admin, carrier subscriber APIs and cloud AI remain disabled on this VPS."
