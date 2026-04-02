/**
 * Slack service helpers for server-side use.
 * Tokens are stored directly in the account table via our custom OAuth flow,
 * supporting multiple Slack workspaces per user.
 */

import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

/**
 * Get the first connected Slack bot token for a user.
 * Used for auto-creating channels on project creation, etc.
 */
export async function getSlackToken(userId: string): Promise<string | null> {
  const row = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, "slack")),
  });
  return row?.accessToken ?? null;
}

/**
 * Get all connected Slack tokens for a user (multi-workspace).
 */
export async function getAllSlackTokens(userId: string) {
  const rows = await db.query.account.findMany({
    where: and(eq(account.userId, userId), eq(account.providerId, "slack")),
  });
  return rows.map((r) => ({
    id: r.id,
    teamId: r.accountId,
    teamName: r.idToken || "Slack Workspace",
    token: r.accessToken!,
  }));
}

/**
 * Create a Slack channel. Returns the channel ID or null on failure.
 * Channel names are sanitized to meet Slack's requirements.
 */
export async function createSlackChannel(
  token: string,
  name: string,
  isPrivate = false
): Promise<string | null> {
  const channelName = name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  const resp = await fetch("https://slack.com/api/conversations.create", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: channelName, is_private: isPrivate }),
  });

  const data = await resp.json();

  if (!data.ok) {
    if (data.error === "name_taken") {
      return findChannelByName(token, channelName);
    }
    console.error("[Slack] conversations.create failed:", data.error);
    return null;
  }

  return data.channel.id as string;
}

async function findChannelByName(token: string, name: string): Promise<string | null> {
  const resp = await fetch(
    `https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  if (!data.ok) return null;
  const match = data.channels?.find((c: any) => c.name === name);
  return match?.id ?? null;
}

/**
 * Post a welcome message to a channel.
 */
export async function postWelcomeMessage(
  token: string,
  channelId: string,
  projectName: string
): Promise<void> {
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: channelId,
      text: `*${projectName}* channel is ready. Updates and notifications for this project will appear here.`,
    }),
  });
}
