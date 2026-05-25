"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";

type Status = "idle" | "sending" | "sent";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    setError(null);
    setStatus("sending");
    try {
      const result = await authClient.signIn.magicLink({
        email,
        callbackURL: "/",
      });
      if (result.error) {
        setError(result.error.message ?? "Failed to send magic link");
        setStatus("idle");
        return;
      }
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setStatus("idle");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-pear-off-white p-6">
      <div
        className="w-full max-w-md bg-white"
        style={{
          borderRadius: 18.75,
          padding: 30,
          border: "1px solid #E5E5E5",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-playfair)",
            fontWeight: 500,
            fontSize: "clamp(1.75rem, 3vw, 2rem)",
            lineHeight: 1.15,
          }}
        >
          Sign in
        </h2>
        <p className="mt-2 text-sm" style={{ color: "#585858" }}>
          Enter your email to receive a magic link.
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium" style={{ color: "#585858" }}>
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "sending"}
              className="rounded-md px-3 py-2 text-sm"
              style={{
                background: "white",
                border: "1px solid #E5E5E5",
                color: "var(--color-black)",
              }}
              placeholder="you@example.com"
            />
          </label>

          <button
            type="submit"
            disabled={status === "sending" || email.length === 0}
            className="btn btn-primary"
          >
            {status === "sending" ? "Sending..." : "Send magic link"}
          </button>

          {error ? (
            <p className="text-sm" role="alert" style={{ color: "#a30000" }}>
              {error}
            </p>
          ) : null}

          {status === "sent" ? (
            <p
              className="rounded-md px-3 py-2 text-sm"
              style={{ background: "#CCFAFF", color: "var(--color-black)" }}
            >
              Check your inbox — the link expires in a few minutes.
            </p>
          ) : null}
        </form>
      </div>
    </main>
  );
}
