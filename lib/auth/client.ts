import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

/**
 * Client-side mirror of the server-side resolver in `lib/auth/server.ts`.
 * Resolution order:
 *
 *  1. `NEXT_PUBLIC_BETTER_AUTH_URL` — explicit override for custom-domain
 *     production deployments. Set on the production scope only.
 *  2. `NEXT_PUBLIC_VERCEL_URL` — auto-injected by Vercel for every
 *     deployment, mirroring the server-side `VERCEL_URL`. Hostname only,
 *     so we prefix `https://`. Covers preview deploys AND
 *     production-without-custom-domain.
 *  3. `http://localhost:3000` — local dev fallback.
 *
 * `process.env.NEXT_PUBLIC_*` references are inlined by Next.js at build
 * time, so the value is baked into the client bundle.
 */
function resolveBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BETTER_AUTH_URL) {
    return process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
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
