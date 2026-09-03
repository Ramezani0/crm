# Deploy Fasihi CRM UI to the VPS (build off-box)

## Why
VPS is 1 vCPU / 1GB RAM. Do **not** run `bun install` / full image build there.
Use the prebuilt runtime image (`Dockerfile.runtime` / `fasihi-crm:local`).

## One-shot (preferred)
From a machine with root SSH to `95.38.182.128`:

```bash
# Image artifact from the cloud agent, or rebuild:
#   docker build -f Dockerfile.runtime -t fasihi-crm:local .
#   docker save fasihi-crm:local | gzip > /opt/cursor/artifacts/fasihi-crm-local.tar.gz

VPS_ROOT_PASSWORD='…' IMAGE_TAR=/opt/cursor/artifacts/fasihi-crm-local.tar.gz \
  ./deploy/push-to-vps.sh
```

Or `SSH_KEY=~/.ssh/id_ed25519 ./deploy/push-to-vps.sh`.

This loads the image, starts `fasihi-app` on `127.0.0.1:3000`, installs
`deploy/Caddyfile` (API `:8080`, UI `:3000`), and reloads `fasihi-caddy`.

## Manual steps
See older scp/`docker load` flow in git history if needed.

## DNS / CDN
`www.fasihicrm.ir` currently resolves via Arvan Cloud (`185.10.75.58`), not
directly to the VPS IP. After origin cutover, point Arvan origin to
`95.38.182.128` (or disable CDN proxy for API/UI) so `/api/*` and `/` hit Caddy.

## QA
```bash
curl -fsS https://www.fasihicrm.ir/api/health
# expect customers=1352 policies=3499 installments=3112
# Login ceo / ۱۲۳۴۵۶ — raw kind (سواری≠عمر), holderName, — for empties, Persian statusLabel
# Phones should keep leading 0; national IDs stay 10 digits
```

## Secrets
Never commit VPS/DB passwords. Keep them in the host env / Docker secrets only.
