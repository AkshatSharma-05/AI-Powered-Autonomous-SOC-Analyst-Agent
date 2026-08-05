/*
 * frontend/src/app/sign-up/[[...sign-up]]/page.tsx
 * Clerk-hosted sign-up page (catch-all route required by Clerk App Router).
 */

import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
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
        <SignUp
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "bg-gray-900 border border-gray-800 shadow-2xl",
              headerTitle: "text-white",
              headerSubtitle: "text-gray-400",
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
