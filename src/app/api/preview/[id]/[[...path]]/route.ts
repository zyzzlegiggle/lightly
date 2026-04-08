import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq } from "drizzle-orm";

async function resolveTarget(id: string): Promise<string | null> {
  try {
    const dbProject = await db.query.project.findFirst({
      where: eq(project.id, id),
    });
    const url = dbProject?.lastPreviewUrl?.replace(/\/$/, "");
    console.log(`[Proxy] DB lookup for ${id}: ${url || "(not found)"}`);
    return url || null;
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
    return new NextResponse(
      `<html><body><h3>Preview not ready</h3><p>No preview URL found for project ${id}. The sandbox may still be starting.</p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html" } }
    );
  }

  // Build target URL
  const targetUrl = `${targetBase}/${subPath}`;
  console.log(`[Proxy] ${req.method} -> ${targetUrl}`);

  try {
    // Fetch from the Droplet with a clean Host header
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        "Host": "localhost:3000",
        "Accept": req.headers.get("accept") || "*/*",
        "Accept-Language": req.headers.get("accept-language") || "en",
        "User-Agent": "Lightly-Proxy/1.0",
      },
      redirect: "follow",
      cache: "no-store",
    });

    console.log(`[Proxy] Response: ${response.status} ${response.headers.get("content-type")}`);

    const contentType = response.headers.get("Content-Type") || "application/octet-stream";

    // Build CLEAN downstream headers from scratch — no forwarding of upstream encoding headers
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
    };

    // For HTML responses: read text, inject <base> tag
    if (contentType.includes("text/html")) {
      let html = await response.text();
      console.log(`[Proxy] HTML response: ${html.length} chars`);

      const baseTag = `<base href="${proxyBase}">`;
      const headMatch = html.match(/<head([^>]*)>/i);
      if (headMatch) {
        html = html.replace(headMatch[0], `${headMatch[0]}${baseTag}`);
      } else {
        html = baseTag + html;
      }

      return new NextResponse(html, { status: response.status, headers });
    }

    // For all other responses: read the full body as bytes and return it cleanly
    // This avoids all content-encoding/transfer-encoding double-decompression issues
    const body = await response.arrayBuffer();
    return new NextResponse(body, { status: response.status, headers });

  } catch (err: any) {
    console.error("[Proxy Error]", err?.message || err);
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:2rem;color:#666">
        <h3>Preview Unavailable</h3>
        <p>Could not reach the sandbox at <code>${targetBase}</code>.</p>
        <p>Error: ${err?.message || "Connection failed"}</p>
        <p>The droplet may still be starting up. Try refreshing.</p>
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
  headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*" }
});
