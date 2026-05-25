import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { sendWelcomeEmail } from "@/lib/emails/send-welcome";

describe("sendWelcomeEmail", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    sendMock.mockReset();
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAGIC_LINK_FROM = "Altree <no-reply@altree.co>";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("logs and skips the send when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await sendWelcomeEmail({
      to: "user@example.com",
      signInUrl: "http://localhost:3000",
    });
    expect(sendMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("No mail transport"),
    );
    warn.mockRestore();
  });

  it("calls Resend with the configured From + rendered html/text", async () => {
    sendMock.mockResolvedValueOnce({ data: { id: "em_1" }, error: null });
    await sendWelcomeEmail({
      to: "user@example.com",
      signInUrl: "https://altree.example",
    });
    expect(sendMock).toHaveBeenCalledOnce();
    const call = sendMock.mock.calls[0][0] as {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(call.from).toBe("Altree <no-reply@altree.co>");
    expect(call.to).toBe("user@example.com");
    expect(call.subject).toBe("Welcome to Altree");
    // Both renders carry the brand-voice opener and the signInUrl on the CTA.
    expect(call.html).toContain("Altree is built for the other half");
    expect(call.html).toContain("https://altree.example");
    expect(call.text).toContain("Altree is built for the other half");
  });

  it("renders the numbered onboarding steps and the house-rules section", async () => {
    sendMock.mockResolvedValueOnce({ data: { id: "em_2" }, error: null });
    await sendWelcomeEmail({
      to: "user@example.com",
      signInUrl: "https://altree.example",
    });
    const call = sendMock.mock.calls[0][0] as { text: string };
    expect(call.text).toContain("1. Paste an article.");
    expect(call.text).toContain("2. Or browse a theme.");
    expect(call.text).toContain("3. When you");
    expect(call.text).toContain("A few house rules");
    expect(call.text).toContain("We don't give advice");
  });

  it("logs but does not throw when Resend returns an error — sign-in must not fail because of welcome mail", async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: "domain_not_verified", message: "Domain pending" },
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      sendWelcomeEmail({
        to: "user@example.com",
        signInUrl: "https://altree.example",
      }),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
