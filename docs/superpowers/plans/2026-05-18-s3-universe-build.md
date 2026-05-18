# S3 — Universe Build (sector-theme path) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator pick an anchor ticker for a thesis, generate a 10–30-ticker candidate universe via an anchor+comps LLM agent (with Yahoo enrichment), edit it inline, and persist it as a fresh `universes` row that lights up Stage 2.

**Architecture:** Operator picks an anchor → Yahoo enriches the anchor → universe-discoverer agent proposes 10–25 peers using comps-analysis peer-selection rules ported into the system prompt → Yahoo enriches each peer (drops below market-cap floor or unknown-suffix) → server persists a new `<thesis_id>_universe_<nn>` row and bumps `thesis.universe_id` + `thesis.version`. PATCH endpoint accepts full-payload edits; UI is a side-by-side anchor picker + editable table.

**Tech Stack:** Next.js 15 App Router · TypeScript · Vitest · React Testing Library · Tailwind · Supabase Postgres (via `getSupabaseServerClient`) · Better Auth (via `getCurrentUser`) · Anthropic SDK (via `lib/anthropic/client.ts` seam) · `yahoo-finance2` (newly added).

**Spec:** [docs/superpowers/specs/2026-05-18-universe-build-design.md](../specs/2026-05-18-universe-build-design.md)

**GitHub issue:** [#4](https://github.com/wangzaa/altree-research/issues/4)

**Working branch:** `s3-universe-build` (continue on it — already at `188612b` off the new S2.5 HEAD).

---

## Preconditions

```bash
git status --short                      # working tree should be clean (only pre-existing out-of-scope files)
git log --oneline -5                    # HEAD should be 188612b docs(s3): retarget AC examples...
npm test                                # 161/161 passing across 20 files
```

If anything is red, fix it before starting Task 1.

---

## File Structure

**New files:**
- `lib/data/yahoo.ts` — `getQuote`, `getFundamentals` (Task 1)
- `tests/data/yahoo.test.ts` — Yahoo wrapper unit tests (Task 1)
- `lib/schemas/universe.ts` — `UniverseSchema`, `UniverseTickerSchema`, `ExposureTierSchema` (Task 2)
- `tests/schemas/universe.test.ts` — Zod round-trip tests (Task 2)
- `tests/fixtures/universe.ts` — `canonicalUniverse`, `cloneCanonicalUniverse()` (Task 2)
- `lib/schemas/universe-id.ts` — `generateUniverseId` (Task 3)
- `tests/schemas/universe-id.test.ts` — ID-generator tests (Task 3)
- `lib/agents/universe-discoverer.ts` — anchor+comps agent (Task 4)
- `tests/agents/universe-discoverer.test.ts` — agent unit tests (Task 4)
- `app/api/universe/build/route.ts` — POST build endpoint (Task 5)
- `tests/api/universe-build.test.ts` — build endpoint tests (Task 5)
- `app/api/universe/[id]/route.ts` — GET + PATCH endpoints (Task 6)
- `tests/api/universe-get.test.ts` — GET tests (Task 6)
- `tests/api/universe-patch.test.ts` — PATCH tests (Task 6)
- `components/anchor-picker.tsx` — free-text + seed chips (Task 7)
- `tests/components/anchor-picker.test.tsx` — UI tests (Task 7)
- `components/universe-table.tsx` — editable table (Task 8)
- `tests/components/universe-table.test.tsx` — UI tests (Task 8)

**Modified files:**
- `app/thesis/[id]/thesis-detail.client.tsx` — mount `<AnchorPicker>` + `<UniverseTable>` (Task 9)
- `components/stage-list.tsx` — light up Stage 2 when `thesis.universe_id` is set (Task 9)
- `package.json` + `package-lock.json` — add `yahoo-finance2` (Task 1)

---

## Task 1: Yahoo wrapper

**What it does:** Thin wrapper around `yahoo-finance2`. Two functions, both return `null` on any error (unknown ticker, rate-limit, network, parse). Serial fetches only.

**Files:**
- Modify: `package.json` + `package-lock.json` (install `yahoo-finance2`)
- Create: `lib/data/yahoo.ts`
- Test: `tests/data/yahoo.test.ts`

- [ ] **Step 1.1: Install yahoo-finance2**

```bash
npm install yahoo-finance2
```

Verify it lands in `dependencies` (not `devDependencies`):

```bash
grep yahoo-finance2 package.json
```

Expected output: a line like `    "yahoo-finance2": "^2.x.x",` inside the `dependencies` block.

- [ ] **Step 1.2: Write the failing tests**

Create `tests/data/yahoo.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const quoteMock = vi.fn();
const quoteSummaryMock = vi.fn();

vi.mock("yahoo-finance2", () => ({
  default: {
    quote: quoteMock,
    quoteSummary: quoteSummaryMock,
  },
}));

describe("getQuote", () => {
  beforeEach(() => {
    quoteMock.mockReset();
  });

  it("returns { name, market_cap_usd } on success", async () => {
    quoteMock.mockResolvedValueOnce({
      longName: "Rheinmetall AG",
      shortName: "Rheinmetall",
      marketCap: 38_000_000_000,
    });
    const { getQuote } = await import("@/lib/data/yahoo");
    const result = await getQuote("RHM.DE");
    expect(result).toEqual({ name: "Rheinmetall AG", market_cap_usd: 38_000_000_000 });
    expect(quoteMock).toHaveBeenCalledWith("RHM.DE");
  });

  it("falls back to shortName when longName missing", async () => {
    quoteMock.mockResolvedValueOnce({
      shortName: "Rheinmetall",
      marketCap: 1_000_000_000,
    });
    const { getQuote } = await import("@/lib/data/yahoo");
    const result = await getQuote("RHM.DE");
    expect(result?.name).toBe("Rheinmetall");
  });

  it("returns { name, market_cap_usd: null } when marketCap missing", async () => {
    quoteMock.mockResolvedValueOnce({
      longName: "Some Name",
    });
    const { getQuote } = await import("@/lib/data/yahoo");
    const result = await getQuote("XYZ");
    expect(result).toEqual({ name: "Some Name", market_cap_usd: null });
  });

  it("returns null when the quote throws", async () => {
    quoteMock.mockRejectedValueOnce(new Error("not found"));
    const { getQuote } = await import("@/lib/data/yahoo");
    const result = await getQuote("NONEXISTENT");
    expect(result).toBeNull();
  });

  it("returns null when the quote returns null or missing fields", async () => {
    quoteMock.mockResolvedValueOnce(null);
    const { getQuote } = await import("@/lib/data/yahoo");
    expect(await getQuote("X")).toBeNull();

    quoteMock.mockResolvedValueOnce({});
    expect(await getQuote("Y")).toBeNull();
  });
});

describe("getFundamentals", () => {
  beforeEach(() => {
    quoteSummaryMock.mockReset();
  });

  it("returns { sector, industry } on success", async () => {
    quoteSummaryMock.mockResolvedValueOnce({
      assetProfile: { sector: "Industrials", industry: "Aerospace & Defense" },
    });
    const { getFundamentals } = await import("@/lib/data/yahoo");
    const result = await getFundamentals("RHM.DE");
    expect(result).toEqual({ sector: "Industrials", industry: "Aerospace & Defense" });
    expect(quoteSummaryMock).toHaveBeenCalledWith("RHM.DE", {
      modules: ["assetProfile"],
    });
  });

  it("returns partial fields when only sector or industry is present", async () => {
    quoteSummaryMock.mockResolvedValueOnce({
      assetProfile: { sector: "Tech" },
    });
    const { getFundamentals } = await import("@/lib/data/yahoo");
    const result = await getFundamentals("AAPL");
    expect(result).toEqual({ sector: "Tech" });
  });

  it("returns null on error", async () => {
    quoteSummaryMock.mockRejectedValueOnce(new Error("rate limit"));
    const { getFundamentals } = await import("@/lib/data/yahoo");
    const result = await getFundamentals("RHM.DE");
    expect(result).toBeNull();
  });

  it("returns null when assetProfile missing", async () => {
    quoteSummaryMock.mockResolvedValueOnce({});
    const { getFundamentals } = await import("@/lib/data/yahoo");
    const result = await getFundamentals("X");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 1.3: Run tests; verify they fail**

```bash
npx vitest run tests/data/yahoo.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/data/yahoo'".

- [ ] **Step 1.4: Write the implementation**

Create `lib/data/yahoo.ts`:

```ts
import yahooFinance from "yahoo-finance2";

export interface Quote {
  name: string;
  market_cap_usd: number | null;
}

export interface Fundamentals {
  sector?: string;
  industry?: string;
}

export async function getQuote(ticker: string): Promise<Quote | null> {
  try {
    const raw = await yahooFinance.quote(ticker);
    if (!raw) return null;
    const r = raw as {
      longName?: string;
      shortName?: string;
      marketCap?: number;
    };
    const name = r.longName ?? r.shortName;
    if (!name) return null;
    const market_cap_usd = typeof r.marketCap === "number" ? r.marketCap : null;
    return { name, market_cap_usd };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[lib/data/yahoo] getQuote error for ${ticker}:`, message);
    return null;
  }
}

