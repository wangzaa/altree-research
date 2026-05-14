import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins/magic-link";
import { Pool } from "pg";

function createPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

export const auth = betterAuth({
  database: createPool(),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  emailAndPassword: { enabled: false },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        console.log(`Magic link for ${email}: ${url}`);
      },
    }),
  ],
});
