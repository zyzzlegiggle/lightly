import { auth0 } from "@/lib/auth0";
import { getAuthContext } from "@/lib/auth-context";

export async function GET() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { githubToken } = ctx;

  // Fetch repos from GitHub using the token from Token Vault
  try {
    const res = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
      headers: {
        Authorization: `Bearer ${githubToken}`,
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