export async function getFundamentals(
  ticker: string,
): Promise<Fundamentals | null> {
  try {
    const raw = await yahooFinance.quoteSummary(ticker, {
      modules: ["assetProfile"],
    });
    const profile = (raw as { assetProfile?: { sector?: string; industry?: string } })
      .assetProfile;
    if (!profile) return null;
    const result: Fundamentals = {};
    if (typeof profile.sector === "string") result.sector = profile.sector;
    if (typeof profile.industry === "string") result.industry = profile.industry;
    if (Object.keys(result).length === 0) return null;
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[lib/data/yahoo] getFundamentals error for ${ticker}:`, message);
    return null;
  }
}
```

- [ ] **Step 1.5: Run tests; verify they pass**

```bash
npx vitest run tests/data/yahoo.test.ts
```

Expected: PASS — 9 tests green.

- [ ] **Step 1.6: Commit**

```bash
git add package.json package-lock.json lib/data/yahoo.ts tests/data/yahoo.test.ts
git commit -m "$(cat <<'EOF'
feat(s3): yahoo-finance2 wrapper (getQuote + getFundamentals)

Thin null-on-error wrapper. Serial fetches only — p-limit and caching
land in S10. Returns { name, market_cap_usd } from quote and
{ sector?, industry? } from quoteSummary assetProfile module.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Universe Zod schema + shared fixture

**What it does:** `UniverseSchema` validates the universe payload; `tests/fixtures/universe.ts` is the canonical Universe used across Tasks 4–9.

**Files:**
- Create: `lib/schemas/universe.ts`
- Test: `tests/schemas/universe.test.ts`
- Create: `tests/fixtures/universe.ts`

- [ ] **Step 2.1: Write the failing schema tests**

Create `tests/schemas/universe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { UniverseSchema, ExposureTierSchema } from "@/lib/schemas/universe";
import { cloneCanonicalUniverse } from "@/tests/fixtures/universe";

describe("UniverseSchema", () => {
  it("round-trips the canonical fixture", () => {
    const u = cloneCanonicalUniverse();
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual(u);
  });

  it("rejects unknown exposure_tier values", () => {
    const u = cloneCanonicalUniverse();
    (u.tickers[0] as { exposure_tier: string }).exposure_tier = "speculative";
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown region values", () => {
    const u = cloneCanonicalUniverse();
    (u.tickers[0] as { region: string }).region = "MARS";
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(false);
  });

  it("rejects more than 30 tickers", () => {
    const u = cloneCanonicalUniverse();
    const tooMany = Array.from({ length: 31 }, (_, i) => ({
      ...u.tickers[0],
      ticker: `STUB${i}.L`,
    }));
    u.tickers = tooMany;
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(false);
  });

  it("rejects zero tickers", () => {
    const u = cloneCanonicalUniverse();
    u.tickers = [];
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(false);
  });

  it("accepts notes defaulting to empty string", () => {
    const u = cloneCanonicalUniverse();
    delete (u.tickers[0] as { notes?: string }).notes;
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.tickers[0].notes).toBe("");
  });

  it("rejects malformed Yahoo ticker", () => {
    const u = cloneCanonicalUniverse();
    u.tickers[0].ticker = "has spaces.L";
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(false);
  });

  it("rejects negative market_cap_usd_b", () => {
    const u = cloneCanonicalUniverse();
    u.tickers[0].market_cap_usd_b = -1;
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid GICS code", () => {
    const u = cloneCanonicalUniverse();
    u.gics_codes = ["999999"];
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(false);
  });
});

describe("ExposureTierSchema", () => {
  it("accepts the three canonical tiers", () => {
    expect(ExposureTierSchema.safeParse("pure_play").success).toBe(true);
    expect(ExposureTierSchema.safeParse("diversified").success).toBe(true);
    expect(ExposureTierSchema.safeParse("etf_proxy").success).toBe(true);
  });

  it("rejects unknown tiers", () => {
    expect(ExposureTierSchema.safeParse("watchlist").success).toBe(false);
  });
});
```

- [ ] **Step 2.2: Write the fixture module**

Create `tests/fixtures/universe.ts`:

```ts
import type { Universe } from "@/lib/schemas/universe";

export const canonicalUniverse: Universe = {
  id: "eu_defense_rearmament_cycle_26_05_01_universe_01",
  created_at: "2026-05-18T12:00:00.000Z",
  last_refreshed: "2026-05-18T12:00:00.000Z",
  gics_codes: ["20101010"],
  regions: ["EUROZONE", "UK", "NORDICS"],
  market_cap_min_usd: 1_000_000_000,
  tickers: [
    {
      ticker: "RHM.DE",
      name: "Rheinmetall AG",
      region: "EUROZONE",
      market_cap_usd_b: 38,
      exposure_tier: "pure_play",
      notes: "Anchor — German armored vehicle and ammunition prime",
    },
    {
      ticker: "BA.L",
      name: "BAE Systems plc",
      region: "UK",
      market_cap_usd_b: 52,
      exposure_tier: "pure_play",
      notes: "UK defence prime; platforms + electronics",
    },
    {
      ticker: "LDO.MI",
      name: "Leonardo S.p.A.",
      region: "EUROZONE",
      market_cap_usd_b: 18,
      exposure_tier: "pure_play",
      notes: "Italian defence prime; helicopters + electronics",
    },
    {
      ticker: "SAAB-B.ST",
      name: "Saab AB",
      region: "NORDICS",
      market_cap_usd_b: 14,
      exposure_tier: "pure_play",
      notes: "Swedish defence prime; Gripen + AEW",
    },
    {
      ticker: "ITA",
      name: "iShares U.S. Aerospace & Defense ETF",
      region: "US",
      market_cap_usd_b: 6,
      exposure_tier: "etf_proxy",
      notes: "Broad US A&D exposure (Lockheed, Northrop, Boeing, RTX)",
    },
  ],
};

/** Returns a deep clone so test mutations don't bleed across cases. */
export function cloneCanonicalUniverse(): Universe {
  return structuredClone(canonicalUniverse);
}
```

- [ ] **Step 2.3: Run tests; verify they fail**

```bash
npx vitest run tests/schemas/universe.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/schemas/universe'".

- [ ] **Step 2.4: Write the schema**

Create `lib/schemas/universe.ts`:

```ts
import { z } from "zod";
import { isValidGicsCode } from "@/lib/data/gics";
import { REGION_VALUES } from "@/lib/data/regions";

const YAHOO_TICKER_REGEX = /^[A-Z0-9\-]+(\.[A-Z]+)?$/i;

export const ExposureTierSchema = z.enum([
  "pure_play",
  "diversified",
  "etf_proxy",
]);

export const TranscriptSourceSchema = z.enum([
  "yahoo_finance2",
  "ir_page",
  "unavailable",
]);

export const RegionSchema = z.enum(REGION_VALUES);

export const UniverseTickerSchema = z
  .object({
    ticker: z.string().regex(YAHOO_TICKER_REGEX),
    name: z.string().min(1),
    region: RegionSchema,
    market_cap_usd_b: z.number().nonnegative(),
    exposure_tier: ExposureTierSchema,
    transcript_source: TranscriptSourceSchema.optional(),
    transcript_url: z.string().url().optional(),
    notes: z.string().default(""),
  })
  .strict();

export const UniverseSchema = z
  .object({
    id: z.string().min(1),
    created_at: z.string(),
    last_refreshed: z.string(),
    gics_codes: z
      .array(z.string().refine(isValidGicsCode, { message: "Invalid GICS code" }))
      .min(1),
    regions: z.array(RegionSchema).min(1),
    market_cap_min_usd: z.number().nonnegative(),
    tickers: z.array(UniverseTickerSchema).min(1).max(30),
  })
  .strict();

export type ExposureTier = z.infer<typeof ExposureTierSchema>;
export type UniverseTicker = z.infer<typeof UniverseTickerSchema>;
export type Universe = z.infer<typeof UniverseSchema>;
```

- [ ] **Step 2.5: Run tests; verify they pass**

```bash
npx vitest run tests/schemas/universe.test.ts
```

Expected: PASS — 11 tests green.

- [ ] **Step 2.6: Commit**

```bash
git add lib/schemas/universe.ts tests/schemas/universe.test.ts tests/fixtures/universe.ts
git commit -m "$(cat <<'EOF'
feat(s3): Universe Zod schema + shared canonical fixture

UniverseSchema mirrors HANDOFF.md §3 — strict objects, exposure_tier
enum (pure_play | diversified | etf_proxy), region from
REGION_VALUES (final 16), GICS code validation, 1-30 tickers bound.

Canonical fixture covers EUROZONE / UK / NORDICS / US with all four
exposure-tier flavours (pure_play x4 + etf_proxy x1) so downstream
tests don't need to hand-craft Universe objects.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Universe ID generator

**What it does:** `generateUniverseId({thesisId, existingIds}) -> '<thesisId>_universe_<nn>'` where `nn` is the smallest unused two-digit positive integer.

**Files:**
- Create: `lib/schemas/universe-id.ts`
- Test: `tests/schemas/universe-id.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `tests/schemas/universe-id.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateUniverseId } from "@/lib/schemas/universe-id";

const THESIS = "eu_defense_rearmament_cycle_26_05_01";

describe("generateUniverseId", () => {
  it("returns _01 when there are no existing ids", () => {
    expect(generateUniverseId({ thesisId: THESIS, existingIds: [] })).toBe(
      `${THESIS}_universe_01`,
    );
  });

  it("returns _02 when _01 exists", () => {
    expect(
      generateUniverseId({
        thesisId: THESIS,
        existingIds: [`${THESIS}_universe_01`],
      }),
    ).toBe(`${THESIS}_universe_02`);
  });

  it("returns _03 when _01 and _02 both exist", () => {
    expect(
      generateUniverseId({
        thesisId: THESIS,
        existingIds: [
          `${THESIS}_universe_01`,
          `${THESIS}_universe_02`,
        ],
      }),
    ).toBe(`${THESIS}_universe_03`);
  });

  it("fills gaps (returns _02 when only _01 and _03 exist)", () => {
    expect(
      generateUniverseId({
        thesisId: THESIS,
        existingIds: [
          `${THESIS}_universe_01`,
          `${THESIS}_universe_03`,
        ],
      }),
    ).toBe(`${THESIS}_universe_02`);
  });

  it("ignores existing ids that don't match the thesis prefix", () => {
    expect(
      generateUniverseId({
        thesisId: THESIS,
        existingIds: ["other_thesis_26_05_01_universe_01"],
      }),
    ).toBe(`${THESIS}_universe_01`);
  });

  it("ignores malformed existing ids (wrong suffix pattern)", () => {
    expect(
      generateUniverseId({
        thesisId: THESIS,
        existingIds: [`${THESIS}_universe_xx`, `${THESIS}_universe_999`],
      }),
    ).toBe(`${THESIS}_universe_01`);
  });

  it("pads to two digits", () => {
    const existing = Array.from(
      { length: 8 },
      (_, i) => `${THESIS}_universe_${String(i + 1).padStart(2, "0")}`,
    );
    expect(generateUniverseId({ thesisId: THESIS, existingIds: existing })).toBe(
      `${THESIS}_universe_09`,
    );
  });
});
```

- [ ] **Step 3.2: Run tests; verify they fail**

```bash
npx vitest run tests/schemas/universe-id.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/schemas/universe-id'".

- [ ] **Step 3.3: Write the implementation**

Create `lib/schemas/universe-id.ts`:

```ts
export interface GenerateUniverseIdInput {
  thesisId: string;
  existingIds: string[];
}

const SUFFIX_REGEX = /^_universe_(\d{2})$/;

export function generateUniverseId(input: GenerateUniverseIdInput): string {
  const prefix = `${input.thesisId}`;
  const used = new Set<number>();
  for (const id of input.existingIds) {
    if (!id.startsWith(prefix)) continue;
    const tail = id.slice(prefix.length);
    const m = tail.match(SUFFIX_REGEX);
    if (!m) continue;
    const n = Number.parseInt(m[1], 10);
    if (Number.isInteger(n) && n >= 1) used.add(n);
  }
  let next = 1;
  while (used.has(next)) next += 1;
  return `${prefix}_universe_${String(next).padStart(2, "0")}`;
}
```

- [ ] **Step 3.4: Run tests; verify they pass**

```bash
npx vitest run tests/schemas/universe-id.test.ts
```

Expected: PASS — 7 tests green.

- [ ] **Step 3.5: Commit**

```bash
git add lib/schemas/universe-id.ts tests/schemas/universe-id.test.ts
git commit -m "$(cat <<'EOF'
feat(s3): universe-id generator with two-digit smallest-unused counter

generateUniverseId({thesisId, existingIds}) returns
'<thesisId>_universe_<nn>'. Fills gaps (returns _02 when only _01 and
_03 exist) and ignores existing ids that don't match the thesis prefix
or have a malformed _universe_NN suffix.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Universe-discoverer agent

**What it does:** Forced `tool_use` against Anthropic with comps-analysis peer-selection methodology in the system prompt. Returns `{ ok: true; tickers: ProposedTicker[] } | { ok: false; error; raw? }` after parsing tool input.

**Files:**
- Create: `lib/agents/universe-discoverer.ts`
- Test: `tests/agents/universe-discoverer.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `tests/agents/universe-discoverer.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const createMessageMock = vi.fn();

vi.mock("@/lib/anthropic/client", () => ({
  createMessage: createMessageMock,
}));

function mockToolUse(input: unknown) {
  createMessageMock.mockResolvedValueOnce({
    content: [
      { type: "tool_use", id: "toolu_1", name: "propose_universe", input },
    ],
    stop_reason: "tool_use",
    usage: { input_tokens: 100, output_tokens: 50 },
    raw: {},
  });
}

const validToolInput = {
  tickers: [
    {
      ticker: "RHM.DE",
      exposure_tier: "pure_play",
      notes: "anchor",
    },
    {
      ticker: "BA.L",
      exposure_tier: "pure_play",
      notes: "UK defence prime",
    },
    {
      ticker: "LDO.MI",
      exposure_tier: "pure_play",
      notes: "Italian defence",
    },
    {
      ticker: "SAAB-B.ST",
      exposure_tier: "pure_play",
      notes: "Swedish defence",
    },
    {
      ticker: "ITA",
      exposure_tier: "etf_proxy",
      notes: "US A&D ETF",
    },
  ],
};

const anchor = {
  ticker: "RHM.DE",
  name: "Rheinmetall AG",
  sector: "Industrials",
  industry: "Aerospace & Defense",
  market_cap_usd: 38_000_000_000,
};

describe("discoverUniverse", () => {
  beforeEach(() => {
    createMessageMock.mockReset();
  });

  it("returns ok:true with parsed tickers on happy path", async () => {
    mockToolUse(validToolInput);
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    const result = await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tickers).toHaveLength(5);
    expect(result.tickers[0]).toEqual({
      ticker: "RHM.DE",
      exposure_tier: "pure_play",
      notes: "anchor",
    });
  });

  it("forces tool use via tool_choice and includes thesis + anchor in user content", async () => {
    mockToolUse(validToolInput);
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    expect(createMessageMock).toHaveBeenCalledTimes(1);
    const call = createMessageMock.mock.calls[0][0];
    expect(call.tool_choice).toEqual({ type: "tool", name: "propose_universe" });
    expect(call.tools).toHaveLength(1);
    expect(call.tools[0].name).toBe("propose_universe");
    expect(Array.isArray(call.system)).toBe(true);
    expect(call.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(call.messages).toHaveLength(1);
    const content = call.messages[0].content as string;
    expect(content).toContain("Rheinmetall AG");
    expect(content).toContain("RHM.DE");
    expect(content).toContain("Aerospace & Defense");
  });

  it("system prompt enumerates the three exposure tiers and comps-style rules", async () => {
    mockToolUse(validToolInput);
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    const call = createMessageMock.mock.calls[0][0];
    const systemText = (call.system[0].text as string).toLowerCase();
    expect(systemText).toContain("pure_play");
    expect(systemText).toContain("diversified");
    expect(systemText).toContain("etf_proxy");
    expect(systemText).toContain("anchor");
    expect(systemText).toContain("region");
  });

  it("returns ok:false when no tool_use block exists", async () => {
    createMessageMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "sorry" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
      raw: {},
    });
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    const result = await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tool_use/i);
  });

  it("returns ok:false when tool_use has the wrong tool name", async () => {
    createMessageMock.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "extract_thesis",
          input: validToolInput,
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 1, output_tokens: 1 },
      raw: {},
    });
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    const result = await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tool_use/i);
  });

  it("returns ok:false when tool_use.input is not an object", async () => {
    mockToolUse("not an object");
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    const result = await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tool_use/i);
    expect(result.raw).toBe("not an object");
  });

  it("returns ok:false when an entry has unknown exposure_tier", async () => {
    mockToolUse({
      tickers: [
        ...validToolInput.tickers.slice(0, 4),
        { ticker: "X.L", exposure_tier: "speculative", notes: "n/a" },
      ],
    });
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    const result = await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toMatch(/exposure_tier|enum|tier/);
  });

  it("returns ok:false when tickers array is empty", async () => {
    mockToolUse({ tickers: [] });
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    const result = await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  it("returns ok:false when more than 30 tickers proposed", async () => {
    const tooMany = Array.from({ length: 31 }, (_, i) => ({
      ticker: `STUB${i}.L`,
      exposure_tier: "pure_play",
      notes: "n",
    }));
    mockToolUse({ tickers: tooMany });
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    const result = await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toMatch(/max|too many|30/);
  });
});
```

- [ ] **Step 4.2: Run tests; verify they fail**

```bash
npx vitest run tests/agents/universe-discoverer.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/agents/universe-discoverer'".

