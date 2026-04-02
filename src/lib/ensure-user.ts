/**
 * Ensures the Auth0 user exists in the local "user" table.
 *
 * Uses an upsert keyed on `id` (the Auth0 sub) so that:
 * 1. Multiple OAuth providers with the same email (e.g. Google + GitHub)
 *    can each get their own row without violating any unique constraint.
 * 2. Profile info (name, picture) is refreshed on every login.
 * 3. Race conditions between concurrent requests are handled safely.
 */

import { db } from "./db";
import { user } from "./schema";
import { sql } from "drizzle-orm";

interface Auth0Profile {
  sub: string;           // e.g. "github|112403713" or "google-oauth2|1234"
  name?: string;
  nickname?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
}

export async function ensureUserExists(profile: Auth0Profile): Promise<void> {
  const userId = profile.sub;
  const now = new Date();

  // Upsert: insert if not exists, update profile fields if the row already exists.
  // Keyed on `id` (the Auth0 sub) — NOT email — so users who log in via different
  // providers (Google, GitHub, Slack) with the same email get separate rows.
  await db
    .insert(user)
    .values({
      id: userId,
      name: profile.name || profile.nickname || "User",
      email: profile.email || `${userId}@auth0.placeholder`,
      emailVerified: profile.email_verified ?? false,
      image: profile.picture || null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: user.id,
      set: {
        name: sql`excluded."name"`,
        email: sql`excluded."email"`,
        emailVerified: sql`excluded."emailVerified"`,
        image: sql`excluded."image"`,
        updatedAt: sql`excluded."updatedAt"`,
      },
    });
}
