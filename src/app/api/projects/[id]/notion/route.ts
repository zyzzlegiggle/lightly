import { auth0 } from "@/lib/auth0";
import { getAuthContextResult } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getNotionToken, createNotionProjectPage } from "@/lib/notion-service";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "Notion-Version": "2022-06-28",
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth0.getSession();
  const result = await getAuthContextResult();

  if (!result.ok || !session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = result.ctx.userId;

  const dbProject = await db.query.project.findFirst({
    where: and(eq(project.id, id), eq(project.userId, userId)),
  });

  if (!dbProject) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const notionToken = await getNotionToken(userId);
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (!notionToken) {
    return Response.json({ connected: false, pageId: dbProject.notionPageId });
  }

  // GET ?action=pages — list child pages under the project's Notion page
  if (action === "pages" && dbProject.notionPageId) {
    try {
      // Try to query as database first
      const dbResp = await fetch(`${NOTION_API}/databases/${dbProject.notionPageId}/query`, {
        method: "POST",
        headers: NOTION_HEADERS(notionToken),
        body: JSON.stringify({ page_size: 100 }),
      });
      const dbData = await dbResp.json();
      
      if (dbResp.ok) {
        const pages = (dbData.results || []).map((r: any) => ({
          id: r.id,
          title: r.properties?.title?.title?.[0]?.plain_text || 
                 r.properties?.Name?.title?.[0]?.plain_text || 
                 "Untitled",
          createdTime: r.created_time,
          lastEditedTime: r.last_edited_time,
        }));
        return Response.json({ pages });
      }

      // Fallback: list child pages as blocks (for a standard Page)
      const blocksResp = await fetch(`${NOTION_API}/blocks/${dbProject.notionPageId}/children?page_size=100`, {
        headers: NOTION_HEADERS(notionToken),
      });
      const data = await blocksResp.json();

      // Filter to child_page blocks
      const pages = (data.results || [])
        .filter((b: any) => b.type === "child_page")
        .map((b: any) => ({
          id: b.id,
          title: b.child_page?.title || "Untitled",
          createdTime: b.created_time,
          lastEditedTime: b.last_edited_time,
        }));

      return Response.json({ pages });
    } catch (err) {
      console.error("[Notion] Error listing pages:", err);
      return Response.json({ pages: [] });
    }
  }

  // GET ?action=page&pageId=xxx — get page content (blocks)
  if (action === "page") {
    const pageId = searchParams.get("pageId");
    if (!pageId) return Response.json({ error: "pageId required" }, { status: 400 });

    try {
      // Get page title
      const pageResp = await fetch(`${NOTION_API}/pages/${pageId}`, {
        headers: NOTION_HEADERS(notionToken),
      });
      const pageData = await pageResp.json();
      const title =
        pageData.properties?.title?.title?.[0]?.plain_text ||
        pageData.properties?.Name?.title?.[0]?.plain_text ||
        "Untitled";

      // Get page blocks (content)
      const blocksResp = await fetch(`${NOTION_API}/blocks/${pageId}/children?page_size=100`, {
        headers: NOTION_HEADERS(notionToken),
      });
      const blocksData = await blocksResp.json();

      const blocks = (blocksData.results || []).map((b: any) => ({
        id: b.id,
        type: b.type,
        content: extractBlockText(b),
        checked: b.type === "to_do" ? b.to_do?.checked : undefined,
      }));

      return Response.json({ title, blocks });
    } catch (err) {
      console.error("[Notion] Error fetching page:", err);
      return Response.json({ error: "Failed to fetch page" }, { status: 500 });
    }
  }

  return Response.json({
    connected: !!notionToken,
    pageId: dbProject.notionPageId,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth0.getSession();
  const result = await getAuthContextResult();

  if (!result.ok || !session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = result.ctx.userId;
  const body = await req.json();
  const { action } = body;

  const dbProject = await db.query.project.findFirst({
    where: and(eq(project.id, id), eq(project.userId, userId)),
  });

  if (!dbProject) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const notionToken = await getNotionToken(userId);

  if (action === "init") {
    if (!notionToken) {
      return Response.json({ error: "Notion not connected" }, { status: 400 });
    }
    const pageId = await createNotionProjectPage(notionToken, "Dedicated Project Page");
    if (pageId) {
      await db.update(project)
        .set({ notionPageId: pageId })
        .where(eq(project.id, id));
      return Response.json({ success: true, pageId });
    }
    return Response.json({ error: "Failed to init" }, { status: 500 });
  }

  // POST action=createNote — create a new child page
  if (action === "createNote") {
    if (!notionToken || !dbProject.notionPageId) {
      return Response.json({ error: "Notion not ready" }, { status: 400 });
    }
    const { title } = body;
    if (!title) return Response.json({ error: "title required" }, { status: 400 });

    try {
      const resp = await fetch(`${NOTION_API}/pages`, {
        method: "POST",
        headers: NOTION_HEADERS(notionToken),
        body: JSON.stringify({
          parent: { type: "page_id", page_id: dbProject.notionPageId },
          properties: {
            title: [{ text: { content: title } }],
          },
          // Add an empty paragraph block so the page isn't blank
          children: [
            {
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [{ text: { content: "" } }],
              },
            },
          ],
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        console.error("[Notion] Create page failed:", data);
        return Response.json({ error: "Failed to create note" }, { status: 500 });
      }
      return Response.json({
        page: {
          id: data.id,
          title,
          createdTime: data.created_time,
          lastEditedTime: data.last_edited_time,
        },
      });
    } catch (err) {
      console.error("[Notion] Error creating note:", err);
      return Response.json({ error: "Failed to create note" }, { status: 500 });
    }
  }

  // POST action=updateContent — append/replace content blocks
  if (action === "updateContent") {
    if (!notionToken) return Response.json({ error: "Not connected" }, { status: 400 });
    const { pageId, blocks } = body;
    if (!pageId || !blocks) return Response.json({ error: "pageId and blocks required" }, { status: 400 });

    try {
      // Delete existing blocks first
      const existingResp = await fetch(`${NOTION_API}/blocks/${pageId}/children?page_size=100`, {
        headers: NOTION_HEADERS(notionToken),
      });
      const existingData = await existingResp.json();
      for (const block of existingData.results || []) {
        await fetch(`${NOTION_API}/blocks/${block.id}`, {
          method: "DELETE",
          headers: NOTION_HEADERS(notionToken),
        });
      }

      // Append new blocks
      const notionBlocks = blocks.map((b: any) => {
        if (b.type === "heading_2") {
          return {
            object: "block",
            type: "heading_2",
            heading_2: { rich_text: parseRichText(b.content || "") },
          };
        }
        if (b.type === "heading_3") {
          return {
            object: "block",
            type: "heading_3",
            heading_3: { rich_text: parseRichText(b.content || "") },
          };
        }
        if (b.type === "bulleted_list_item") {
          return {
            object: "block",
            type: "bulleted_list_item",
            bulleted_list_item: { rich_text: parseRichText(b.content || "") },
          };
        }
        if (b.type === "numbered_list_item") {
          return {
            object: "block",
            type: "numbered_list_item",
            numbered_list_item: { rich_text: parseRichText(b.content || "") },
          };
        }
        if (b.type === "to_do") {
          return {
            object: "block",
            type: "to_do",
            to_do: {
              rich_text: parseRichText(b.content || ""),
              checked: b.checked || false,
            },
          };
        }
        if (b.type === "code") {
          return {
            object: "block",
            type: "code",
            code: {
              rich_text: [{ text: { content: b.content || "" } }],
              language: "plain text",
            },
          };
        }
        if (b.type === "divider") {
          return { object: "block", type: "divider", divider: {} };
        }
        // Default: paragraph
        return {
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: parseRichText(b.content || "") },
        };
      });

      if (notionBlocks.length > 0) {
        await fetch(`${NOTION_API}/blocks/${pageId}/children`, {
          method: "PATCH",
          headers: NOTION_HEADERS(notionToken),
          body: JSON.stringify({ children: notionBlocks }),
        });
      }

      return Response.json({ success: true });
    } catch (err) {
      console.error("[Notion] Error updating content:", err);
      return Response.json({ error: "Failed to update" }, { status: 500 });
    }
  }

  // POST action=deleteNote — archive a page
  if (action === "deleteNote") {
    if (!notionToken) return Response.json({ error: "Not connected" }, { status: 400 });
    const { pageId } = body;
    if (!pageId) return Response.json({ error: "pageId required" }, { status: 400 });

    try {
      await fetch(`${NOTION_API}/pages/${pageId}`, {
        method: "PATCH",
        headers: NOTION_HEADERS(notionToken),
        body: JSON.stringify({ archived: true }),
      });
      return Response.json({ success: true });
    } catch (err) {
      console.error("[Notion] Error deleting note:", err);
      return Response.json({ error: "Failed to delete" }, { status: 500 });
    }
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}

/** Extract plain text from a Notion block, preserving bold/italic/code as markdown syntax */
function extractBlockText(block: any): string {
  const type = block.type;
  const data = block[type];
  if (!data) return "";
  
  // Standard text-based blocks (paragraph, headings, lists, etc)
  if (data.rich_text && Array.isArray(data.rich_text)) {
    return data.rich_text.map((t: any) => {
      let text = t.plain_text || "";
      if (t.annotations?.bold) text = `**${text}**`;
      if (t.annotations?.italic) text = `_${text}_`;
      if (t.annotations?.code) text = `\`${text}\``;
      return text;
    }).join("");
  }
  
  // Old style or other nested text fields
  if (data.text && Array.isArray(data.text)) {
    return data.text.map((t: any) => t.plain_text || "").join("");
  }

  // Handle specific block contents if rich_text is missing
  if (typeof data === "string") return data;
  
  return "";
}

/** Simple parser to convert markdown markers to Notion rich_text objects */
function parseRichText(text: string) {
  if (!text) return [{ text: { content: "" } }];
  
  // Pattern to match **bold**, _italic_, or `code`
  const regex = /(\*\*.*?\*\*|_.*?_|`.*?`)/g;
  const parts = text.split(regex);
  
  const result = parts.map(part => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return { text: { content: part.slice(2, -2) }, annotations: { bold: true } };
    }
    if (part.startsWith("_") && part.endsWith("_")) {
      return { text: { content: part.slice(1, -1) }, annotations: { italic: true } };
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return { text: { content: part.slice(1, -1) }, annotations: { code: true } };
    }
    return { text: { content: part } };
  }).filter(p => !!p.text.content);

  return result.length > 0 ? result : [{ text: { content: "" } }];
}
