import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins/magic-link";
import { Pool } from "pg";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret && process.env.NODE_ENV === "production") {
  throw new Error("BETTER_AUTH_SECRET is required in production");
}

/**
 * Resolution order for the auth base URL:
 *
 *  1. `BETTER_AUTH_URL` — explicit override. Set this on production scope
 *     only when you point a custom domain at the app (e.g. https://altree.co).
 *  2. `VERCEL_URL` — auto-injected by Vercel for every deployment. Hostname
 *     only (no protocol), so we prefix `https://`. Covers preview deploys
 *     AND production-without-custom-domain. NEVER set this manually; Vercel
 *     manages it.
 *  3. `http://localhost:3000` — local dev fallback.
 */
function resolveBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

const globalForPool = globalThis as unknown as { __pgPool?: Pool };
const pool =
  globalForPool.__pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });
if (process.env.NODE_ENV !== "production") {
  globalForPool.__pgPool = pool;
}

export const auth = betterAuth({
  database: pool,
  secret: secret,
  baseURL: resolveBaseUrl(),
  emailAndPassword: { enabled: false },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        if (process.env.NODE_ENV === "production") {
          throw new Error("Magic link email transport not configured");
        }
        console.log(`Magic link for ${email}: ${url}`);
      },
    }),
  ],
});
