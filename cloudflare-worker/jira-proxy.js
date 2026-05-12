/**
 * Cloudflare Worker — JIRA CORS Proxy for TestForge
 *
 * HOW TO REDEPLOY after this update:
 *   1. Go to https://dash.cloudflare.com
 *   2. Workers & Pages → your worker → Edit code
 *   3. Select all, paste this file, Deploy
 *
 * Security: JIRA API token (Basic Auth) is the real auth layer.
 *   Accepting any origin is safe because without a valid token
 *   JIRA will reject the request anyway.
 */

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})

/** @param {Request} request */
async function handleRequest(request) {
  // Allow any origin — security is provided by the JIRA API token
  const origin = request.headers.get('Origin') || '*'

  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': [
      'Authorization',
      'Content-Type',
      'Accept',
      'X-Jira-Base-Url',
      'X-Atlassian-Token',
    ].join(', '),
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }

  // ── Handle CORS preflight ──────────────────────────────────────────────────
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // ── Require X-Jira-Base-Url header ────────────────────────────────────────
  const jiraBaseUrl = request.headers.get('X-Jira-Base-Url')
  if (!jiraBaseUrl) {
    return new Response(
      JSON.stringify({ error: 'Missing required header: X-Jira-Base-Url' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  // ── Validate target is an Atlassian URL ───────────────────────────────────
  let targetBase
  try {
    targetBase = new URL(jiraBaseUrl.trim().replace(/\/+$/, ''))
  } catch {
    return new Response(
      JSON.stringify({ error: `Invalid X-Jira-Base-Url: "${jiraBaseUrl}"` }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  if (!targetBase.hostname.endsWith('.atlassian.net')) {
    return new Response(
      JSON.stringify({
        error: `X-Jira-Base-Url must point to *.atlassian.net, got: ${targetBase.hostname}`,
      }),
      {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  // ── Build the target JIRA URL ──────────────────────────────────────────────
  const incoming = new URL(request.url)
  const targetUrl = targetBase.origin + incoming.pathname + incoming.search

  // ── Forward headers (strip Cloudflare / browser internals) ────────────────
  const forwardHeaders = new Headers()
  for (const [key, value] of request.headers.entries()) {
    const lower = key.toLowerCase()
    if (
      lower === 'host' ||
      lower === 'origin' ||
      lower === 'referer' ||
      lower === 'x-jira-base-url' ||
      lower === 'x-forwarded-for' ||
      lower === 'x-real-ip' ||
      // Strip browser cookies so JIRA uses only Basic Auth.
      // If cookies are forwarded, JIRA sees a session and enforces XSRF checks.
      lower === 'cookie' ||
      lower === 'set-cookie' ||
      // Strip Sec-Fetch headers — they can trigger CSRF protection
      lower.startsWith('sec-') ||
      lower.startsWith('cf-')
    ) continue
    forwardHeaders.set(key, value)
  }

  // ── Inject headers JIRA requires for server-side Basic Auth requests ───────
  // X-Atlassian-Token: no-check  — bypasses JIRA's XSRF token check
  // User-Agent override           — prevents JIRA treating request as a browser
  // Cookie: ''                    — explicitly blank to suppress session lookup
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    forwardHeaders.set('X-Atlassian-Token', 'no-check')
  }
  forwardHeaders.set('User-Agent', 'TestForge-JIRA-Proxy/1.0 (Cloudflare Worker)')
  // Remove any residual cookie the browser snuck in
  forwardHeaders.delete('cookie')

  // ── Proxy to JIRA ──────────────────────────────────────────────────────────
  let jiraRes
  try {
    jiraRes = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'follow',
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Worker fetch to JIRA failed: ${String(err)}`, targetUrl }),
      {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  // ── Build safe response headers ────────────────────────────────────────────
  // Copy only safe headers from the JIRA response.
  // We skip Set-Cookie, X-Frame-Options, CSP, and other security directives
  // that would be applied to the *browser* context rather than JIRA's origin.
  const SKIP_RESPONSE_HEADERS = new Set([
    'set-cookie',
    'x-frame-options',
    'content-security-policy',
    'content-security-policy-report-only',
    'strict-transport-security',
    'x-content-type-options',
    'x-xss-protection',
    'referrer-policy',
    // Don't let JIRA's CORS headers conflict with our own
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers',
    'access-control-allow-credentials',
    'access-control-max-age',
    'vary',
  ])

  const responseHeaders = new Headers()
  for (const [k, v] of jiraRes.headers.entries()) {
    if (!SKIP_RESPONSE_HEADERS.has(k.toLowerCase())) {
      responseHeaders.set(k, v)
    }
  }
  // Apply our CORS headers on top
  for (const [k, v] of Object.entries(corsHeaders)) {
    responseHeaders.set(k, v)
  }
  // Debug header — shows the proxied URL for easy troubleshooting
  responseHeaders.set('X-Proxied-To', targetUrl)

  return new Response(jiraRes.body, {
    status: jiraRes.status,
    statusText: jiraRes.statusText,
    headers: responseHeaders,
  })
}
