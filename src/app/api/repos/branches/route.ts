import { getAuthContextResult } from "@/lib/auth-context";

export async function GET(request: Request) {
  const result = await getAuthContextResult();
  if (!result.ok) {
    return Response.json({ error: result.reason === "github_not_linked" ? "github_not_linked" : "Unauthorized" }, { status: result.reason === "github_not_linked" ? 403 : 401 });
  }

  const ctx = result.ctx;

  const { searchParams } = new URL(request.url);
  const fullName = searchParams.get("fullName");

  if (!fullName) {
    return Response.json({ error: "Missing fullName parameter" }, { status: 400 });
  }

  const { githubToken } = ctx;

  // Fetch branches from GitHub using token from Token Vault
  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}/branches?per_page=100`, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
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
