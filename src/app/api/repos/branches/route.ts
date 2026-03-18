import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fullName = searchParams.get("fullName");

  if (!fullName) {
    return Response.json({ error: "Missing fullName parameter" }, { status: 400 });
  }

  // Find github account for this user
  const userAccounts = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, session.user.id), eq(account.providerId, "github")));

  if (!userAccounts || userAccounts.length === 0) {
    return Response.json({ error: "No GitHub account linked" }, { status: 404 });
  }

  const githubAccount = userAccounts[0];
  const accessToken = githubAccount.accessToken;

  if (!accessToken) {
    return Response.json({ error: "GitHub access token missing" }, { status: 404 });
  }

  // Fetch branches from GitHub
  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}/branches?per_page=100`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
      next: { revalidate: 0 } // no cache
    });

    if (!res.ok) {
      throw new Error("GitHub API responded with status " + res.status);
    }

    const branches = await res.json();
    
    return Response.json({ branches });
  } catch (error: any) {
    console.error("Failed to fetch branches", error);
    return Response.json({ error: "Failed to fetch branches from GitHub" }, { status: 500 });
  }
}
