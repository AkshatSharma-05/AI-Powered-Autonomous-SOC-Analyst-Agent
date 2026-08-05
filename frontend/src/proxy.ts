/*
 * frontend/src/middleware.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Clerk authentication middleware — protects all routes.
 *
 * Spec R6: WHEN an unauthenticated user visits the dashboard, THE SYSTEM SHALL
 * redirect them to a Clerk-hosted login page.
 *
 * How it works:
 *   - `clerkMiddleware()` runs on every request matching the `matcher` below.
 *   - `auth().protect()` redirects unauthenticated users to Clerk's sign-in
 *     page automatically.
 *   - Public routes (sign-in, sign-up) are excluded so Clerk doesn't redirect
 *     users in an infinite loop.
 *
 * Documentation: https://clerk.com/docs/references/nextjs/clerk-middleware
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const pubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isClerkConfigured = !!(pubKey && pubKey.startsWith("pk_") && !pubKey.includes("your_publishable_key"));

// Routes that do NOT require authentication
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isClerkConfigured) {
    return NextResponse.next();
  }
  // Protect every route that is NOT public
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});


export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
