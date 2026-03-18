import { auth } from "@/lib/auth"; // Import from your auth.ts
import { nextCookies } from "better-auth/next-js";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
	const session = await auth.api.getSession({
		headers: await nextCookies(), // handle cookies in Next.js
	});

	if (!session) {
		if (request.nextUrl.pathname === "/") {
			return NextResponse.redirect(new URL("/auth", request.url));
		}
	}

    if (session && request.nextUrl.pathname === "/auth") {
        return NextResponse.redirect(new URL("/", request.url));
    }

	return NextResponse.next();
}

export const config = {
	matcher: ["/", "/auth"],
};
