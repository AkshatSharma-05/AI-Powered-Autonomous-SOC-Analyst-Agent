/*
 * frontend/src/app/page.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Root page — immediately redirects to /dashboard.
 *
 * The middleware handles unauthenticated users: if not signed in, they are
 * redirected to /sign-in before they ever see /dashboard.
 * If signed in, they go straight to the dashboard.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/dashboard");
}
