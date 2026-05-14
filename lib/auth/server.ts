import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins/magic-link";
import { Pool } from "pg";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret && process.env.NODE_ENV === "production") {
  throw new Error("BETTER_AUTH_SECRET is required in production");
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
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
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
