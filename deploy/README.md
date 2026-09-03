# Deploy Fasihi CRM UI to the VPS (build off-box)

## Why
VPS is 1 vCPU / 1GB RAM. Do **not** run `bun install` / `docker build` there.

## 1) Build on a strong machine (this agent box)
```bash
cd /workspace
docker build -t fasihi-crm:local .
docker save fasihi-crm:local | gzip > /tmp/fasihi-crm-local.tar.gz
```

## 2) Copy image + Caddyfile to VPS
```bash
scp /tmp/fasihi-crm-local.tar.gz root@95.38.182.128:/tmp/
scp deploy/Caddyfile root@95.38.182.128:/opt/fasihi/Caddyfile
scp deploy/docker-compose.app.yml root@95.38.182.128:/opt/fasihi/docker-compose.app.yml
```

## 3) On VPS
```bash
gunzip -c /tmp/fasihi-crm-local.tar.gz | docker load
cd /opt/fasihi && docker compose -f docker-compose.app.yml up -d
# Point Caddy at :3000 instead of Lovable proxy — reload caddy container/volume
docker exec fasihi-caddy caddy reload --config /etc/caddy/Caddyfile
# or restart: docker restart fasihi-caddy
```

## 4) QA
```bash
curl -fsS https://www.fasihicrm.ir/api/health
# expect customers=1352 policies=3499 installments=3112
# Login ceo / ۱۲۳۴۵۶ — UI lists must show raw kind (سواری≠عمر), holderName, — for empties, Persian statusLabel
```

## Secrets
Never commit VPS/DB passwords. Keep them in the host env / Docker secrets only.
