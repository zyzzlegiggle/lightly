/**
 * Lightly Preview Gateway — Cloudflare Worker
 * 
 * Proxies https://{droplet_id}.preview.lightly.ink/path
 * to http://{droplet_ip}:3000/path
 * 
 * Instructions:
 * 1. Create a Cloudflare Worker
 * 2. Paste this code
 * 3. Set Environment Variable: BACKEND_URL (your FastAPI URL)
 * 4. Set Environment Variable: GATEWAY_SECRET (must match your backend's GATEWAY_SECRET)
 * 5. Add Custom Domain: *.preview.lightly.ink
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = request.headers.get("host") || "";
    
    // 1. Extract droplet_id from subdomain (e.g., 4612345.preview.lightly.ink)
    const match = host.match(/^(\d+)\.preview\.lightly\.ink$/);
    if (!match) {
      return new Response("Not Found", { status: 404 });
    }
    
    const dropletId = match[1];
    const path = url.pathname + url.search;

    try {
      // 2. Resolve Droplet IP from backend
      // We use a cache in Cloudflare for speed (1-minute TTL)
      const cacheKey = `ip:${dropletId}`;
      let dropletIp = await env.LIGHTLY_CACHE?.get(cacheKey);

      if (!dropletIp) {
        const resolveUrl = `${env.BACKEND_URL}/api/gateway/resolve/${dropletId}?secret=${env.GATEWAY_SECRET}`;
        const resp = await fetch(resolveUrl);
        if (!resp.ok) {
          return new Response("Project resolve failed", { status: 502 });
        }
        const data = await resp.json();
        dropletIp = data.dropletIp;
        
        if (!dropletIp) {
          return new Response("Project not active", { status: 503 });
        }

        // Cache the IP for 1 minute
        if (env.LIGHTLY_CACHE) {
          await env.LIGHTLY_CACHE.put(cacheKey, dropletIp, { expirationTtl: 60 });
        }
      }

      // 3. Proxy request to Droplet
      const targetUrl = `http://${dropletIp}:3000${path}`;
      
      // Copy original request but change target
      const newRequest = new Request(targetUrl, request);
      
      // Fetch from droplet
      const response = await fetch(newRequest);

      // 4. Sanitize Headers (Allow Iframing)
      const newHeaders = new Headers(response.headers);
      newHeaders.delete("X-Frame-Options");
      newHeaders.delete("Content-Security-Policy");
      
      // Add CORS if needed
      newHeaders.set("Access-Control-Allow-Origin", "*");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });

    } catch (err) {
      return new Response(`Gateway Error: ${err.message}`, { status: 500 });
    }
  },
};
