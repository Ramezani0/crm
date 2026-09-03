#!/usr/bin/env bash
# Load prebuilt CRM image on the VPS and cut Caddy over to :3000.
# Usage (from a machine that can SSH as root):
#   VPS_HOST=95.38.182.128 VPS_ROOT_PASSWORD='...' ./deploy/push-to-vps.sh
# Or with key:
#   VPS_HOST=95.38.182.128 SSH_KEY=~/.ssh/id_ed25519 ./deploy/push-to-vps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${VPS_HOST:-95.38.182.128}"
USER="${VPS_USER:-root}"
IMAGE_TAR="${IMAGE_TAR:-/opt/cursor/artifacts/fasihi-crm-local.tar.gz}"
REMOTE_DIR="${REMOTE_DIR:-/opt/fasihi}"

if [[ ! -f "$IMAGE_TAR" ]]; then
  echo "Missing image tarball: $IMAGE_TAR" >&2
  echo "Build with: docker build -f Dockerfile.runtime -t fasihi-crm:local . && docker save fasihi-crm:local | gzip > \$IMAGE_TAR" >&2
  exit 1
fi

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
if [[ -n "${SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "$SSH_KEY")
  RSYNC_RSH="ssh ${SSH_OPTS[*]}"
  ssh_cmd() { ssh "${SSH_OPTS[@]}" "${USER}@${HOST}" "$@"; }
  scp_cmd() { scp "${SSH_OPTS[@]}" "$@"; }
elif [[ -n "${VPS_ROOT_PASSWORD:-}" ]]; then
  export SSHPASS="$VPS_ROOT_PASSWORD"
  ssh_cmd() { sshpass -e ssh "${SSH_OPTS[@]}" "${USER}@${HOST}" "$@"; }
  scp_cmd() { sshpass -e scp "${SSH_OPTS[@]}" "$@"; }
else
  echo "Set VPS_ROOT_PASSWORD or SSH_KEY" >&2
  exit 1
fi

echo "==> Creating ${REMOTE_DIR} on ${HOST}"
ssh_cmd "mkdir -p ${REMOTE_DIR}/deploy ${REMOTE_DIR}/images"

echo "==> Uploading image + compose + Caddyfile"
scp_cmd "$IMAGE_TAR" "${USER}@${HOST}:${REMOTE_DIR}/images/fasihi-crm-local.tar.gz"
scp_cmd "$ROOT/deploy/docker-compose.app.yml" "${USER}@${HOST}:${REMOTE_DIR}/deploy/docker-compose.app.yml"
scp_cmd "$ROOT/deploy/Caddyfile" "${USER}@${HOST}:${REMOTE_DIR}/deploy/Caddyfile"

echo "==> Loading image and starting fasihi-app"
ssh_cmd "docker load < ${REMOTE_DIR}/images/fasihi-crm-local.tar.gz"
ssh_cmd "cd ${REMOTE_DIR}/deploy && docker compose -f docker-compose.app.yml up -d"

echo "==> Installing Caddyfile (API :8080, app :3000) and reloading Caddy"
ssh_cmd "cp ${REMOTE_DIR}/deploy/Caddyfile /opt/fasihi/Caddyfile 2>/dev/null || true"
# Prefer known compose project path if present
ssh_cmd 'bash -s' <<'REMOTE'
set -euo pipefail
CANDIDATES=(
  /opt/fasihi/Caddyfile
  /root/fasihi/Caddyfile
  /opt/fasihi/deploy/Caddyfile
)
TARGET=""
for c in "${CANDIDATES[@]}"; do
  if [[ -f "$c" ]]; then TARGET="$c"; break; fi
done
if [[ -z "$TARGET" ]]; then
  mkdir -p /opt/fasihi
  TARGET=/opt/fasihi/Caddyfile
fi
cp /opt/fasihi/deploy/Caddyfile "$TARGET"
# If caddy mounts a different file, copy into the container config dir too
if docker ps --format '{{.Names}}' | grep -qx fasihi-caddy; then
  docker cp /opt/fasihi/deploy/Caddyfile fasihi-caddy:/etc/caddy/Caddyfile
  docker exec fasihi-caddy caddy validate --config /etc/caddy/Caddyfile
  docker exec fasihi-caddy caddy reload --config /etc/caddy/Caddyfile || docker restart fasihi-caddy
fi
REMOTE

echo "==> Smoke checks"
ssh_cmd 'curl -fsS http://127.0.0.1:3000/ | head -c 200; echo; curl -fsS http://127.0.0.1:8080/api/health; echo'
echo "Done. Verify https://www.fasihicrm.ir (login ceo / ۱۲۳۴۵۶)."
