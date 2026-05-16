import { describe, it, expect, beforeEach, vi } from "vitest";

describe("supabase server client", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("throws when env vars missing", async () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    try {
      const { getSupabaseServerClient } = await import("@/lib/supabase/server");
      expect(() => getSupabaseServerClient()).toThrow(/Missing/);
    } finally {
      if (originalUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      if (originalKey !== undefined) process.env.SUPABASE_SERVICE_KEY = originalKey;
    }
  });

  it("constructs without error when env vars are present", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "test-service-key";
    const { getSupabaseServerClient } = await import("@/lib/supabase/server");
    expect(() => getSupabaseServerClient()).not.toThrow();
  });
});