- [ ] **Step 4.3: Write the implementation**

Create `lib/agents/universe-discoverer.ts`:

```ts
import { z } from "zod";
import {
  createMessage,
  type AnthropicContentBlock,
  type AnthropicTextBlockParam,
  type AnthropicTool,
  type AnthropicToolUse,
} from "@/lib/anthropic/client";
import { ExposureTierSchema } from "@/lib/schemas/universe";
import type { Thesis } from "@/lib/schemas/thesis";

export interface DiscoverAnchor {
  ticker: string;
  name: string;
  sector?: string;
  industry?: string;
  market_cap_usd: number | null;
}

export interface DiscoverUniverseInput {
  thesis: Thesis;
  anchor: DiscoverAnchor;
}

export interface ProposedTicker {
  ticker: string;
  exposure_tier: "pure_play" | "diversified" | "etf_proxy";
  notes: string;
}

export type DiscoverUniverseResult =
  | { ok: true; tickers: ProposedTicker[] }
  | { ok: false; error: string; raw?: unknown };

const TOOL_NAME = "propose_universe";

const ProposedTickerSchema = z
  .object({
    ticker: z.string().min(1),
    exposure_tier: ExposureTierSchema,
    notes: z.string().default(""),
  })
  .strict();

const ToolInputSchema = z
  .object({
    tickers: z.array(ProposedTickerSchema).min(5).max(30),
  })
  .strict();

const proposeUniverseTool: AnthropicTool = {
  name: TOOL_NAME,
  description:
    "Return a 10–25 ticker candidate universe for the supplied thesis anchored on the given company. Only call this tool. Do not return free-text.",
  input_schema: {
    type: "object",
    properties: {
      tickers: {
        type: "array",
        minItems: 5,
        maxItems: 30,
        items: {
          type: "object",
          properties: {
            ticker: {
              type: "string",
              description: "Yahoo Finance ticker with suffix (e.g. RHM.DE).",
            },
            exposure_tier: {
              type: "string",
              enum: ["pure_play", "diversified", "etf_proxy"],
            },
            notes: {
              type: "string",
              description: "One-line why this is a peer or what makes it a proxy.",
            },
          },
          required: ["ticker", "exposure_tier", "notes"],
        },
      },
    },
    required: ["tickers"],
  },
};

const systemBlocks: AnthropicTextBlockParam[] = [
  {
    type: "text",
    text: `You are building a comparable-company universe for an investment thesis.

Inputs:
- The thesis claim and scope (sectors, regions, market_cap_min_usd).
- An anchor ticker the analyst has identified as embodying the thesis, with its name, sector, industry, and market cap.

Your job: propose 10–25 ticker candidates that are TRULY comparable to the anchor for the purpose of evaluating this thesis.

Peer-selection rules:
- Same business model as the anchor (pure-play preferred; diversified conglomerates only when no pure-play exists in a region).
- Comparable scale (within ~10x of the anchor's market cap; exclude micro-caps below market_cap_min_usd).
- Comparable geography (prefer companies in the thesis's regions; cross-region peers only when they are clear market leaders).
- Avoid: distressed/bankrupt names, pre-revenue startups, holding companies, pure-financial wrappers (BDCs, REITs unless the thesis IS about REITs).
- Include 1–2 ETF proxies (broad-sector ETFs that approximate the thesis exposure) tagged etf_proxy.
- Each non-ETF ticker is classified as pure_play (single-business primary exposure) or diversified (the company has the exposure but it's part of a larger mix).

Yahoo ticker conventions (suffix -> region):
- US (no suffix). UK: .L. EUROZONE: .DE/.F/.PA/.MI/.MC/.AS/.BR/.LS/.I/.VI/.HE/.AT/.RG/.TL/.VS. NORDICS: .ST/.OL/.CO/.IC. SWITZERLAND: .SW/.VX. CEE: .WA/.BD/.PR/.RO/.IS. JAPAN: .T. KOREA: .KS/.KQ. GREATER_CHINA: .SS/.SZ/.HK/.TW/.TWO. SOUTH_ASIA: .NS/.BO/.KA/.DH/.CM. SEA: .SI/.JK/.KL/.BK/.PS/.VN. ANZ: .AX/.NZ. CANADA: .TO/.V/.NE/.CN. LATAM: .SA/.MX/.SN/.BA/.CL/.LM. MIDDLE_EAST: .TA/.AE/.SR/.QA/.KW. AFRICA: .JO/.CA/.LG/.MA.
- There is no catch-all region; if a ticker's market doesn't fit any of these, do not include it.

Return the full candidate list via the supplied tool. Do not return free-text.`,
    cache_control: { type: "ephemeral" },
  },
];

function findToolUse(
  content: AnthropicContentBlock[],
): AnthropicToolUse | undefined {
  for (const block of content) {
    if (block.type === "tool_use" && block.name === TOOL_NAME) {
      return block;
    }
  }
  return undefined;
}

function buildUserMessage(input: DiscoverUniverseInput): string {
  const { thesis, anchor } = input;
  const marketCapLine =
    anchor.market_cap_usd !== null
      ? `Market cap: USD ${(anchor.market_cap_usd / 1e9).toFixed(2)}B`
      : "Market cap: unknown";
  return `Thesis claim: ${thesis.claim}

Thesis scope:
- sectors (GICS): ${thesis.scope.sectors.join(", ")}
- regions: ${thesis.scope.regions.join(", ")}
- market_cap_min_usd: ${thesis.scope.market_cap_min_usd}

Anchor company:
- ticker: ${anchor.ticker}
- name: ${anchor.name}
- sector: ${anchor.sector ?? "unknown"}
- industry: ${anchor.industry ?? "unknown"}
- ${marketCapLine}

Propose the comparable universe via the propose_universe tool.`;
}

export async function discoverUniverse(
  input: DiscoverUniverseInput,
): Promise<DiscoverUniverseResult> {
  const result = await createMessage({
    system: systemBlocks,
    tools: [proposeUniverseTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: buildUserMessage(input) }],
  });

  const toolUse = findToolUse(result.content);
  if (!toolUse) {
    return {
      ok: false,
      error: "Model did not produce a propose_universe tool_use block",
    };
  }
  if (
    typeof toolUse.input !== "object" ||
    toolUse.input === null ||
    Array.isArray(toolUse.input)
  ) {
    return {
      ok: false,
      error: "tool_use.input was not an object",
      raw: toolUse.input,
    };
  }

  const parsed = ToolInputSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.message,
      raw: toolUse.input,
    };
  }
  return { ok: true, tickers: parsed.data.tickers };
}
```

- [ ] **Step 4.4: Run tests; verify they pass**

```bash
npx vitest run tests/agents/universe-discoverer.test.ts
```

Expected: PASS — 9 tests green.

- [ ] **Step 4.5: Commit**

```bash
git add lib/agents/universe-discoverer.ts tests/agents/universe-discoverer.test.ts
git commit -m "$(cat <<'EOF'
feat(s3): universe-discoverer agent (anchor + comps methodology)

Forced tool_use against 'propose_universe' tool with comps-analysis
peer-selection rules ported into the system prompt (pure-play
preference, ~10x market-cap range, geographic preference, conglomerate
avoidance, 1-2 ETF proxies, exposure_tier classification). Tool input
schema enforces 5-30 ticker bound and the three-tier enum; ToolInputSchema
Zod-validates the model output server-side.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: POST /api/universe/build

**What it does:** Orchestrates the full build: validate body → fetch thesis (owner-scoped) → validate anchor suffix → Yahoo enrich anchor → agent discover → for each peer (suffix check + Yahoo enrich + market-cap floor) → generate universe id → insert universe row → update `thesis.universe_id` + version. Returns `{ universe, dropped }`.

**Files:**
- Create: `app/api/universe/build/route.ts`
- Test: `tests/api/universe-build.test.ts`

- [ ] **Step 5.1: Write the failing tests**

Create `tests/api/universe-build.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const getCurrentUserMock = vi.fn();
const discoverUniverseMock = vi.fn();
const getQuoteMock = vi.fn();
const getFundamentalsMock = vi.fn();
const generateUniverseIdMock = vi.fn();

// supabase client mocks
const eqMaybeSingleThesisMock = vi.fn();
const eqThesisSelectMock = vi.fn(() => ({ maybeSingle: eqMaybeSingleThesisMock }));
const thesisSelectMock = vi.fn(() => ({ eq: eqThesisSelectMock }));

const likeUniversesLimitMock = vi.fn();
const universesSelectMock = vi.fn(() => ({
  like: () => ({ limit: likeUniversesLimitMock }),
}));

const universesInsertMock = vi.fn();
const thesesUpdateEqMock = vi.fn();
const thesesUpdateMock = vi.fn(() => ({ eq: thesesUpdateEqMock }));

const fromMock = vi.fn((table: string) => {
  if (table === "theses") {
    return {
      select: thesisSelectMock,
      update: thesesUpdateMock,
    };
  }
  if (table === "universes") {
    return {
      select: universesSelectMock,
      insert: universesInsertMock,
    };
  }
  throw new Error(`unexpected table ${table}`);
});

const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/agents/universe-discoverer", () => ({
  discoverUniverse: discoverUniverseMock,
}));
vi.mock("@/lib/data/yahoo", () => ({
  getQuote: getQuoteMock,
  getFundamentals: getFundamentalsMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));
vi.mock("@/lib/schemas/universe-id", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/schemas/universe-id")
  >();
  return {
    ...actual,
    generateUniverseId: generateUniverseIdMock,
  };
});

