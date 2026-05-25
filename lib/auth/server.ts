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
 *  1. `BETTER_AUTH_URL` — explicit override (custom domain).
 *  2. `VERCEL_PROJECT_PRODUCTION_URL` — Vercel's canonical production alias
 *     (e.g. `altree-research.vercel.app`). Stable across deployments, so
 *     visits via the alias and auth fetches target the SAME origin. Must
 *     win over `VERCEL_URL` to avoid CORS preflight failures when the user
 *     visits via the alias but VERCEL_URL points at a per-deployment URL.
 *  3. `VERCEL_URL` — per-deployment immutable URL. Used for preview deploys
 *     (where there's no production alias), and as a last resort.
 *  4. `http://localhost:3000` — local dev fallback.
 *
 * NEVER set VERCEL_* vars manually; Vercel auto-injects them per deployment.
 */
function resolveBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
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
        // TODO: wire a real email transport (Resend, Postmark, SES, …)
        // before opening sign-up to other users. Until then the URL is
        // logged to the server console (Vercel function logs in prod) so
        // the admin can copy it out for first-time sign-in.
        if (process.env.NODE_ENV === "production") {
          console.warn(
            `[auth] Magic link for ${email} — copy from logs (no email transport configured): ${url}`,
          );
        } else {
          console.log(`Magic link for ${email}: ${url}`);
        }
      },
    }),
  ],
});
