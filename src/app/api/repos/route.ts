import { getAuthContextResult } from "@/lib/auth-context";

// Frameworks we can actually run on the Droplet sandbox
const SUPPORTED_FRAMEWORKS = ["next", "vite", "react-scripts", "nuxt", "svelte", "astro"];
const FRAMEWORK_LABELS: Record<string, string> = {
  "next": "Next.js",
  "vite": "Vite",
  "react-scripts": "Create React App",
  "nuxt": "Nuxt",
  "svelte": "SvelteKit",
  "astro": "Astro",
  "express": "Express",
  "node": "Node.js",
};

function detectFramework(pkg: any): { framework: string | null; label: string; supported: boolean } {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const scripts = pkg.scripts || {};

  // Check for known frameworks in dependencies
  for (const fw of SUPPORTED_FRAMEWORKS) {
    if (deps[fw]) {
      return { framework: fw, label: FRAMEWORK_LABELS[fw] || fw, supported: true };
    }
  }

  // Check for plain Node.js with a dev or start script
  if (scripts.dev || scripts.start) {
    // Has a runnable script — check if it's a Node.js web server
    if (deps.express || deps.koa || deps.fastify || deps.hono) {
      return { framework: "express", label: FRAMEWORK_LABELS[deps.express ? "express" : "node"], supported: true };
    }
    // Generic Node.js with dev/start script — we can try it
    return { framework: "node", label: "Node.js", supported: true };
  }

  return { framework: null, label: "Unknown", supported: false };
}

export async function GET() {
  const result = await getAuthContextResult();

  if (!result.ok) {
    if (result.reason === "github_not_linked") {
      return Response.json({ error: "github_not_linked" }, { status: 403 });
    }
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { githubToken } = result.ctx;

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

    // Check each repo's package.json for framework detection (batch, parallel)
    const reposWithFramework = await Promise.all(
      pushableRepos.map(async (repo: any) => {
        try {
          const pkgRes = await fetch(
            `https://api.github.com/repos/${repo.full_name}/contents/package.json?ref=${repo.default_branch || "main"}`,
            {
              headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: "application/vnd.github.v3+json",
              },
            }
          );

          if (!pkgRes.ok) {
            // No package.json = not a Node.js project
            return {
              ...repo,
              framework: null,
              frameworkLabel: "Not a Node.js project",
              supported: false,
            };
          }

          const pkgData = await pkgRes.json();
          const pkgContent = JSON.parse(
            Buffer.from(pkgData.content, "base64").toString("utf-8")
          );

          const { framework, label, supported } = detectFramework(pkgContent);

          return {
            ...repo,
            framework,
            frameworkLabel: label,
            supported,
          };
        } catch {
          return {
            ...repo,
            framework: null,
            frameworkLabel: "Unable to detect",
            supported: false,
          };
        }
      })
    );

    // Sort: supported first, then by updated_at
    reposWithFramework.sort((a: any, b: any) => {
      if (a.supported && !b.supported) return -1;
      if (!a.supported && b.supported) return 1;
      return 0; // keep original order (already sorted by updated_at)
    });

    return Response.json({ repos: reposWithFramework });
  } catch (error: any) {
    console.error("Failed to fetch repos", error);
    return Response.json({ error: "Failed to fetch repos from GitHub" }, { status: 500 });
  }
}
