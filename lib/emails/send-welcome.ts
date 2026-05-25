import { render } from "@react-email/components";
import { Resend } from "resend";
import { WelcomeEmail } from "./welcome";

interface SendWelcomeArgs {
  to: string;
  signInUrl: string;
}

/** Send the one-time welcome email. Hooked into Better Auth's
 * `databaseHooks.user.create.after` in `lib/auth/server.ts`, so this only
 * fires when a brand-new user row is inserted (first magic-link sign-in).
 *
 * Failures are caught and logged — a welcome-email outage must NEVER block
 * sign-in. Better Auth's create hook is awaited before the session is
 * issued, so a thrown error here would surface as a 500 on /api/auth/* and
 * the user wouldn't get into the app. */
export async function sendWelcomeEmail(args: SendWelcomeArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAGIC_LINK_FROM;
  if (!apiKey || !from) {
    console.warn(
      `[welcome-email] No mail transport — would have welcomed ${args.to}`,
    );
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const html = await render(WelcomeEmail({ signInUrl: args.signInUrl }));
    const text = await render(
      WelcomeEmail({ signInUrl: args.signInUrl }),
      { plainText: true },
    );

    const result = await resend.emails.send({
      from,
      to: args.to,
      subject: "Welcome to Altree",
      html,
      text,
    });
    if (result.error) {
      console.error(
        `[welcome-email] Resend send failed for ${args.to}:`,
        result.error,
      );
    }
  } catch (err) {
    console.error(`[welcome-email] Unexpected error for ${args.to}:`, err);
  }
}
