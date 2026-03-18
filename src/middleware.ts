import { createAuthClient } from "better-auth/client";
import { NextResponse, type NextRequest } from "next/server";

const authClient = createAuthClient({
	baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
});

export async function middleware(request: NextRequest) {
	console.log(`[Middleware] Path: ${request.nextUrl.pathname}`);
	
    // Log all cookies to see what better-auth is doing
    const allCookies = request.cookies.getAll().map(c => c.name);
    console.log(`[Middleware] Cookies present: ${allCookies.join(", ") || "none"}`);

	const sessionToken = request.cookies.get("better-auth.session_token");
	const session = !!sessionToken;

	if (!session) {
		if (request.nextUrl.pathname === "/") {
			console.log(`[Middleware] Redirecting to /auth`);
			return NextResponse.redirect(new URL("/auth", request.url));
		}
	}

	if (session && request.nextUrl.pathname === "/auth") {
		console.log(`[Middleware] Redirecting to /`);
		return NextResponse.redirect(new URL("/", request.url));
	}

	console.log(`[Middleware] Next`);
	return NextResponse.next();
}

export const config = {
	matcher: ["/", "/auth"],
};
