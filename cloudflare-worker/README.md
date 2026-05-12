# TestForge — JIRA CORS Proxy (Cloudflare Worker)

A free Cloudflare Worker that acts as a CORS proxy between your React app and the JIRA REST API v3.

## Why is this needed?

Browsers block cross-origin requests to `*.atlassian.net` unless JIRA explicitly allows your domain. This Worker adds the correct `Access-Control-*` headers so the browser is satisfied.

## Deploy in 3 steps (free, no credit card)

### 1. Sign up for Cloudflare (free)
Go to https://dash.cloudflare.com/sign-up — no credit card required.

### 2. Install Wrangler CLI and log in

```bash
npm install -g wrangler
wrangler login
```

### 3. Deploy

```bash
cd cloudflare-worker
wrangler deploy
```

After deploy, you'll see output like:
```
Published testforge-jira-proxy (0.12 sec)
  https://testforge-jira-proxy.<your-account>.workers.dev
```

**Copy that URL** — you'll paste it into the JIRA Settings page in TestForge.

---

## Configure in TestForge

1. Open TestForge → **Settings** tab (Admin only)
2. Enable JIRA integration and fill in your credentials
3. In the **Proxy URL** field paste your worker URL:
   ```
   https://testforge-jira-proxy.<your-account>.workers.dev
   ```
4. Click **Test Connection** — it should show ✓ Connected

---

## How it works

```
React App → Cloudflare Worker → JIRA REST API v3
           (adds CORS headers)
```

The Worker:
- Reads `X-Jira-Base-Url` header to know your JIRA instance
- Forwards your `Authorization: Basic ...` header to JIRA
- Returns the JIRA response with `Access-Control-Allow-Origin` set

## Security

- Only proxies requests to `*.atlassian.net` (hardcoded check)
- Edit `ALLOWED_ORIGINS` in `jira-proxy.js` to restrict which domains can use the proxy
- Your API token is never stored in the Worker — it's passed per-request from the browser

## Free tier limits

| Limit | Value |
|---|---|
| Requests/day | 100,000 |
| CPU time/request | 10ms |
| Memory | 128MB |
| Price | Free forever |

For a typical QA team this is more than enough (even 1,000 bug syncs/day is just 1% of the limit).
