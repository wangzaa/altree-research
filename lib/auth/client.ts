import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

/**
 * Client-side mirror of the server-side resolver in `lib/auth/server.ts`.
 * Resolution order:
 *
 *  1. `NEXT_PUBLIC_BETTER_AUTH_URL` — explicit override (custom domain).
 *  2. `NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL` — Vercel's canonical
 *     production alias. Must win over `NEXT_PUBLIC_VERCEL_URL` to keep the
 *     auth client and the page on the same origin when the user visits via
 *     the alias.
 *  3. `NEXT_PUBLIC_VERCEL_URL` — per-deployment immutable URL. Used for
 *     preview deploys.
 *  4. `http://localhost:3000` — local dev fallback.
 *
 * `process.env.NEXT_PUBLIC_*` references are inlined by Next.js at build
 * time, so the value is baked into the client bundle.
 */
function resolveBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BETTER_AUTH_URL) {
    return process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
  }
  if (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

export const authClient = createAuthClient({
  baseURL: resolveBaseUrl(),
  plugins: [magicLinkClient()],
});
