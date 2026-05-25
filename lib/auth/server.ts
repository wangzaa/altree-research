import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins/magic-link";
import { Pool } from "pg";
import { Resend } from "resend";
import { sendWelcomeEmail } from "@/lib/emails/send-welcome";

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

// Lazy-instantiate so a missing key during build / CI / fresh clone doesn't
// crash; the runtime fallback in `sendMagicLink` logs to console instead.
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export const auth = betterAuth({
  database: pool,
  secret: secret,
  baseURL: resolveBaseUrl(),
  emailAndPassword: { enabled: false },
  databaseHooks: {
    user: {
      create: {
        // Fires once per user — the row is only inserted on the first
        // successful magic-link verification, so this is our "first sign-in"
        // signal. We deliberately don't await the send to avoid stretching
        // the auth round-trip; `sendWelcomeEmail` traps its own errors.
        after: async (user) => {
          const u = user as { email?: string | null };
          if (!u.email) return;
          void sendWelcomeEmail({
            to: u.email,
            signInUrl: resolveBaseUrl(),
          });
        },
      },
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const from = process.env.MAGIC_LINK_FROM;
        // No transport configured (missing key or From address) — log the
        // URL so dev/CI/initial-clone flows still work. Magic links shouldn't
        // be the only signal that something is misconfigured in prod, hence
        // the warn-level log.
        if (!resend || !from) {
          const level =
            process.env.NODE_ENV === "production" ? "warn" : "log";
          console[level](
            `[auth] No mail transport — magic link for ${email}: ${url}`,
          );
          return;
        }
        const result = await resend.emails.send({
          from,
          to: email,
          subject: "Sign in to Altree",
          text: `Sign in to Altree by clicking the link below:\n\n${url}\n\nThis link expires in a few minutes. If you didn't request it, you can safely ignore this email.`,
        });
        if (result.error) {
          // Surface the failure to Better Auth so the API responds with an
          // error rather than silently swallowing — the user will see a
          // generic "Failed to send" and we'll see the cause in logs.
          console.error(
            `[auth] Resend send failed for ${email}:`,
            result.error,
          );
          throw new Error(`Resend send failed: ${result.error.message}`);
        }
      },
    }),
  ],
});
