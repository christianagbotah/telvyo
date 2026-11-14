# Telvyo — Webuzo VPS deployment

**Public URL:** https://telvyo.lightworldtech.com

**Document root:** `/home/lightworld/webapps/telvyo`  
**Private source checkout:** `/home/lightworld/.telvyo-source`  
**Webuzo custom Nginx include:** `/var/webuzo-data/nginx/custom/domains/telvyo.lightworldtech.com.conf`  
**Public release backups:** `/home/lightworld/.telvyo-releases`

The initial VPS deployment was completed on **14 November 2026**. GitHub main commit `5f2347d` was installed as a static web tracker, with Node tests and syntax checks passing on the VPS. The existing domain/SSL vhost was reused; no new port or PM2 service was needed. The public root contains **only `dist/` assets**, not `admin/`, `server/`, `worker/`, source, `.env` files, or API credentials.

## Security boundary

The original owner-admin Worker uses trusted ChatGPT Sites-injected identity headers and a Sites storage binding. **Do not** copy that backend to a standalone public VPS route: identity headers can be forged if an untrusted host accepts them. The VPS Nginx include intentionally blocks `/admin`, `/api`, `/v1`, `/server`, `/tests`, `/worker` and hidden paths. It also applies no-sniff, CSP (allowing CSS inline styles used by the existing app), referrer/permissions and frame restrictions. HTML and service worker have no-cache controls. Verify configuration with `/usr/local/apps/nginx/sbin/nginx -t` before reload.

This is a **public local-first web preview**, not a subscriber-billing backend, working Android APK download or iOS store release. Browser records remain in local storage. No cloud account sync, live carrier balance or cloud AI is offered.

## Repeatable release

On the authorized VPS, review the CI checks for the target GitHub main commit and run:

```bash
sudo bash /home/lightworld/.telvyo-source/scripts/deploy-vps.sh --apply
```

The script fetches main, verifies no uncommitted source edits, runs test and syntax checks, tests Nginx configuration, backs up the live public files, stamps static HTML/module imports/offline cache with the Git SHA, and smoke-tests the origin plus Cloudflare's versioned JavaScript. Cloudflare otherwise may reuse a four-hour-old JavaScript response. Public assets are staged outside the document root before publication. A failed smoke check restores the previous public assets. Backups are **not** a substitute for customer-account database backups if those services are later added.

## Rollback

Use the timestamped release folder reported by the deployment script. As root, copy its contents back to the static root:

```bash
rsync -rlt --delete /home/lightworld/.telvyo-releases/RELEASE_TIMESTAMP/ /home/lightworld/webapps/telvyo/
```

Verify the origin and Cloudflare URL, including `/`, `/app.js`, `/service-worker.js`, and 404 responses for restricted API paths. Browsers with previously installed offline shells may need a reload.

## Remaining release blockers

Approved MTN Ghana/Telecel/AT API contracts, secure customer identity and consent, data provenance reconciliation, backend gateway, durable customer records, signed Android and iOS builds, carrier pilot testing, operational monitoring and privacy/compliance review. Do not call the public preview a full production subscriber-billing product until these gates are closed.
