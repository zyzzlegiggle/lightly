import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

export async function getNotionToken(userId: string): Promise<string | null> {
  const row = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, "notion")),
  });
  return row?.accessToken ?? null;
}

export async function createNotionProjectPage(token: string, name: string) {
  // ── Step 1: Search for a "Projects" page to use as parent ──
  const searchResp = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({
      query: "Projects",
      filter: { property: "object", value: "page" },
      page_size: 1,
    }),
  });

  const searchData = await searchResp.json();
  let parentId = searchData?.results?.[0]?.id;

  // Fallback: If no "Projects" page is found, search for any page the user has shared with this integration
  if (!parentId) {
    const fallbackResp = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({ page_size: 1 }),
    });
    const fallbackData = await fallbackResp.json();
    parentId = fallbackData?.results?.[0]?.id;
  }

  if (!parentId) {
    console.warn("[Notion] No accessible parent page found for project creation.");
    return null;
  }

  // ── Step 2: Create the page ──
  const createResp = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parentId },
      properties: {
        title: [
          {
            text: { content: `${name} — Project Dashboard` },
          },
        ],
      },
    }),
  });

  const createData = await createResp.json();
  if (createResp.ok) {
    console.log(`[Notion] Created project page: ${createData.id}`);
    return createData.id;
  }

  console.error("[Notion] Page creation failed:", createData);
  return null;
}
