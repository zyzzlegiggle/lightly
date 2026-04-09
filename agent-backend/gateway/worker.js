export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = request.headers.get("host") || "";
    
    const match = host.match(/^(\d+)-preview\.lightly\.ink$/);
    if (!match) return new Response("Not Found", { status: 404 });
    
    const dropletId = match[1];
    const path = url.pathname + url.search;

    try {
      const cacheKey = `ip:${dropletId}`;
      let dropletIp = await env.LIGHTLY_CACHE?.get(cacheKey);

      if (!dropletIp) {
        const resolveUrl = `${env.BACKEND_URL}/api/gateway/resolve/${dropletId}?secret=${env.GATEWAY_SECRET}`;
        const resp = await fetch(resolveUrl);
        if (!resp.ok) return new Response("Project resolve failed", { status: 502 });
        const data = await resp.json();
        dropletIp = data.dropletIp;
        if (!dropletIp) return new Response("Droplet inactive", { status: 503 });
        if (env.LIGHTLY_CACHE) await env.LIGHTLY_CACHE.put(cacheKey, dropletIp, { expirationTtl: 60 });
      }

      const targetUrl = `http://${dropletIp}:3000${path}`;
      
      // ── CLEAN HEADERS ──
      // Do NOT copy original headers directly; Cloudflare headers cause Error 1003
      const forwardHeaders = new Headers();
      
      // Only copy safe, standard headers
      const safeHeaders = ['accept', 'accept-encoding', 'accept-language', 'authorization', 'content-type', 'cookie', 'user-agent'];
      for (const h of safeHeaders) {
        const val = request.headers.get(h);
        if (val) forwardHeaders.set(h, val);
      }
      
      // Set Host to the IP to satisfy the destination server
      forwardHeaders.set("Host", `${dropletIp}:3000`);

      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers: forwardHeaders,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : null,
        redirect: "manual"
      });
      
      const response = await fetch(proxyRequest);

      const sanitizedHeaders = new Headers(response.headers);
      sanitizedHeaders.delete("X-Frame-Options");
      sanitizedHeaders.delete("Content-Security-Policy");
      sanitizedHeaders.set("Access-Control-Allow-Origin", "*");

      return new Response(response.body, {
        status: response.status,
        headers: sanitizedHeaders,
      });

    } catch (err) {
      return new Response(`Gateway Error: ${err.message}`, { status: 500 });
    }
  },
};
