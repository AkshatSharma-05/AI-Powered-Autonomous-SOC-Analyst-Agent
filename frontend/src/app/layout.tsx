w/*
 * frontend/src/app/layout.tsx
 * Root layout — wraps all pages with ClerkProvider for authentication context.
 * ClerkProvider must be at the root level to make auth available everywhere.
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SOC Agent — Autonomous Security Operations",
  description:
    "AI-powered autonomous SOC analyst: CVE triage, exploit intelligence, and remediation planning in under 30 seconds.",
};

const pubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isClerkConfigured = !!(pubKey && pubKey.startsWith("pk_") && !pubKey.includes("your_publishable_key"));

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const content = (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">
        {!isClerkConfigured && (
          <div className="bg-amber-950 border-b border-amber-800 px-4 py-2 text-amber-300 text-xs text-center font-mono">
            ⚠️ <strong>Clerk Auth Keys Missing</strong> — Add your real <code className="bg-amber-900/50 px-1 rounded text-amber-200">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code className="bg-amber-900/50 px-1 rounded text-amber-200">CLERK_SECRET_KEY</code> to <code className="bg-amber-900/50 px-1 rounded text-amber-200">.env</code> to enable authentication.
          </div>
        )}
        {children}
      </body>
    </html>
  );

  if (isClerkConfigured) {
    return <ClerkProvider>{content}</ClerkProvider>;
  }

  return content;
}