function makeRequest(body: unknown): Request {
  return new Request("http://test/api/universe/build", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const THESIS_ID = "eu_defense_rearmament_cycle_26_05_01";

beforeEach(() => {
  getCurrentUserMock.mockReset();
  discoverUniverseMock.mockReset();
  getQuoteMock.mockReset();
  getFundamentalsMock.mockReset();
  generateUniverseIdMock.mockReset();
  fromMock.mockClear();
  thesisSelectMock.mockClear();
  eqThesisSelectMock.mockClear();
  eqMaybeSingleThesisMock.mockReset();
  universesSelectMock.mockClear();
  likeUniversesLimitMock.mockReset();
  universesInsertMock.mockReset();
  thesesUpdateMock.mockClear();
  thesesUpdateEqMock.mockReset();

  likeUniversesLimitMock.mockResolvedValue({ data: [], error: null });
  universesInsertMock.mockResolvedValue({ error: null });
  thesesUpdateEqMock.mockResolvedValue({ error: null });
  generateUniverseIdMock.mockReturnValue(`${THESIS_ID}_universe_01`);
});

describe("POST /api/universe/build", () => {
  it("returns 400 when body is invalid JSON", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(makeRequest("not-json"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is missing fields", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(makeRequest({ thesis_id: THESIS_ID }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(
      makeRequest({ thesis_id: THESIS_ID, anchor_ticker: "RHM.DE" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when thesis not found", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleThesisMock.mockResolvedValue({ data: null, error: null });
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(
      makeRequest({ thesis_id: thesis.id, anchor_ticker: "RHM.DE" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when thesis belongs to a different user", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    eqMaybeSingleThesisMock.mockResolvedValue({
      data: { id: thesis.id, user_id: "other_user", thesis },
      error: null,
    });
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(
      makeRequest({ thesis_id: thesis.id, anchor_ticker: "RHM.DE" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 unknown_suffix when anchor suffix is not in REGION_BY_SUFFIX", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleThesisMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(
      makeRequest({ thesis_id: thesis.id, anchor_ticker: "STUB.ZZ" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("unknown_suffix");
  });

  it("returns 502 when Yahoo getQuote returns null on the anchor", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleThesisMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    getQuoteMock.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(
      makeRequest({ thesis_id: thesis.id, anchor_ticker: "RHM.DE" }),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("anchor_lookup_failed");
  });

  it("returns 422 discovery_failed when the agent returns ok:false", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleThesisMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    getQuoteMock.mockResolvedValueOnce({ name: "Rheinmetall AG", market_cap_usd: 38e9 });
    getFundamentalsMock.mockResolvedValueOnce({
      sector: "Industrials",
      industry: "Aerospace & Defense",
    });
    discoverUniverseMock.mockResolvedValueOnce({
      ok: false,
      error: "bad tool output",
      raw: { tickers: [] },
    });
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(
      makeRequest({ thesis_id: thesis.id, anchor_ticker: "RHM.DE" }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("discovery_failed");
    expect(body.detail).toBe("bad tool output");
  });

  it("returns 422 too_few_survivors when filtering leaves <5 tickers", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleThesisMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    getQuoteMock.mockResolvedValueOnce({ name: "Rheinmetall AG", market_cap_usd: 38e9 });
    getFundamentalsMock.mockResolvedValueOnce({});
    discoverUniverseMock.mockResolvedValueOnce({
      ok: true,
      tickers: [
        { ticker: "BA.L", exposure_tier: "pure_play", notes: "p1" },
        { ticker: "LDO.MI", exposure_tier: "pure_play", notes: "p2" },
      ],
    });
    // All peers fall below market_cap_min_usd
    getQuoteMock.mockResolvedValue({ name: "Tiny Co", market_cap_usd: 100 });
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(
      makeRequest({ thesis_id: thesis.id, anchor_ticker: "RHM.DE" }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("discovery_failed");
    expect(body.detail).toBe("too_few_survivors");
  });

  it("returns 200, persists universe row, updates thesis.universe_id + version, reports dropped", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleThesisMock.mockResolvedValue({
      data: {
        id: thesis.id,
        user_id: thesis.createdBy,
        version: thesis.version,
        thesis,
      },
      error: null,
    });

    // anchor enrichment
    getQuoteMock.mockResolvedValueOnce({
      name: "Rheinmetall AG",
      market_cap_usd: 38e9,
    });
    getFundamentalsMock.mockResolvedValueOnce({
      sector: "Industrials",
      industry: "Aerospace & Defense",
    });

    discoverUniverseMock.mockResolvedValueOnce({
      ok: true,
      tickers: [
        { ticker: "BA.L", exposure_tier: "pure_play", notes: "UK prime" },
        { ticker: "LDO.MI", exposure_tier: "pure_play", notes: "Italian prime" },
        { ticker: "SAAB-B.ST", exposure_tier: "pure_play", notes: "Swedish prime" },
        { ticker: "STUB.ZZ", exposure_tier: "pure_play", notes: "junk" },
        { ticker: "TINY.L", exposure_tier: "diversified", notes: "below cap" },
        { ticker: "DEAD.MI", exposure_tier: "pure_play", notes: "yahoo error" },
      ],
    });
    // peer enrichment, in order
    getQuoteMock.mockResolvedValueOnce({ name: "BAE Systems plc", market_cap_usd: 52e9 });
    getQuoteMock.mockResolvedValueOnce({ name: "Leonardo S.p.A.", market_cap_usd: 18e9 });
    getQuoteMock.mockResolvedValueOnce({ name: "Saab AB", market_cap_usd: 14e9 });
    // STUB.ZZ never hits getQuote — unknown suffix drops first
    getQuoteMock.mockResolvedValueOnce({ name: "Tiny Co", market_cap_usd: 100_000 });
    getQuoteMock.mockResolvedValueOnce(null); // DEAD.MI

    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(
      makeRequest({ thesis_id: thesis.id, anchor_ticker: "RHM.DE" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.universe).toBeDefined();
    expect(body.universe.id).toBe(`${thesis.id}_universe_01`);
    expect(body.universe.regions).toEqual(thesis.scope.regions);
    expect(body.universe.gics_codes).toEqual(thesis.scope.sectors);
    expect(body.universe.market_cap_min_usd).toBe(thesis.scope.market_cap_min_usd);

    const tickers = body.universe.tickers as Array<{
      ticker: string;
      region: string;
      market_cap_usd_b: number;
      exposure_tier: string;
    }>;
    // Anchor (RHM.DE) plus 3 surviving peers (BA.L, LDO.MI, SAAB-B.ST) = 4
    expect(tickers.map((t) => t.ticker).sort()).toEqual(
      ["BA.L", "LDO.MI", "RHM.DE", "SAAB-B.ST"],
    );
    expect(tickers.find((t) => t.ticker === "RHM.DE")?.market_cap_usd_b).toBe(38);
    expect(tickers.find((t) => t.ticker === "BA.L")?.region).toBe("UK");
    expect(tickers.find((t) => t.ticker === "SAAB-B.ST")?.region).toBe("NORDICS");

    expect(body.dropped).toBeDefined();
    const drops = body.dropped as Array<{ ticker: string; reason: string }>;
    expect(drops.find((d) => d.ticker === "STUB.ZZ")?.reason).toBe(
      "unknown_suffix",
    );
    expect(drops.find((d) => d.ticker === "TINY.L")?.reason).toBe(
      "below_market_cap_floor",
    );
    expect(drops.find((d) => d.ticker === "DEAD.MI")?.reason).toBe(
      "yahoo_lookup_failed",
    );

    expect(universesInsertMock).toHaveBeenCalledTimes(1);
    const inserted = universesInsertMock.mock.calls[0][0];
    expect(inserted.id).toBe(`${thesis.id}_universe_01`);
    expect(inserted.created_by).toBe(thesis.createdBy);

    expect(thesesUpdateMock).toHaveBeenCalledTimes(1);
    const updateArg = thesesUpdateMock.mock.calls[0][0];
    expect(updateArg.version).toBe(thesis.version + 1);
    expect(updateArg.thesis.universe_id).toBe(`${thesis.id}_universe_01`);
    expect(thesesUpdateEqMock).toHaveBeenCalledWith("id", thesis.id);
  });
});
```

- [ ] **Step 5.2: Run tests; verify they fail**

```bash
npx vitest run tests/api/universe-build.test.ts
```

Expected: FAIL with "Cannot find module '@/app/api/universe/build/route'".

- [ ] **Step 5.3: Write the implementation**

Create `app/api/universe/build/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverUniverse } from "@/lib/agents/universe-discoverer";
import { getCurrentUser } from "@/lib/auth/session";
import { getQuote, getFundamentals } from "@/lib/data/yahoo";
import { getRegionForTicker } from "@/lib/data/regions";
import { ThesisIdSchema, type Thesis } from "@/lib/schemas/thesis";
import {
  UniverseSchema,
  type Universe,
  type UniverseTicker,
} from "@/lib/schemas/universe";
import { generateUniverseId } from "@/lib/schemas/universe-id";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  thesis_id: ThesisIdSchema,
  anchor_ticker: z.string().min(1).max(40),
});

interface DroppedTicker {
  ticker: string;
  reason: "unknown_suffix" | "yahoo_lookup_failed" | "below_market_cap_floor";
}

const MIN_SURVIVORS = 5;

export async function POST(req: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const { thesis_id, anchor_ticker } = parsed.data;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const supabase = getSupabaseServerClient();

    const thesisRow = await supabase
      .from("theses")
      .select("*")
      .eq("id", thesis_id)
      .maybeSingle();
    if (
      thesisRow.error ||
      !thesisRow.data ||
      thesisRow.data.user_id !== user.id
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const thesis = thesisRow.data.thesis as Thesis;
    const currentVersion = (thesisRow.data.version as number | undefined) ?? thesis.version;

    const anchorRegion = getRegionForTicker(anchor_ticker);
    if (anchorRegion === null) {
      const lastDot = anchor_ticker.lastIndexOf(".");
      const suffix = lastDot === -1 ? "" : anchor_ticker.slice(lastDot);
      return NextResponse.json(
        { error: "unknown_suffix", suffix },
        { status: 400 },
      );
    }

    const anchorQuote = await getQuote(anchor_ticker);
    if (!anchorQuote) {
      return NextResponse.json(
        { error: "anchor_lookup_failed" },
        { status: 502 },
      );
    }
    const anchorFundamentals = (await getFundamentals(anchor_ticker)) ?? {};

    let discovery;
    try {
      discovery = await discoverUniverse({
        thesis,
        anchor: {
          ticker: anchor_ticker,
          name: anchorQuote.name,
          sector: anchorFundamentals.sector,
          industry: anchorFundamentals.industry,
          market_cap_usd: anchorQuote.market_cap_usd,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[/api/universe/build] discover_failed:", message);
      return NextResponse.json(
        { error: "discovery_failed", detail: message },
        { status: 422 },
      );
    }
    if (!discovery.ok) {
      return NextResponse.json(
        { error: "discovery_failed", detail: discovery.error, raw: discovery.raw ?? null },
        { status: 422 },
      );
    }

    const tickers: UniverseTicker[] = [];
    const dropped: DroppedTicker[] = [];

    // Always seed the anchor first (deduped against agent output).
    const anchorTicker: UniverseTicker = {
      ticker: anchor_ticker,
      name: anchorQuote.name,
      region: anchorRegion,
      market_cap_usd_b: (anchorQuote.market_cap_usd ?? 0) / 1e9,
      exposure_tier: "pure_play",
      notes: "Anchor",
    };
    tickers.push(anchorTicker);

    for (const proposed of discovery.tickers) {
      if (proposed.ticker === anchor_ticker) continue; // dedupe
      const region = getRegionForTicker(proposed.ticker);
      if (region === null) {
        dropped.push({ ticker: proposed.ticker, reason: "unknown_suffix" });
        continue;
      }
      const quote = await getQuote(proposed.ticker);
      if (!quote) {
        dropped.push({ ticker: proposed.ticker, reason: "yahoo_lookup_failed" });
        continue;
      }
      if (
        quote.market_cap_usd === null ||
        quote.market_cap_usd < thesis.scope.market_cap_min_usd
      ) {
        dropped.push({
          ticker: proposed.ticker,
          reason: "below_market_cap_floor",
        });
        continue;
      }
      tickers.push({
        ticker: proposed.ticker,
        name: quote.name,
        region,
        market_cap_usd_b: quote.market_cap_usd / 1e9,
        exposure_tier: proposed.exposure_tier,
        notes: proposed.notes,
      });
    }

    if (tickers.length < MIN_SURVIVORS) {
      return NextResponse.json(
        { error: "discovery_failed", detail: "too_few_survivors", dropped },
        { status: 422 },
      );
    }

    // Generate id by looking up existing rows for this thesis.
    const existing = await supabase
      .from("universes")
      .select("id")
      .like("id", `${thesis_id}_universe_%`)
      .limit(100);
    if (existing.error) {
      console.error("[/api/universe/build] lookup_failed:", existing.error);
      return NextResponse.json(
        { error: "persist_failed", details: existing.error.message },
        { status: 500 },
      );
    }
    const existingIds = (existing.data ?? []).map(
      (row: { id: string }) => row.id,
    );
    const id = generateUniverseId({ thesisId: thesis_id, existingIds });

    const nowIso = new Date().toISOString();
    const universe: Universe = {
      id,
      created_at: nowIso,
      last_refreshed: nowIso,
      gics_codes: thesis.scope.sectors,
      regions: thesis.scope.regions,
      market_cap_min_usd: thesis.scope.market_cap_min_usd,
      tickers,
    };

    const validated = UniverseSchema.safeParse(universe);
    if (!validated.success) {
      console.error(
        "[/api/universe/build] universe failed schema:",
        validated.error.message,
      );
      return NextResponse.json(
        { error: "discovery_failed", detail: validated.error.message },
        { status: 422 },
      );
    }

    const insert = await supabase.from("universes").insert({
      id,
      created_by: user.id,
      universe: validated.data,
      created_at: nowIso,
      refreshed_at: nowIso,
    });
    if (insert.error) {
      console.error("[/api/universe/build] persist_failed:", insert.error);
      return NextResponse.json(
        { error: "persist_failed", details: insert.error.message },
        { status: 500 },
      );
    }

    const nextThesis = { ...thesis, universe_id: id };
    const update = await supabase
      .from("theses")
      .update({ thesis: nextThesis, version: currentVersion + 1 })
      .eq("id", thesis_id);
    if (update.error) {
      console.error(
        "[/api/universe/build] thesis update failed:",
        update.error,
      );
      return NextResponse.json(
        { error: "persist_failed", details: update.error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { universe: validated.data, dropped },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/universe/build] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", details: message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 5.4: Run tests; verify they pass**

```bash
npx vitest run tests/api/universe-build.test.ts
```

Expected: PASS — 10 tests green.

- [ ] **Step 5.5: Commit**

```bash
git add app/api/universe/build/route.ts tests/api/universe-build.test.ts
git commit -m "$(cat <<'EOF'
feat(s3): POST /api/universe/build with anchor + enrichment orchestration

Body validation -> session -> owner-scoped thesis fetch -> anchor suffix
check -> Yahoo enrich anchor -> agent discover -> per-peer enrichment
(suffix/yahoo/market-cap-floor checks, dropped[] tracking) -> generate
<thesis_id>_universe_NN -> insert universe row -> update thesis with
universe_id + version+1.

Error matrix: 400 invalid_body/unknown_suffix, 401 unauthenticated,
404 not_found, 422 discovery_failed (agent failure, schema failure,
too_few_survivors), 502 anchor_lookup_failed, 500 persist_failed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: GET + PATCH /api/universe/[id]

**What it does:** GET returns the universe (owner-scoped via `created_by`). PATCH validates the body with `UniverseSchema`, asserts `body.id === param.id`, replaces the row's `universe` jsonb, bumps `refreshed_at`.

**Files:**
- Create: `app/api/universe/[id]/route.ts`
- Test: `tests/api/universe-get.test.ts`
- Test: `tests/api/universe-patch.test.ts`

- [ ] **Step 6.1: Write the failing GET tests**

Create `tests/api/universe-get.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalUniverse } from "@/tests/fixtures/universe";

const getCurrentUserMock = vi.fn();
const eqMaybeSingleMock = vi.fn();
const eqSelectMock = vi.fn(() => ({ maybeSingle: eqMaybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqSelectMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));
const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  fromMock.mockClear();
  selectMock.mockClear();
  eqSelectMock.mockClear();
  eqMaybeSingleMock.mockReset();
});

describe("GET /api/universe/[id]", () => {
  it("returns 401 when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const universe = cloneCanonicalUniverse();
    const { GET } = await import("@/app/api/universe/[id]/route");
    const res = await GET(
      new Request(`http://test/api/universe/${universe.id}`),
      paramsFor(universe.id),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when universe not found", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    eqMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const universe = cloneCanonicalUniverse();
    const { GET } = await import("@/app/api/universe/[id]/route");
    const res = await GET(
      new Request(`http://test/api/universe/${universe.id}`),
      paramsFor(universe.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when universe belongs to a different user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const universe = cloneCanonicalUniverse();
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: universe.id, created_by: "other_user", universe },
      error: null,
    });
    const { GET } = await import("@/app/api/universe/[id]/route");
    const res = await GET(
      new Request(`http://test/api/universe/${universe.id}`),
      paramsFor(universe.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with universe on happy path", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const universe = cloneCanonicalUniverse();
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: universe.id, created_by: "u", universe },
      error: null,
    });
    const { GET } = await import("@/app/api/universe/[id]/route");
    const res = await GET(
      new Request(`http://test/api/universe/${universe.id}`),
      paramsFor(universe.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.universe).toEqual(universe);
  });
});
```

- [ ] **Step 6.2: Write the failing PATCH tests**

Create `tests/api/universe-patch.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalUniverse } from "@/tests/fixtures/universe";

const getCurrentUserMock = vi.fn();

const eqMaybeSingleMock = vi.fn();
const eqSelectMock = vi.fn(() => ({ maybeSingle: eqMaybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqSelectMock }));

const eqUpdateMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: eqUpdateMock }));

const fromMock = vi.fn(() => ({ select: selectMock, update: updateMock }));
const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(id: string, body: unknown): Request {
  return new Request(`http://test/api/universe/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  fromMock.mockClear();
  selectMock.mockClear();
  eqSelectMock.mockClear();
  eqMaybeSingleMock.mockReset();
  updateMock.mockClear();
  eqUpdateMock.mockReset();
  eqUpdateMock.mockResolvedValue({ error: null });
});

describe("PATCH /api/universe/[id]", () => {
  it("returns 401 when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const universe = cloneCanonicalUniverse();
    const { PATCH } = await import("@/app/api/universe/[id]/route");
    const res = await PATCH(
      makeRequest(universe.id, universe),
      paramsFor(universe.id),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 invalid_body on bad JSON", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const universe = cloneCanonicalUniverse();
    const { PATCH } = await import("@/app/api/universe/[id]/route");
    const res = await PATCH(makeRequest(universe.id, "not-json"), paramsFor(universe.id));
    expect(res.status).toBe(400);
  });

  it("returns 422 invalid_universe when body fails Zod", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const universe = cloneCanonicalUniverse();
    universe.tickers[0].exposure_tier = "speculative" as never;
    const { PATCH } = await import("@/app/api/universe/[id]/route");
    const res = await PATCH(makeRequest(universe.id, universe), paramsFor(universe.id));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_universe");
  });

  it("returns 400 id_mismatch when body id doesn't match path id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const universe = cloneCanonicalUniverse();
    const { PATCH } = await import("@/app/api/universe/[id]/route");
    const res = await PATCH(
      makeRequest("different_id_universe_01", universe),
      paramsFor("different_id_universe_01"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("id_mismatch");
  });

  it("returns 404 when universe not found", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    eqMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const universe = cloneCanonicalUniverse();
    const { PATCH } = await import("@/app/api/universe/[id]/route");
    const res = await PATCH(makeRequest(universe.id, universe), paramsFor(universe.id));
    expect(res.status).toBe(404);
  });

  it("returns 404 when universe belongs to a different user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const universe = cloneCanonicalUniverse();
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: universe.id, created_by: "other_user" },
      error: null,
    });
    const { PATCH } = await import("@/app/api/universe/[id]/route");
    const res = await PATCH(makeRequest(universe.id, universe), paramsFor(universe.id));
    expect(res.status).toBe(404);
  });

  it("returns 200, replaces universe and bumps refreshed_at", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const universe = cloneCanonicalUniverse();
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: universe.id, created_by: "u" },
      error: null,
    });
    universe.tickers[0].notes = "edited";

    const { PATCH } = await import("@/app/api/universe/[id]/route");
    const res = await PATCH(
      makeRequest(universe.id, universe),
      paramsFor(universe.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.universe).toEqual(universe);

    expect(updateMock).toHaveBeenCalledTimes(1);
    const updateArg = updateMock.mock.calls[0][0];
    expect(updateArg.universe).toEqual(universe);
    expect(typeof updateArg.refreshed_at).toBe("string");
    expect(eqUpdateMock).toHaveBeenCalledWith("id", universe.id);
  });

  it("returns 500 persist_failed when update errors", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const universe = cloneCanonicalUniverse();
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: universe.id, created_by: "u" },
      error: null,
    });
    eqUpdateMock.mockResolvedValue({ error: { message: "db down" } });
    const { PATCH } = await import("@/app/api/universe/[id]/route");
    const res = await PATCH(makeRequest(universe.id, universe), paramsFor(universe.id));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("persist_failed");
  });
});
```

- [ ] **Step 6.3: Run both test files; verify they fail**

```bash
npx vitest run tests/api/universe-get.test.ts tests/api/universe-patch.test.ts
```

Expected: FAIL with "Cannot find module '@/app/api/universe/[id]/route'".

- [ ] **Step 6.4: Write the implementation**

Create `app/api/universe/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { UniverseSchema } from "@/lib/schemas/universe";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("universes")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data || data.created_by !== user.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ universe: data.universe }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/universe/[id]:GET] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", details: message },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const parsed = UniverseSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_universe", detail: parsed.error.message },
        { status: 422 },
      );
    }
    const universe = parsed.data;

    if (universe.id !== id) {
      return NextResponse.json({ error: "id_mismatch" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const fetched = await supabase
      .from("universes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (
      fetched.error ||
      !fetched.data ||
      fetched.data.created_by !== user.id
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const refreshedAt = new Date().toISOString();
    const update = await supabase
      .from("universes")
      .update({ universe, refreshed_at: refreshedAt })
      .eq("id", id);
    if (update.error) {
      console.error("[/api/universe/[id]:PATCH] persist_failed:", update.error);
      return NextResponse.json(
        { error: "persist_failed", details: update.error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ universe }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/universe/[id]:PATCH] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", details: message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 6.5: Run tests; verify they pass**

```bash
npx vitest run tests/api/universe-get.test.ts tests/api/universe-patch.test.ts
```

Expected: PASS — 4 GET tests + 8 PATCH tests.

- [ ] **Step 6.6: Commit**

```bash
git add app/api/universe/[id]/route.ts tests/api/universe-get.test.ts tests/api/universe-patch.test.ts
git commit -m "$(cat <<'EOF'
feat(s3): GET + PATCH /api/universe/[id]

GET returns the universe owner-scoped via created_by. PATCH validates
the full payload with UniverseSchema, asserts body.id == path id,
owner-checks the existing row, replaces universe jsonb and bumps
refreshed_at.

Error matrix: 400 invalid_body/id_mismatch, 401 unauthenticated,
404 not_found, 422 invalid_universe, 500 persist_failed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: AnchorPicker component

**What it does:** Controlled component. Free-text ticker input plus chips populated from `tickers_seed`. Click chip → populate input. Submit validates suffix via `REGION_BY_SUFFIX` and triggers parent callback.

**Files:**
- Create: `components/anchor-picker.tsx`
- Test: `tests/components/anchor-picker.test.tsx`

- [ ] **Step 7.1: Write the failing tests**

Create `tests/components/anchor-picker.test.tsx`:

```tsx
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnchorPicker } from "@/components/anchor-picker";

describe("<AnchorPicker>", () => {
  it("renders the free-text input and disables submit when empty", () => {
    render(
      <AnchorPicker
        tickers_seed={["RHM.DE", "BA.L"]}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    );
    expect(screen.getByPlaceholderText(/yahoo ticker/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /build universe/i })).toBeDisabled();
  });

  it("renders chips from tickers_seed", () => {
    render(
      <AnchorPicker
        tickers_seed={["RHM.DE", "BA.L", "LDO.MI"]}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    );
    expect(screen.getByRole("button", { name: "RHM.DE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "BA.L" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LDO.MI" })).toBeInTheDocument();
  });

  it("does not render chip row when tickers_seed is empty", () => {
    render(
      <AnchorPicker tickers_seed={[]} onSubmit={vi.fn()} disabled={false} />,
    );
    expect(screen.queryByText(/suggested from thesis/i)).not.toBeInTheDocument();
  });

  it("populates the input when a chip is clicked", async () => {
    const user = userEvent.setup();
    render(
      <AnchorPicker
        tickers_seed={["RHM.DE", "BA.L"]}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "BA.L" }));
    expect(screen.getByPlaceholderText(/yahoo ticker/i)).toHaveValue("BA.L");
  });

  it("calls onSubmit with the ticker on submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <AnchorPicker
        tickers_seed={["RHM.DE"]}
        onSubmit={onSubmit}
        disabled={false}
      />,
    );
    await user.type(screen.getByPlaceholderText(/yahoo ticker/i), "RHM.DE");
    await user.click(screen.getByRole("button", { name: /build universe/i }));
    expect(onSubmit).toHaveBeenCalledWith("RHM.DE");
  });

  it("rejects unknown suffix and surfaces an inline error", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <AnchorPicker tickers_seed={[]} onSubmit={onSubmit} disabled={false} />,
    );
    await user.type(screen.getByPlaceholderText(/yahoo ticker/i), "STUB.ZZ");
    await user.click(screen.getByRole("button", { name: /build universe/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/unknown ticker suffix/i);
  });

  it("trims whitespace and uppercases before submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <AnchorPicker tickers_seed={[]} onSubmit={onSubmit} disabled={false} />,
    );
    await user.type(screen.getByPlaceholderText(/yahoo ticker/i), "  rhm.de  ");
    await user.click(screen.getByRole("button", { name: /build universe/i }));
    expect(onSubmit).toHaveBeenCalledWith("RHM.DE");
  });

  it("respects the disabled prop", () => {
    render(
      <AnchorPicker
        tickers_seed={["RHM.DE"]}
        onSubmit={vi.fn()}
        disabled={true}
      />,
    );
    expect(screen.getByPlaceholderText(/yahoo ticker/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /build universe/i })).toBeDisabled();
  });
});
```

- [ ] **Step 7.2: Run tests; verify they fail**

```bash
npx vitest run tests/components/anchor-picker.test.tsx
```

Expected: FAIL with "Cannot find module '@/components/anchor-picker'".

- [ ] **Step 7.3: Write the implementation**

Create `components/anchor-picker.tsx`:

```tsx
"use client";

import React, { useState, type FormEvent } from "react";
import { getRegionForTicker } from "@/lib/data/regions";

interface AnchorPickerProps {
  tickers_seed: string[];
  onSubmit: (anchor: string) => void;
  disabled: boolean;
}

export function AnchorPicker({
  tickers_seed,
  onSubmit,
  disabled,
}: AnchorPickerProps) {
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submitDisabled = disabled || ticker.trim().length === 0;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitDisabled) return;
    const normalised = ticker.trim().toUpperCase();
    const region = getRegionForTicker(normalised);
    if (region === null) {
      const lastDot = normalised.lastIndexOf(".");
      const suffix = lastDot === -1 ? "(no suffix)" : normalised.slice(lastDot);
      setError(`Unknown ticker suffix ${suffix} — not a supported Yahoo market`);
      return;
    }
    setError(null);
    onSubmit(normalised);
  }

  function handleChipClick(t: string) {
    setTicker(t);
    setError(null);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-neutral-700">
          Anchor ticker for this universe
        </span>
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          disabled={disabled}
          placeholder="Yahoo ticker (e.g. RHM.DE)"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none disabled:bg-neutral-100"
        />
      </label>

      {tickers_seed.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span>Suggested from thesis:</span>
          {tickers_seed.map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => handleChipClick(t)}
              disabled={disabled}
              className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={submitDisabled}
          className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          Build universe →
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 7.4: Run tests; verify they pass**

```bash
npx vitest run tests/components/anchor-picker.test.tsx
```

Expected: PASS — 8 tests green.

- [ ] **Step 7.5: Commit**

```bash
git add components/anchor-picker.tsx tests/components/anchor-picker.test.tsx
git commit -m "$(cat <<'EOF'
feat(s3): AnchorPicker — free-text + tickers_seed chips with suffix validation

Free-text input is the primary affordance; tickers_seed render as
clickable chips below that populate the input. Submit normalises
(trim + uppercase), validates suffix via getRegionForTicker, surfaces
'Unknown ticker suffix' inline on failure. Chips row hidden when seed
list is empty.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: UniverseTable component

**What it does:** Editable table over a universe. Columns: ticker, name, region, market_cap_usd_b, exposure_tier (select), notes (input), remove. "Add row" affordance with suffix validation + Yahoo enrich. "Save" PATCHes; disabled when clean. "Refresh from scope" triggers parent.

**Files:**
- Create: `components/universe-table.tsx`
- Test: `tests/components/universe-table.test.tsx`

- [ ] **Step 8.1: Write the failing tests**

Create `tests/components/universe-table.test.tsx`:

```tsx
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UniverseTable } from "@/components/universe-table";
import { cloneCanonicalUniverse } from "@/tests/fixtures/universe";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("<UniverseTable>", () => {
  it("renders all tickers from the initial universe", () => {
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} onRefresh={vi.fn()} />);
    for (const t of u.tickers) {
      expect(screen.getByText(t.ticker)).toBeInTheDocument();
      expect(screen.getByText(t.name)).toBeInTheDocument();
    }
  });

  it("Save is disabled when nothing has been edited", () => {
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("editing notes enables Save and PATCHes with the full payload on click", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    const onSaved = vi.fn();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ universe: { ...u, tickers: [{ ...u.tickers[0], notes: "edited" }, ...u.tickers.slice(1)] } }),
    });

    render(<UniverseTable initial={u} onSaved={onSaved} onRefresh={vi.fn()} />);

    const notesInputs = screen.getAllByPlaceholderText(/notes/i);
    await user.clear(notesInputs[0]);
    await user.type(notesInputs[0], "edited");

    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/universe/${u.id}`,
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("changing exposure_tier dropdown enables Save", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} onRefresh={vi.fn()} />);
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "diversified");
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("Remove button drops the row and enables Save", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} onRefresh={vi.fn()} />);
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    const initialCount = removeButtons.length;
    await user.click(removeButtons[0]);
    const remaining = screen.getAllByRole("button", { name: /remove/i });
    expect(remaining.length).toBe(initialCount - 1);
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("Add row form appends a new ticker after Yahoo fetch succeeds", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} onRefresh={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /add row/i }));

    const newRowInput = screen.getByPlaceholderText(/new yahoo ticker/i);
    await user.type(newRowInput, "DASF.PA"); // Dassault Aviation, EUROZONE

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ name: "Dassault Aviation", market_cap_usd: 25e9 }),
    });

    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText("DASF.PA")).toBeInTheDocument();
    });
    expect(screen.getByText("Dassault Aviation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("Add row rejects unknown suffix without calling Yahoo", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} onRefresh={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /add row/i }));
    await user.type(
      screen.getByPlaceholderText(/new yahoo ticker/i),
      "STUB.ZZ",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/unknown ticker suffix/i);
  });

  it("Refresh from scope calls onRefresh", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    const onRefresh = vi.fn();
    render(
      <UniverseTable initial={u} onSaved={vi.fn()} onRefresh={onRefresh} />,
    );
    await user.click(screen.getByRole("button", { name: /refresh from scope/i }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("Save surfaces 422 detail in an alert when PATCH fails validation", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        error: "invalid_universe",
        detail: "tickers[0].name too short",
      }),
    });
    render(<UniverseTable initial={u} onSaved={vi.fn()} onRefresh={vi.fn()} />);
    const notesInputs = screen.getAllByPlaceholderText(/notes/i);
    await user.clear(notesInputs[0]);
    await user.type(notesInputs[0], "x");
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/tickers\[0\]\.name too short/);
    });
  });
});
```

- [ ] **Step 8.2: Run tests; verify they fail**

```bash
npx vitest run tests/components/universe-table.test.tsx
```

Expected: FAIL with "Cannot find module '@/components/universe-table'".

- [ ] **Step 8.3: Write the implementation**

Create `components/universe-table.tsx`:

```tsx
"use client";

