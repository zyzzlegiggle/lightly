import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

/**
 * GET /api/connections?provider=google-oauth2
 * Returns whether the current user has a connected account for the given provider.
 */
export async function GET(req: Request) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.json({ connected: false }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const provider = searchParams.get("provider");

  if (!provider) {
    // Return all connected providers
    const accounts = await db.query.account.findMany({
      where: eq(account.userId, session.user.sub),
    });
    return Response.json({
      connected: accounts.map((a) => a.providerId),
    });
  }

  const existing = await db.query.account.findFirst({
    where: and(
      eq(account.userId, session.user.sub),
      eq(account.providerId, provider)
    ),
  });

  return Response.json({ connected: !!existing });
}
