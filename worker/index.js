// SnipeGolf v3 — CF Worker (privacy proxy + CORS)
// Generic passthrough to Apps Script /exec. Strips emails as safety net.
// Deploy: Cloudflare → Workers & Pages → Edit existing twilight-recipe-e213 → paste this → Save and Deploy.

const APPS_SCRIPT_EXEC = 'https://script.google.com/macros/s/AKfycbyOyPYQKZYonF-o2rsE5iThmZkCDmXP1CFguAQFWzvwiCeAMd-oAWYdiO9HdnvE-mcu3A/exec';

const ALLOWED_ORIGINS = [
  'https://snipegolf.github.io',
  'https://snipegolf.pages.dev',
  'https://snipegolfclothing.com',
  'https://www.snipegolfclothing.com',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
];

function cors(origin) {
  const allow = ALLOWED_ORIGINS.indexOf(origin) >= 0 ? origin : 'https://snipegolf.github.io';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

const cache = caches.default;

// Safety net: never let an email escape the Worker, even if Apps Script slips up.
function stripEmails(obj) {
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map(stripEmails);
  if (typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) {
      if (k === 'email' || k === 'admin_email' || k === 'admin_phone') continue;
      out[k] = stripEmails(obj[k]);
    }
    return out;
  }
  return obj;
}

async function passthroughGet(url, ttl) {
  const target = APPS_SCRIPT_EXEC + url.search;
  if (ttl > 0) {
    const req = new Request(target, { cf: { cacheTtl: ttl, cacheEverything: true } });
    let res = await cache.match(req);
    if (!res) {
      res = await fetch(req, { redirect: 'follow' });
      if (res.ok) {
        const cloned = new Response(res.body, res);
        cloned.headers.set('Cache-Control', 'public, max-age=' + ttl);
        await cache.put(req, cloned.clone());
        res = cloned;
      }
    }
    return res.json();
  }
  const res = await fetch(target, { redirect: 'follow' });
  return res.json();
}

// Stale-while-revalidate: returns cached JSON immediately if available; refetches in background.
// On upstream failure or {ok:false}, returns the last good cached response (with `stale:true`).
async function passthroughGetSWR(url, ttl, ctx) {
  const target = APPS_SCRIPT_EXEC + url.search;
  // Use a stable cache key that ignores the host portion changing
  const cacheKey = new Request('https://swr.snipegolf.local' + url.pathname + url.search);
  const stale = await cache.match(cacheKey);
  const refresh = async () => {
    try {
      const res = await fetch(target, { redirect: 'follow' });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.ok === false) return null; // don't poison cache with errors
      const respToCache = new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=' + (ttl * 8) }
      });
      // store under long TTL so we always have something to serve on outage
      if (ctx && ctx.waitUntil) {
        ctx.waitUntil(cache.put(cacheKey, respToCache.clone()));
      } else {
        await cache.put(cacheKey, respToCache.clone());
      }
      return data;
    } catch (e) {
      return null;
    }
  };
  if (stale) {
    const staleAge = parseInt(stale.headers.get('Age') || '0', 10);
    // If stale is fresh enough, just return it without revalidation
    if (staleAge < ttl) {
      return await stale.json();
    }
    // Otherwise return stale + revalidate in background
    if (ctx && ctx.waitUntil) ctx.waitUntil(refresh());
    const data = await stale.json();
    return Object.assign({}, data, { stale: true, stale_age_s: staleAge });
  }
  // No cache yet — must fetch synchronously
  const fresh = await refresh();
  if (fresh) return fresh;
  // Upstream dead AND no cache — return graceful error
  return { ok: false, error: 'upstream_unavailable' };
}

async function passthroughPost(body) {
  const res = await fetch(APPS_SCRIPT_EXEC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'follow'
  });
  return res.json();
}

// TTL per route (seconds). Picks/participants update often; brackets rarely.
function ttlFor(route) {
  if (route === 'brackets' || route === 'comp' || route === 'league') return 60;
  if (route === 'participants' || route === 'picks') return 30;
  if (route === 'field' || route === 'leaderboard') return 30;
  if (route === 'mypick') return 0; // never cache personal data
  if (route === 'ping') return 0;
  return 0;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    headers['Content-Type'] = 'application/json';

    try {
      // Health
      if (url.pathname === '/' || url.pathname === '/api' || url.pathname === '/api/ping') {
        return new Response(JSON.stringify({
          ok: true,
          service: 'snipegolf-v3-proxy',
          endpoints: [
            'GET  /api/ping',
            'GET  /api/comp?slug=...',
            'GET  /api/league/:slug',
            'GET  /api/brackets?comp=...',
            'GET  /api/participants?league=...',
            'GET  /api/picks?league=...',
            'GET  /api/mypick?pid=...&t=...',
            'POST /api/submitPick'
          ]
        }), { headers });
      }

      // POST /api/<route> → forward body to Apps Script with route attached
      const mPost = url.pathname.match(/^\/api\/([a-zA-Z_]+)$/);
      if (mPost && request.method === 'POST') {
        const route = mPost[1];
        const body = await request.json().catch(() => ({}));
        body.route = route;
        const data = await passthroughPost(body);
        return new Response(JSON.stringify(stripEmails(data)), { headers });
      }

      // GET /api/league/:slug → ?route=league&slug=:slug
      const mLeague = url.pathname.match(/^\/api\/league\/([^/]+)$/);
      if (mLeague && request.method === 'GET') {
        const target = new URL(APPS_SCRIPT_EXEC);
        target.searchParams.set('route', 'league');
        target.searchParams.set('slug', mLeague[1]);
        const proxyUrl = new URL('https://x/x' + '?' + target.searchParams.toString());
        const data = await passthroughGet(proxyUrl, ttlFor('league'));
        return new Response(JSON.stringify(stripEmails(data)), { headers });
      }

      // Generic GET /api/<route>?... → /exec?route=<route>&...
      const mRoute = url.pathname.match(/^\/api\/([a-zA-Z_]+)$/);
      if (mRoute && request.method === 'GET') {
        const route = mRoute[1];
        const params = new URLSearchParams(url.search);
        params.set('route', route);
        const proxyUrl = new URL('https://x/x?' + params.toString());
        const ttl = ttlFor(route);
        // Use SWR for routes where stale data is safer than no data
        let data;
        if (route === 'field' || route === 'leaderboard') {
          data = await passthroughGetSWR(proxyUrl, ttl, ctx);
        } else {
          data = await passthroughGet(proxyUrl, ttl);
        }
        return new Response(JSON.stringify(stripEmails(data)), { headers });
      }

      return new Response(JSON.stringify({ ok: false, error: 'not_found', path: url.pathname }), { status: 404, headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 500, headers });
    }
  }
};
