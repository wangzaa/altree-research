import { describe, it, expect, beforeEach, vi } from "vitest";

describe("better-auth server", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("constructs without throwing when DATABASE_URL is unset", async () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const mod = await import("@/lib/auth/server");
      expect(mod.auth).toBeDefined();
      expect(typeof mod.auth.handler).toBe("function");
    } finally {
      if (original !== undefined) process.env.DATABASE_URL = original;
    }
  });
});

describe("better-auth client", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("constructs authClient", async () => {
    const mod = await import("@/lib/auth/client");
    expect(mod.authClient).toBeDefined();
    expect(mod.authClient.signIn).toBeDefined();
  });
});

describe("api route handler", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("exports GET and POST", async () => {
    const mod = await import("@/app/api/auth/[...all]/route");
    expect(typeof mod.GET).toBe("function");
    expect(typeof mod.POST).toBe("function");
  });
});
