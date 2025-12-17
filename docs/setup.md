# Production Setup Guide

## Where to Start

**If you're starting fresh (cloned repo, no local setup):**
→ Follow the Quick Start commands in `README.md`, then continue below

**If you already have local dev working with test keys:**
→ Skip to [Production Setup](#production-setup-first-time)

**If production is already deployed and you're updating:**
→ Skip to [Continuous Deployment](#continuous-deployment)

---

## Placeholder Legend

Use these tokens whenever an instruction requires project-specific values.

| Placeholder | Description |
| --- | --- |
| `<your-pages-project-name>` | Cloudflare Pages project slug used in Wrangler commands and the dashboard. |
| `<your-cleanup-worker-name>` | Scheduled worker name defined in `wrangler.cleanup.toml`. |
| `<your-d1-database-name>` | Cloudflare D1 database name referenced in config and CLI commands. |
| `<your-d1-database-id>` | D1 database ID returned by `wrangler d1 create`. |
| `<your-kv-namespace-id>` / `<your-kv-preview-id>` | KV namespace identifiers bound to `RATE_LIMIT_KV`. |
| `<your-domain>` | Public site domain, for example `https://your-event.com`. |
| `<your-admin-app-name>` | Friendly Cloudflare Access application name for `/admin/*`. |
| `<your-access-team-subdomain>` | Zero Trust team subdomain (no protocol), e.g., `example.cloudflareaccess.com`. |
| `<your-access-jwt-issuer>` | `https://<your-access-team-subdomain>` stored in `ACCESS_JWT_ISS`. |
| `<your-access-aud-tag>` | Audience tag copied from the Access application. |
| `<your-from-email>` | Gmail sender address in `Name <user@domain>` format. |
| `<your-email-assets-project-id>` | Asset library identifier used in `src/lib/emailAssets.ts`. |
| `<your-site-name>` | Marketing/site name used in `public/index.html`. |
| `<your-site-emblem-alt>` | Alt text for the emblem in `public/index.html`. |
| `<your-stripe-webhook-name>` | Friendly label for your Stripe webhook destination. |
| `<your-stripe-webhook-url>` | URL that receives Stripe webhook events (`https://<your-domain>/stripe/webhook`). |

## Initial Setup

> Skip this section if you already have local development working

### Prerequisites
- Cloudflare account
- Google Workspace
- Gmail API credentials configured
- Stripe account with API keys
- Domain configured in Cloudflare (`<your-domain>`)

---

## Production Setup (First Time)

> Start here if you have local dev working and are deploying to production for the first time

### 1. Create D1 Database
```bash
wrangler d1 create <your-d1-database-name>
# Copy the database_id from output (save it as <your-d1-database-id>)
```

### 2. Update Configuration Files

#### wrangler.toml
```toml
[[d1_databases]]
binding = "DB"
database_name = "<your-d1-database-name>"
database_id = "<your-d1-database-id>"
```

#### wrangler.cleanup.toml
```toml
[[d1_databases]]
binding = "DB"
database_name = "<your-d1-database-name>"
database_id = "<your-d1-database-id>"
```

### 3. Run Database Migrations
```bash
npm run migrate
# Verify: wrangler d1 execute <your-d1-database-name> --command="SELECT name FROM sqlite_master WHERE type='table';"
```

### 4. Generate Encryption Key
```bash
# Generate KEK_B64
openssl rand -base64 32
# Save this key securely - it cannot be recovered if lost
```

### 5. Configure Secrets in Cloudflare Dashboard

Go to Workers & Pages → <your-pages-project-name> → Settings → Variables and Secrets

Add these secrets (START WITH TEST KEYS, swap to production after testing):
- `KEK_B64` - From step 4
- `TURNSTILE_SITE_KEY` - From Cloudflare Turnstile
- `TURNSTILE_SECRET_KEY` - From Cloudflare Turnstile
- `GMAIL_CLIENT_ID` - From Google Cloud Console
- `GMAIL_CLIENT_SECRET` - From Google Cloud Console
- `GMAIL_REFRESH_TOKEN` - From OAuth flow
- `GMAIL_FROM` - `<your-from-email>`
- `APP_BASE_URL` - `https://<your-domain>`
- `ACCESS_AUD` - `<your-access-aud-tag>` from the Cloudflare Access application (see step 7) - Required for JWT validation (unless `DEV_MODE=true`)
- `ACCESS_JWT_ISS` - `<your-access-jwt-issuer>` (`https://<your-access-team-subdomain>`)
- `ACCESS_CERTS_CACHE_MIN` - Minutes to cache Access JWKS responses (default `5`; increase if JWKS endpoint rate limits)
- `RSVP_SUBMISSIONS_PER_10MIN` - Number of RSVP submissions allowed per guest/IP in a 10 minute window (set to 20 for production)
- `STRIPE_SECRET_KEY` - TEST key for initial setup (sk_test_), swap to LIVE key (sk_live_) after testing
- `STRIPE_PUBLISHABLE_KEY` - TEST key for initial setup (pk_test_), swap to LIVE key (pk_live_) after testing
- `STRIPE_WEBHOOK_SECRET` - From Stripe TEST webhook endpoint, swap to LIVE webhook after testing

### 6. Create KV Namespace (Required for Production)
```bash
# Required for rate limiting in production (optional only with DEV_MODE=true)
wrangler kv namespace create "RATE_LIMIT_KV"
# Copy BOTH the id and preview_id from output

# Update wrangler.toml:
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "<your-kv-namespace-id>"
preview_id = "<your-kv-preview-id>"
```

### 7. Configure Cloudflare Access

#### Find Your Team Name
1. Go to https://one.dash.cloudflare.com
2. Settings → General
3. Team domain: `<your-access-team-subdomain>`

#### Configure Google OAuth
1. Google Cloud Console → Create OAuth 2.0 Client
2. Authorized redirect URI: `https://<your-access-team-subdomain>/cdn-cgi/access/callback`
3. Add client ID/secret to Cloudflare Zero Trust → Settings → Authentication

#### Create Access Application
1. Zero Trust → Access → Applications → Add
2. Type: Self-hosted
3. Name: `<your-admin-app-name>`
4. Domain: `<your-domain>`
5. Path: `/admin/*`
6. Create policy with your email domain

#### Get ACCESS_AUD
1. View the created application
2. Copy the Audience (AUD) tag
3. Add `<your-access-aud-tag>` to Cloudflare secrets (step 5)

#### Enable JWT validation (no static keys required)
1. Our worker now downloads signing keys from `https://<team-domain>.cloudflareaccess.com/cdn-cgi/access/certs` automatically.
2. Make sure `ACCESS_JWT_ISS` matches your team domain (for example `https://<your-access-team-subdomain>`).
3. Optionally adjust `ACCESS_CERTS_CACHE_MIN` (default `5`) if the JWKS endpoint rate-limits your traffic.
4. To test:
   - Visit `https://<team-domain>.cloudflareaccess.com/cdn-cgi/access/certs` and confirm it returns JSON with `keys` and `public_certs`.
   - Hit `/admin` locally with `DEV_MODE=false` and a freshly obtained Access token; you should see the dashboard.
   - Tamper with the token (or use the wrong account) and verify the worker returns `401`.

### 8. Configure WAF Rate Limits

In Cloudflare Dashboard → Security → WAF → Rate limiting rules:

#### Rule 1: Invite Protection
- Expression: `(http.request.uri.path eq "/invite") and (http.request.method eq "POST")`
- Threshold: 5 requests per 10 minutes
- Action: Block

#### Rule 2: Verify Protection
- Expression: `(http.request.uri.path contains "/auth/verify")`
- Threshold: 15 requests per 10 minutes
- Action: Challenge

### 9. Deploy to Production
```bash
# Build assets
npm run build

# Deploy
wrangler pages deploy ./public --project-name=<your-pages-project-name>
```

### 10. Configure Stripe Webhook
1. Stripe Dashboard → Webhooks → Add destination
2. Events: `checkout.session.completed` (also handles `checkout.session.async_payment_failed` for logging)
3. Setup:
  - Events from: leave “Your account” (we only need live account events). Use the test/live switch at the top of
    Stripe when you want to hit staging.
  - Payload style: Snapshot is fine—Stripe defaults to that and our handler expects the standard payload.
  - API version: Keep it at the current date unless you need to pin to an older version. Our code handles the default
    2025-09-30 version, so you can leave it as-is; if you ever change it, update the handler tests to match.
  - Listening to: make sure `checkout.session.completed` is the only event checked (exactly what our webhook expects).
  - Destination name: `<your-stripe-webhook-name>`
  - Endpoint URL: `<your-stripe-webhook-url>` (typically `https://<your-domain>/stripe/webhook`)
  - Description: `<your-pages-project-name> worker webhook`
4. Copy signing secret to Cloudflare secrets (STRIPE_WEBHOOK_SECRET)
5. Click `Send test events` in Stripe Web UI.

### 11. Schedule Cleanup Worker
```bash
wrangler deploy --config wrangler.cleanup.toml
```

### 12. Verify Deployment
- Public page: `https://<your-domain>`
- Admin (requires Access): `https://<your-domain>/admin/`
- Test invite flow with Turnstile
- Test Stripe checkout

## Continuous Deployment

> Use this section for updates after production is already live

### Pushing Updates to Production

#### Code Updates
```bash
# 1. Test locally first
npm run dev

# 2. Build and deploy new code
npm run build
wrangler pages deploy ./public --project-name=<your-pages-project-name>
```

#### Database Schema Changes
```bash
# 1. Create new migration file (if schema changes)
# migrations/0002_add_new_table.sql

# 2. Test migration locally
npm run migrate:local

# 3. Apply to production
npm run migrate
```

#### Secret/Config Updates
```bash
# Option A: Via Dashboard (recommended)
# Workers & Pages → <your-pages-project-name> → Settings → Variables and Secrets

# Option B: Via CLI
wrangler pages secret put SECRET_NAME --project-name=<your-pages-project-name>
```

#### KV Updates
KV data syncs automatically - no manual push needed. Rate limit counters are ephemeral.

#### Important Notes
- Code deploys are instant (edge propagation ~30 seconds)
- Database migrations are permanent - test locally first!
- Secret changes require redeploy: `wrangler pages deploy ./public --project-name=<your-pages-project-name>`
- KV is eventually consistent (updates may take 60 seconds globally)

### Syncing Local with Production

#### Fresh Local Start (Match Empty Production)
To reset local to match your new empty production database:

```bash
# 1. Delete your old test-filled local database
rm -f .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite

# 2. Recreate local database (empty, like production)
npm run migrate:local

# 3. Verify it's empty
wrangler d1 execute <your-d1-database-name> --local --command="SELECT COUNT(*) FROM guests;"
# Should return 0
```

#### Sync Production Data to Local (After Go-Live)
Once you have real data in production and want to work with it locally:

```bash
# 1. Export production database
wrangler d1 export <your-d1-database-name> --remote --output=prod-backup.sql

# 2. Delete local database
rm -f .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite
rm -f .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite-shm
rm -f .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite-wal

# 3. Recreate structure
npm run migrate:local

# 4. If import fails, it might be due to extra files. Run delete commands below, and start import --local again
rm -f .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite-shm
rm -f .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite-wal

# 5. Import production data
wrangler d1 execute <your-d1-database-name> --local --file=prod-backup.sql

# 6. Delete backup .sql file
```

**⚠️ Security Note:** Production data contains encrypted PII. Keep exports secure!

## Critical Commands Reference

```bash
# Database
wrangler d1 execute <your-d1-database-name> --command="SQL"          # Production query
wrangler d1 execute <your-d1-database-name> --local --command="SQL"  # Local query
wrangler d1 info <your-d1-database-name>                             # Get database info
wrangler d1 list                                        # List all databases

# Secrets (if not using dashboard) - for Pages use:
wrangler pages secret put SECRET_NAME --project-name=<your-pages-project-name>

# Logs
wrangler pages tail --project-name=<your-pages-project-name>

# Deployment history
wrangler pages deployment list --project-name=<your-pages-project-name>
```

## Troubleshooting

### Access Issues
- Verify ACCESS_AUD matches your application
- Check Google OAuth redirect URI exactly matches: `https://<your-access-team-subdomain>/cdn-cgi/access/callback`
- Ensure email domain in policy is correct

### Database Issues
- Verify database_id in both wrangler.toml files
- Check migrations ran: `SELECT * FROM d1_migrations`
- Ensure KEK_B64 is correctly set in secrets

### Email Issues
- Verify GMAIL_REFRESH_TOKEN hasn't expired
- Check GMAIL_FROM format
- Ensure Gmail API is enabled in Google Cloud

### Turnstile Issues
- Verify site key matches between frontend and backend
- Check domain is added to Turnstile widget
- Ensure secret key is in production secrets

## Pre-Production Checklist

### Email Subject Lines
Email subjects are configured through the admin panel and stored in `EventDetails`:
- `EventDetails.magicLinkEmailSubject` - Subject for magic link emails
- `EventDetails.inviteEmailSubject` - Subject for invitation emails

If not set, fallback subjects will display "TODO: Set your ... email subject in admin panel".

### Security Verification
- [ ] KEK_B64 generated with `openssl rand -base64 32`
- [ ] Started with test keys, verified everything works
- [ ] All test keys replaced with production keys
- [ ] Stripe live keys (start with sk_live_ and pk_live_)
- [ ] Cloudflare Access configured (ACCESS_AUD and ACCESS_JWT_ISS set for JWT validation)
- [ ] WAF rate limits active
- [ ] Turnstile production keys configured
- [ ] No .dev.vars or secrets in git
- [ ] Database empty (no test data)

### Testing Order (with TEST keys)
1. Deploy with ALL TEST keys (Stripe test keys, Turnstile test keys)
2. Verify Turnstile loads on /invite
3. Test magic link email flow
4. Verify /admin/* requires Google auth
5. Test Stripe checkout (confirm test mode works)

### Go-Live Steps
6. Update ALL secrets to production keys in Cloudflare dashboard:
   - Stripe: sk_live_, pk_live_, and production webhook secret
   - Turnstile: Production site and secret keys
   - Keep everything else the same
7. Redeploy: `wrangler pages deploy ./public --project-name=<your-pages-project-name>`
8. Final verification with live keys
