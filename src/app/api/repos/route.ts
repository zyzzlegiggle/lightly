import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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

  // Fetch repos from GitHub
  try {
    const res = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
      next: { revalidate: 0 } // no cache
    });

    if (!res.ok) {
      throw new Error("GitHub API responded with status " + res.status);
    }

    const repos = await res.json();
    
    // Filter for permissions.push: true
    const pushableRepos = repos.filter((r: any) => r.permissions && r.permissions.push);

    return Response.json({ repos: pushableRepos });
  } catch (error: any) {
    console.error("Failed to fetch repos", error);
    return Response.json({ error: "Failed to fetch repos from GitHub" }, { status: 500 });
  }
}
