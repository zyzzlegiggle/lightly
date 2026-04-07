import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq } from "drizzle-orm";

const STRIPPED_HEADERS = [
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-embedder-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
];

async function resolveTarget(id: string) {
  try {
    const dbProject = await db.query.project.findFirst({
      where: eq(project.id, id),
    });
    return dbProject?.lastPreviewUrl?.replace(/\/$/, "") || null;
  } catch (err) {
    console.error("[Proxy] DB Lookup failed:", err);
    return null;
  }
}

async function handleProxy(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; path?: string[] }> }
) {
  const { id, path } = await params;
  const subPath = (path ?? []).join("/");
  const proxyBase = `/api/preview/${id}/`;

  const targetBase = await resolveTarget(id);
  if (!targetBase) {
    return new NextResponse("Project or preview URL not found", { status: 404 });
  }

  const targetUrl = new URL(subPath, targetBase + "/");
  req.nextUrl.searchParams.forEach((v, k) => targetUrl.searchParams.set(k, v));

  console.log(`[Proxy] ${req.method} -> ${targetUrl.toString()}`);

  try {
    const upstreamHeaders = new Headers(req.headers);
    
    upstreamHeaders.set("Host", "localhost:3000");
    
    upstreamHeaders.delete("connection");
    upstreamHeaders.delete("keep-alive");

    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: upstreamHeaders,
      body: req.method !== "GET" && req.method !== "HEAD" ? await req.blob() : undefined,
      redirect: "manual",
      cache: "no-store",
    });

    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get("Location");
      if (location) {
        const absoluteLocation = new URL(location, targetBase).toString();
        const proxiedLocation = absoluteLocation.replace(targetBase, proxyBase);
        return NextResponse.redirect(new URL(proxiedLocation, req.url), response.status);
      }
    }

    const contentType = response.headers.get("Content-Type") || "";
    const downstreamHeaders = new Headers(response.headers);

    STRIPPED_HEADERS.forEach(h => downstreamHeaders.delete(h));
    
    downstreamHeaders.set("Access-Control-Allow-Origin", "*");
    downstreamHeaders.set("X-Frame-Options", "ALLOWALL");

    if (contentType.includes("text/html")) {
      let html = await response.text();
      const baseTag = `<base href="${proxyBase}">`;
      
      // Use regex to match <head> with any attributes (e.g. <head lang="en">)
      const headMatch = html.match(/<head([^>]*)>/i);
      if (headMatch) {
        html = html.replace(headMatch[0], `${headMatch[0]}${baseTag}`);
      } else {
        html = baseTag + html;
      }

      return new NextResponse(html, {
        status: response.status,
        headers: downstreamHeaders,
      });
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: downstreamHeaders,
    });

  } catch (err) {
    console.error("[Proxy Error]", err);
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:2rem;color:#666">
        <h3>Preview Link Error</h3>
        <p>Could not reach the sandbox at <code>${targetBase}</code>.</p>
        <p>Ensure your droplet is running and port 3000 is open.</p>
      </body></html>`,
      { status: 502, headers: { "Content-Type": "text/html" } }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const DELETE = handleProxy;
export const PATCH = handleProxy;
export const OPTIONS = async () => new NextResponse(null, { 
  status: 204, 
  headers: { 
    "Access-Control-Allow-Origin": "*", 
    "Access-Control-Allow-Methods": "*", 
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400"
  } 
});
