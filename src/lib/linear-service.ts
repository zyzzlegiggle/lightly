import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

export async function getLinearToken(userId: string): Promise<string | null> {
  const row = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, "linear")),
  });
  return row?.accessToken ?? null;
}

export async function createLinearProject(token: string, name: string, description: string = "") {
  // First, get the first team to create the project in
  const teamsResp = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
        query {
          teams {
            nodes { id name }
          }
        }
      `,
    }),
  });

  const teamsData = await teamsResp.json();
  const teamId = teamsData?.data?.teams?.nodes?.[0]?.id;

  if (!teamId) return null;

  // Create the project
  const projectResp = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
        mutation CreateProject($teamId: String!, $name: String!, $description: String) {
          projectCreate(input: { teamIds: [$teamId], name: $name, description: $description }) {
            success
            project { id name }
          }
        }
      `,
      variables: { teamId, name, description },
    }),
  });

  const projectData = await projectResp.json();
  if (projectData?.data?.projectCreate?.success) {
    return {
      projectId: projectData.data.projectCreate.project.id,
      teamId: teamId,
    };
  }

  return null;
}
