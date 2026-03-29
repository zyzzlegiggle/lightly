"use client";

/**
 * SetupModal — With Auth0, the user's profile (name, picture, nickname)
 * comes from their GitHub account automatically. We no longer need
 * a "complete your profile" step since Auth0 handles it.
 *
 * This component is now a no-op and can be removed later.
 */
export function SetupModal({ session }: { session: any }) {
    // Auth0 populates the profile automatically from GitHub
    return null;
}
