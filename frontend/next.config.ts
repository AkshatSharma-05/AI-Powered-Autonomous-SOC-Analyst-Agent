import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output required for the multi-stage Docker build (frontend/Dockerfile).
  // Produces a minimal server.js that doesn't need the full node_modules at runtime.
  output: "standalone",

  // Expose the backend API URL to the browser via an env variable.
  // Set NEXT_PUBLIC_API_URL in .env or docker-compose.yml.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  },
};

export default nextConfig;
