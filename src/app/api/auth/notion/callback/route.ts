import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";

/**
 * Direct Notion OAuth callback — exchanges code with Notion's API.
 * Notion uses Basic auth (base64 of client_id:client_secret) for token exchange.
 */
export async function GET(req: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const returnedState = searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("notion_state")?.value;
  cookieStore.delete("notion_state");

  if (error || !code) {
    console.error(`[Notion Callback] Denied: ${error}`);
    return Response.redirect(`${appUrl}/settings?error=notion_denied`);
  }

  if (expectedState && returnedState !== expectedState) {
    console.error("[Notion Callback] State mismatch");
    return Response.redirect(`${appUrl}/settings?error=notion_state_mismatch`);
  }

  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.redirect(`${appUrl}/api/auth/login`);
  }

  const userId = session.user.sub;
  const clientId = process.env.NOTION_CLIENT_ID!;
  const clientSecret = process.env.NOTION_CLIENT_SECRET!;
  const callbackUrl = `${appUrl}/api/auth/notion/callback`;

  try {
    // Notion uses Basic auth for token exchange
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenResp = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUrl,
      }),
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.text();
      console.error("[Notion Callback] Token exchange failed:", err);
      return Response.redirect(`${appUrl}/settings?error=notion_exchange_failed`);
    }

    const data = await tokenResp.json();
    const notionToken = data.access_token;
    const workspaceId = data.workspace_id || "notion";
    const workspaceName = data.workspace_name || "Notion Workspace";

    if (!notionToken) {
      console.error("[Notion Callback] No access token");
      return Response.redirect(`${appUrl}/settings?error=notion_no_token`);
    }

    console.log(`[Notion Callback] Got token for workspace "${workspaceName}"`);

    // Upsert in account table
    const existing = await db.query.account.findFirst({
      where: and(eq(account.userId, userId), eq(account.providerId, "notion")),
    });

    if (existing) {
      await db.update(account)
        .set({ accessToken: notionToken, accountId: workspaceId, idToken: workspaceName, updatedAt: new Date() })
        .where(eq(account.id, existing.id));
    } else {
      await db.insert(account).values({
        id: crypto.randomUUID(),
        userId,
        providerId: "notion",
        accountId: workspaceId,
        accessToken: notionToken,
        idToken: workspaceName,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    console.log(`[Notion Callback] ✓ Connected "${workspaceName}" for user ${userId}`);
    return Response.redirect(`${appUrl}/settings?connected=notion`);

  } catch (e: any) {
    console.error("[Notion Callback] Error:", e);
    return Response.redirect(`${appUrl}/settings?error=notion_denied`);
  }
}
