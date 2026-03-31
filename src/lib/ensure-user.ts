/**
 * Ensures the Auth0 user exists in the local "user" table.
 *
 * After migrating from Better Auth (which auto-managed the user table)
 * to Auth0 (which manages users externally), the local DB no longer
 * gets a row on sign-up. This helper performs an upsert so that
 * foreign-key constraints (e.g. project.userId → user.id) are satisfied.
 */

import { db } from "./db";
import { user } from "./schema";
import { eq } from "drizzle-orm";

interface Auth0Profile {
  sub: string;           // e.g. "github|112403713"
  name?: string;
  nickname?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
}

export async function ensureUserExists(profile: Auth0Profile): Promise<void> {
  const userId = profile.sub;

  // Check if user already exists
  const existing = await db.query.user.findFirst({
    where: eq(user.id, userId),
  });

  if (existing) return; // Already in the DB — nothing to do

  // Insert the user
  const now = new Date();
  await db.insert(user).values({
    id: userId,
    name: profile.name || profile.nickname || "User",
    email: profile.email || `${userId}@auth0.placeholder`,
    emailVerified: profile.email_verified ?? false,
    image: profile.picture || null,
    createdAt: now,
    updatedAt: now,
  });
}