import React, { useMemo, useState } from "react";
import { getRegionForTicker } from "@/lib/data/regions";
import type { Universe, UniverseTicker, ExposureTier } from "@/lib/schemas/universe";

interface UniverseTableProps {
  initial: Universe;
  onSaved: (next: Universe) => void;
  onRefresh: () => void;
}

interface YahooQuoteResponse {
  name: string;
  market_cap_usd: number | null;
}

const TIER_OPTIONS: ExposureTier[] = ["pure_play", "diversified", "etf_proxy"];

function ticketsEqual(a: UniverseTicker[], b: UniverseTicker[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.ticker !== y.ticker ||
      x.name !== y.name ||
      x.region !== y.region ||
      x.market_cap_usd_b !== y.market_cap_usd_b ||
      x.exposure_tier !== y.exposure_tier ||
      (x.notes ?? "") !== (y.notes ?? "")
    ) {
      return false;
    }
  }
  return true;
}

export function UniverseTable({ initial, onSaved, onRefresh }: UniverseTableProps) {
  const [tickers, setTickers] = useState<UniverseTicker[]>(initial.tickers);
  const [addingRow, setAddingRow] = useState(false);
  const [newRowTicker, setNewRowTicker] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingPending, setAddingPending] = useState(false);

  const dirty = useMemo(() => !ticketsEqual(tickers, initial.tickers), [tickers, initial.tickers]);

  function updateRow(index: number, patch: Partial<UniverseTicker>) {
    setTickers((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  function removeRow(index: number) {
    setTickers((rows) => rows.filter((_, i) => i !== index));
  }

  async function lookupTickerForRow(t: string): Promise<YahooQuoteResponse | null> {
    // Reuse the /api/universe/build flow's underlying Yahoo? Cleaner to expose
    // it via a thin endpoint, but for S3 we route through fetch to a tiny
    // helper route. To keep S3 scope tight, we add a single dedicated endpoint
    // /api/universe/quote that wraps lib/data/yahoo. NOTE: that endpoint is
    // created here inline; if the implementer realises it's missing, add a
    // single GET /api/universe/quote?ticker=... route that calls getQuote.
    const res = await fetch(`/api/universe/quote?ticker=${encodeURIComponent(t)}`, {
      method: "GET",
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as YahooQuoteResponse | null;
  }

  async function handleAddRow() {
    setAddError(null);
    const normalised = newRowTicker.trim().toUpperCase();
    if (normalised.length === 0) return;
    const region = getRegionForTicker(normalised);
    if (region === null) {
      const lastDot = normalised.lastIndexOf(".");
      const suffix = lastDot === -1 ? "(no suffix)" : normalised.slice(lastDot);
      setAddError(`Unknown ticker suffix ${suffix} — not a supported Yahoo market`);
      return;
    }
    if (tickers.some((t) => t.ticker === normalised)) {
      setAddError("Ticker already in the universe");
      return;
    }
    setAddingPending(true);
    const quote = await lookupTickerForRow(normalised);
    setAddingPending(false);
    if (!quote || !quote.name) {
      setAddError("Yahoo did not return data for that ticker");
      return;
    }
    const row: UniverseTicker = {
      ticker: normalised,
      name: quote.name,
      region,
      market_cap_usd_b: (quote.market_cap_usd ?? 0) / 1e9,
      exposure_tier: "diversified",
      notes: "",
    };
    setTickers((rows) => [...rows, row]);
    setNewRowTicker("");
    setAddingRow(false);
  }

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    const payload: Universe = { ...initial, tickers };
    try {
      const res = await fetch(`/api/universe/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as
        | { universe?: Universe; error?: string; detail?: string }
        | null;
      if (!res.ok || !body?.universe) {
        setSaveError(body?.detail ?? body?.error ?? `Save failed (${res.status})`);
        setSaving(false);
        return;
      }
      onSaved(body.universe);
      setSaving(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unexpected error");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-md border border-neutral-200">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Ticker</th>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Region</th>
              <th className="px-3 py-2 text-right font-medium">Mcap (USD bn)</th>
              <th className="px-3 py-2 text-left font-medium">Exposure</th>
              <th className="px-3 py-2 text-left font-medium">Notes</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {tickers.map((t, i) => (
              <tr key={`${t.ticker}-${i}`}>
                <td className="px-3 py-2 font-mono text-xs">{t.ticker}</td>
                <td className="px-3 py-2">{t.name}</td>
                <td className="px-3 py-2 text-xs">{t.region}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {t.market_cap_usd_b.toFixed(1)}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={t.exposure_tier}
                    onChange={(e) =>
                      updateRow(i, {
                        exposure_tier: e.target.value as ExposureTier,
                      })
                    }
                    className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs"
                  >
                    {TIER_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={t.notes ?? ""}
                    placeholder="Notes"
                    onChange={(e) => updateRow(i, { notes: e.target.value })}
                    className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addingRow ? (
        <div className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newRowTicker}
              onChange={(e) => setNewRowTicker(e.target.value)}
              placeholder="New Yahoo ticker (e.g. DASF.PA)"
              className="flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
              disabled={addingPending}
            />
            <button
              type="button"
              onClick={handleAddRow}
              disabled={addingPending}
              className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-400"
            >
              {addingPending ? "Looking up..." : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingRow(false);
                setNewRowTicker("");
                setAddError(null);
              }}
              disabled={addingPending}
              className="rounded border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
            >
              Cancel
            </button>
          </div>
          {addError ? (
            <p className="text-xs text-red-600" role="alert">
              {addError}
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setAddingRow(true)}
            className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            + Add row
          </button>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Refresh from scope
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {saveError ? (
        <p className="text-sm text-red-600" role="alert">
          {saveError}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 8.4: Add the `GET /api/universe/quote` helper endpoint**

The UniverseTable's "Add row" flow needs to look up a single ticker. Add a thin GET endpoint that wraps `getQuote`.

Create `app/api/universe/quote/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getRegionForTicker } from "@/lib/data/regions";
import { getQuote } from "@/lib/data/yahoo";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const ticker = url.searchParams.get("ticker");
  if (!ticker || ticker.length === 0 || ticker.length > 40) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (getRegionForTicker(ticker) === null) {
    const lastDot = ticker.lastIndexOf(".");
    const suffix = lastDot === -1 ? "" : ticker.slice(lastDot);
    return NextResponse.json(
      { error: "unknown_suffix", suffix },
      { status: 400 },
    );
  }

  const quote = await getQuote(ticker);
  if (!quote) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
  }
  return NextResponse.json(quote, { status: 200 });
}
```

(No standalone test file for this endpoint — it's a 5-line wrapper around already-tested `getQuote`. The UniverseTable test covers the integration via fetch mocks.)

- [ ] **Step 8.5: Run tests; verify they pass**

```bash
npx vitest run tests/components/universe-table.test.tsx
```

Expected: PASS — 9 tests green.

- [ ] **Step 8.6: Commit**

```bash
git add components/universe-table.tsx tests/components/universe-table.test.tsx app/api/universe/quote/route.ts
git commit -m "$(cat <<'EOF'
feat(s3): UniverseTable + thin /api/universe/quote helper

Editable table: exposure_tier dropdown, notes inline input, Remove per
row, Add row flow with suffix validation and Yahoo lookup, Save
PATCHes the full payload, Refresh-from-scope triggers parent. Dirty
state from element-wise comparison.

The Add row flow needs a single Yahoo quote at runtime; add a thin
GET /api/universe/quote?ticker=... helper that wraps lib/data/yahoo
(owner-gated via getCurrentUser, suffix-validated before the fetch).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Mount AnchorPicker + UniverseTable on the thesis page; light up Stage 2

**What it does:** Edits `thesis-detail.client.tsx` (the S2 wrapper) to host the universe affordance. When `thesis.universe_id` is null, show `<AnchorPicker>`. On successful build, fetch the universe and render `<UniverseTable>`. `<StageList>` lights up Stage 2 when a universe is attached.

**Files:**
- Modify: `app/thesis/[id]/thesis-detail.client.tsx`
- Modify: `components/stage-list.tsx`

- [ ] **Step 9.1: Read the existing client wrapper**

Run:

```bash
cat app/thesis/[id]/thesis-detail.client.tsx
```

Understand the current structure (S2 set up: useState<Thesis>, renders ThesisJsonView + ThesisEditor). The edit adds AnchorPicker / UniverseTable conditional on `thesis.universe_id`.

- [ ] **Step 9.2: Read the existing StageList**

Run:

```bash
cat components/stage-list.tsx
```

Note the props shape and how Stage 1 is highlighted. Stage 2 will follow the same pattern, conditioned on a new prop (`universeAttached: boolean`).

- [ ] **Step 9.3: Update `app/thesis/[id]/thesis-detail.client.tsx`**

Replace the file with this content (preserves S2's editor mounting; adds the universe affordance):

```tsx
"use client";

import React, { useState, useEffect } from "react";
import { AnchorPicker } from "@/components/anchor-picker";
import { ThesisEditor } from "@/components/thesis-editor";
import { ThesisJsonView } from "@/components/thesis-json-view";
import { UniverseTable } from "@/components/universe-table";
import type { Thesis } from "@/lib/schemas/thesis";
import type { Universe } from "@/lib/schemas/universe";

interface ThesisDetailProps {
  initial: Thesis;
}

interface DroppedTicker {
  ticker: string;
  reason: string;
}

export function ThesisDetail({ initial }: ThesisDetailProps) {
  const [thesis, setThesis] = useState<Thesis>(initial);
  const [universe, setUniverse] = useState<Universe | null>(null);
  const [picking, setPicking] = useState<boolean>(true);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [dropped, setDropped] = useState<DroppedTicker[]>([]);

  useEffect(() => {
    if (!thesis.universe_id || universe !== null) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/universe/${thesis.universe_id}`);
      if (!res.ok) return;
      const body = (await res.json().catch(() => null)) as
        | { universe?: Universe }
        | null;
      if (!cancelled && body?.universe) {
        setUniverse(body.universe);
        setPicking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [thesis.universe_id, universe]);

  async function handleBuild(anchor: string) {
    setBuilding(true);
    setBuildError(null);
    setDropped([]);
    try {
      const res = await fetch("/api/universe/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis_id: thesis.id, anchor_ticker: anchor }),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            universe?: Universe;
            dropped?: DroppedTicker[];
            error?: string;
            detail?: string;
          }
        | null;
      if (!res.ok || !body?.universe) {
        setBuildError(body?.detail ?? body?.error ?? `Build failed (${res.status})`);
        setBuilding(false);
        return;
      }
      setUniverse(body.universe);
      setThesis((t) => ({ ...t, universe_id: body.universe!.id }));
      setDropped(body.dropped ?? []);
      setPicking(false);
      setBuilding(false);
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Unexpected error");
      setBuilding(false);
    }
  }

  function handleRefresh() {
    setPicking(true);
    setUniverse(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <ThesisJsonView thesis={thesis} />
      <ThesisEditor thesis={thesis} onApplied={setThesis} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
          Stage 2 — Universe
        </h2>
        {picking || universe === null ? (
          <AnchorPicker
            tickers_seed={thesis.scope.tickers_seed}
            onSubmit={handleBuild}
            disabled={building}
          />
        ) : (
          <UniverseTable
            initial={universe}
            onSaved={setUniverse}
            onRefresh={handleRefresh}
          />
        )}
        {dropped.length > 0 ? (
          <details className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
            <summary className="cursor-pointer font-medium">
              {dropped.length} ticker(s) filtered during build
            </summary>
            <ul className="mt-2 list-disc pl-5">
              {dropped.map((d) => (
                <li key={d.ticker}>
                  <code className="font-mono">{d.ticker}</code> — {d.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {buildError ? (
          <p className="text-sm text-red-600" role="alert">
            {buildError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
```

- [ ] **Step 9.4: Update `components/stage-list.tsx`**

Read the existing file and identify the Stage 2 row. Add the `universeAttached: boolean` prop and condition the Stage 2 row's status on it (light it up green when true). Show exact diff before editing — do not change unrelated stages. The simplest version reads:

```tsx
// Add to ThesisDetailProps for the parent that uses StageList:
//   universeAttached: thesis.universe_id !== null && universe !== null && universe.tickers.length > 0
//
// In StageList props:
//   { stage1Complete?: boolean; universeAttached?: boolean }
// (preserve any existing optional flag for stage 1; just add universeAttached)
//
// In the Stage 2 row rendering, replace the "placeholder" status with:
//   universeAttached ? "complete" : "placeholder"
```

If the existing StageList doesn't have a stage-by-stage prop pattern yet, the minimal change is: accept a single optional `universeAttached?: boolean` prop and switch the Stage 2 row's class from neutral to `text-green-700` when true. The implementer should match whatever the existing convention is for Stage 1's lit state.

After editing, pass the flag from `thesis-detail.client.tsx`'s parent (whatever component currently renders `<StageList>` — likely the page layout). If `<StageList>` is rendered outside `<ThesisDetail>`, the page-level layout needs to either read `thesis.universe_id` server-side OR lift the `universe` state up to the page. The simplest path: keep the StageList in the page's left panel reading only `thesis.universe_id !== null` (a non-null universe_id is enough — we don't need the full universe loaded on the server side to light up the indicator).

- [ ] **Step 9.5: Type-check + full test suite**

```bash
npx tsc --noEmit
```

Expected: clean.

```bash
npm test
```

Expected: 200+ tests passing (S1: 101 + S2: ~40 + S2.5: regions ~32 + S3: yahoo 9 + universe schema 11 + universe-id 7 + agent 9 + build 10 + get 4 + patch 8 + picker 8 + table 9 = ~256 total). The exact total depends on how the schema test count was computed; any reasonable green is fine.

- [ ] **Step 9.6: Manual smoke test (do not skip)**

This step exercises the full Stage 2 flow against the live Anthropic + Supabase + Yahoo stack and is the only AC item we can't verify in Vitest.

```bash
npm run dev
```

Walk through:

1. Sign in.
2. Navigate to one of the existing thesis pages (e.g. `/thesis/china_government_pours_money_into_ai_ele_26_05_01`).
3. Scroll to the new "Stage 2 — Universe" section. The AnchorPicker should be visible with `tickers_seed` chips.
4. Click one of the chips (e.g. `9988.HK` for Alibaba). The input should populate.
5. Click "Build universe →". Wait — the agent + Yahoo enrichment takes 15–60 seconds for the first call (no caching yet).
6. Universe should render in an editable table with 5–30 rows. Anchor row first.
7. Expand the "filtered during build" details (if any) — should show the reasons (unknown_suffix, yahoo_lookup_failed, below_market_cap_floor) for any dropped peers.
8. Change one row's exposure_tier dropdown. Edit another row's notes. The Save button should activate.
9. Click Save. Should round-trip cleanly; the dirty state resets.
10. Click "+ Add row". Type `2330.TW` (TSMC), click Add. Should fetch via /api/universe/quote and append the row with region `GREATER_CHINA`.
11. Click "Refresh from scope". The picker returns. Type a different anchor (e.g. `0700.HK` for Tencent), submit. A new universe row is created with id `_universe_02`.
12. Reload the page. The most recently built universe (id `_02`) should load via the useEffect-driven GET.
13. Check the Stage 2 row in the left-panel `<StageList>` — should be lit green.

Stop the dev server when verified.

- [ ] **Step 9.7: Commit**

```bash
git add app/thesis/[id]/thesis-detail.client.tsx components/stage-list.tsx
git commit -m "$(cat <<'EOF'
feat(s3): mount AnchorPicker + UniverseTable on /thesis/[id]; light up Stage 2

thesis-detail.client.tsx hosts the universe affordance: AnchorPicker
when no universe attached, UniverseTable when one is loaded (via
useEffect-driven GET on the thesis's current universe_id). Build flow
calls POST /api/universe/build, persists, then renders the new
universe. Dropped peers surface as a collapsible details list. Save
PATCHes; Refresh from scope re-opens the picker.

StageList lights up Stage 2 when thesis.universe_id !== null.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: AC walkthrough and close issue #4

- [ ] **Step 10.1: Full test suite one more time**

```bash
npm test
```

Capture the final summary line.

- [ ] **Step 10.2: Close issue #4 with the AC walk**

```bash
gh issue close 4 --comment "$(cat <<'EOF'
## S3 acceptance criteria walkthrough

Per the design spec at docs/superpowers/specs/2026-05-18-universe-build-design.md (which retargets the original AC for the anchor+comps approach and the final 16-region taxonomy):

- [x] **EU-defence example.** Anchoring `RHM.DE` on a thesis with scope `["EUROZONE","UK","NORDICS"]` produces a 10-30 ticker universe including the major EU primes (Rheinmetall, BAE Systems, Leonardo, Thales, Dassault) plus Nordic primes (Saab, Kongsberg) via the now-first-class NORDICS region. — covered by manual smoke + universe-discoverer agent test (`tests/agents/universe-discoverer.test.ts`) + universe-build endpoint test (`tests/api/universe-build.test.ts`).
- [x] **APAC semis example.** Anchoring `2330.TW` on scope `["GREATER_CHINA","KOREA"]` produces TSMC/Samsung/SK Hynix/MediaTek/SMIC. ASML (EUROZONE) may also be included as a cross-region market leader. — covered by manual smoke + universe-discoverer agent test (system prompt covers the prefer-in-scope-but-allow-leaders rule).
- [x] Each ticker carries `region` from `REGION_BY_SUFFIX`, a `market_cap_usd_b` value from Yahoo, and an agent-assigned `exposure_tier`. — covered by `tests/api/universe-build.test.ts` happy-path + `tests/schemas/universe.test.ts` schema round-trip.
- [x] ETF proxies appear with `exposure_tier: "etf_proxy"`. — covered by universe-discoverer system prompt + tests/agents/universe-discoverer.test.ts (system prompt explicitly enumerates the three tiers).
- [x] Editing a row + saving persists. — covered by `tests/api/universe-patch.test.ts` + `tests/components/universe-table.test.tsx`.
- [x] Adding a seed ticker by hand validates the suffix against `REGION_BY_SUFFIX` and fetches metadata. — covered by `tests/components/universe-table.test.tsx` (add-row flow with suffix validation + `/api/universe/quote` integration).
- [x] Universe payload matches the schema (`UniverseSchema`). — covered by `tests/schemas/universe.test.ts`.
- [x] Vitest unit tests for `REGION_BY_SUFFIX` mapping completeness (already in `tests/data/regions.test.ts` from S2.5), GICS code validation (`tests/data/gics.test.ts` from S1), and universe Zod round-trip (`tests/schemas/universe.test.ts`).
- [x] Stage 2 in the left panel lights up when a universe is attached. — covered by `components/stage-list.tsx` edit + manual smoke step 13.

## Out of scope (per design spec)

- Cross-thesis universe caching ("same scope → reuse row" as originally written) — defers to S10.
- Daily refresh / staleness detection — S10.
- Concurrency in the Yahoo wrapper (p-limit, retry, rate-limit handling) — S10.
- Multi-GICS theme-spanning universes — v2.
- transcript_source / transcript_url population — S4.

## Notes

- The original AC "second thesis with same scope reuses the existing universe row" was re-cast in the design spec to "fresh row per build with `<thesis_id>_universe_<nn>` numbering". Cross-thesis caching lands with S10's daily cache.
- The original AC used `NON_EZ_DM_EU` which dissolved into S2.5's NORDICS / SWITZERLAND first-class regions — the design spec's EU-defence AC was updated to `["EUROZONE","UK","NORDICS"]` accordingly.
EOF
)"
```

- [ ] **Step 10.3: Push the branch and open the PR**

```bash
git push -u origin s3-universe-build
gh pr create --title "S3: Universe build (anchor + comps + editable table)" --base s2.5-region-taxonomy --head s3-universe-build --body "$(cat <<'EOF'
## Summary

Closes #4. Stacked on top of #17 (S2.5 final taxonomy).

Implements Stage 2 of the pipeline: operator-picked anchor ticker → universe-discoverer LLM agent generates 10-25 comparable peers using comps-analysis peer-selection methodology → Yahoo enrichment with suffix/market-cap filtering → fresh `universes` row → editable table.

## What's in the slice

- `lib/data/yahoo.ts` — thin null-on-error wrapper around `yahoo-finance2` (getQuote + getFundamentals).
- `lib/schemas/universe.ts` + `lib/schemas/universe-id.ts` — Universe Zod schema + `<thesis_id>_universe_<nn>` id generator.
- `lib/agents/universe-discoverer.ts` — forced tool_use agent with comps methodology ported into the system prompt; enforces 5-30 ticker bound and three-tier exposure enum.
- `POST /api/universe/build` — full orchestration with `dropped[]` transparency for unknown_suffix / yahoo_lookup_failed / below_market_cap_floor cases.
- `GET + PATCH /api/universe/[id]` — read and edit endpoints (PATCH replaces full payload, bumps refreshed_at).
- `GET /api/universe/quote` — thin Yahoo proxy used by the Add Row flow.
- `<AnchorPicker>` — free-text input + tickers_seed chips with inline suffix validation.
- `<UniverseTable>` — editable table (exposure_tier dropdown, notes input, Remove/Add row, Save/Refresh).
- Stage 2 row in `<StageList>` lights up green when a universe is attached.

**Tests:** [TO BE FILLED BY IMPLEMENTER] passing across [N] files.

## Test plan

- [ ] Pull the branch and run `npm test`.
- [ ] `npm run dev`, sign in, navigate to an existing thesis page.
- [ ] Build a universe by clicking a chip (or typing a ticker) and pressing Build.
- [ ] Edit a row's exposure_tier and notes, click Save — should persist.
- [ ] Click + Add row, type `2330.TW`, click Add — should fetch via /api/universe/quote and append.
- [ ] Click Refresh from scope, anchor on a different ticker — should produce a new universe row (`_universe_02`).
- [ ] Reload the page — most recent universe should load via the GET-by-id useEffect.

## Notes

- Once #17 merges to master, GitHub will auto-rebase this PR's base.
- AC reframing vs the original issue is documented in the design spec (docs/superpowers/specs/2026-05-18-universe-build-design.md) — anchor+comps replaces the impossible "yahoo screener pass" with a methodologically defensible alternative.
EOF
)" 2>&1 | tail -3
```

Replace `[TO BE FILLED BY IMPLEMENTER]` in the body with the actual test count from Step 10.1 before running.

- [ ] **Step 10.4: Report**

Report back to the controller:
- Final test suite summary line.
- Issue close confirmation.
- PR URL.
- Anything unexpected during manual smoke or test runs.

---

## Self-review summary

- **Spec coverage:** Every component from the spec is implemented in a task. Architecture file list → Tasks 1–9. Yahoo wrapper → Task 1. Universe schema + fixture → Task 2. ID generator → Task 3. Agent → Task 4. Build endpoint → Task 5. Read/edit endpoints → Task 6. AnchorPicker → Task 7. UniverseTable → Task 8. Page mount + Stage 2 lit → Task 9. AC walkthrough + close → Task 10. The `/api/universe/quote` helper was added to Task 8 because the Add Row flow needs it; flagged inline so the implementer doesn't get confused.
- **Placeholder scan:** No `TBD`, `TODO`, "fill in", or vague requirements in any task. The PR body has `[TO BE FILLED BY IMPLEMENTER]` for the test count which is the ONE intentional pre-PR placeholder.
- **Type consistency:** `UniverseSchema`/`UniverseTicker`/`ExposureTier`/`Universe` types defined in Task 2 and reused by name in Tasks 5–9. `discoverUniverse`/`DiscoverAnchor`/`ProposedTicker` defined in Task 4 and consumed in Task 5. `AnchorPicker` props (Task 7) and `UniverseTable` props (Task 8) are consumed in Task 9. Function names (`getQuote`, `getFundamentals`, `discoverUniverse`, `generateUniverseId`) consistent throughout.
- **AC coverage:** Every issue-#4 AC (re-cast for anchor+comps in the spec) has at least one test cited in Task 10's walkthrough.
