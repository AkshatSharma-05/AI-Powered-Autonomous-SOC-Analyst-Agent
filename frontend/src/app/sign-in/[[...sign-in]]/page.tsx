/*
 * frontend/src/app/sign-in/[[...sign-in]]/page.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Clerk-hosted sign-in page.
 *
 * The [[...sign-in]] catch-all route is required by Clerk's App Router
 * integration to handle all Clerk sign-in sub-routes (e.g. /sign-in/factor-one).
 *
 * Spec R6: WHEN an unauthenticated user visits the dashboard, THE SYSTEM SHALL
 * redirect them to a Clerk-hosted login page.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            SOC Agent
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Autonomous Security Operations Center
          </p>
        </div>
        <SignIn
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "bg-gray-900 border border-gray-800 shadow-2xl",
              headerTitle: "text-white",
              headerSubtitle: "text-gray-400",
              socialButtonsBlockButton:
                "bg-gray-800 border-gray-700 text-white hover:bg-gray-700",
              formFieldInput:
                "bg-gray-800 border-gray-700 text-white placeholder-gray-500",
              formButtonPrimary:
                "bg-blue-600 hover:bg-blue-700 text-white",
              footerActionLink: "text-blue-400 hover:text-blue-300",
            },
          }}
        />
      </div>
    </main>
  );
}
