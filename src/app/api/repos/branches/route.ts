import { getAuthContext } from "@/lib/auth-context";

export async function GET(request: Request) {
  const ctx = await getAuthContext();

  if (!ctx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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
