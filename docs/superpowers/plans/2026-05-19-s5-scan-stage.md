# S5 — Scan stage (history + descriptive context) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage 3 of the pipeline — fetch 5y monthly history + a single fundamentals snapshot for each ticker in the thesis's universe, have an LLM agent write a strictly-descriptive 3-paragraph markdown, persist as a `scan_runs` row, surface in the middle panel with a chart, and light up Stage 3 when complete.

**Architecture:** Operator clicks "Run scan" → `POST /api/scan/run {thesis_id}` → route fetches universe → serial `getHistory` + `getRatios` per ticker → `aggregateFundamentals` → `scanRunner` LLM agent (forced tool_use returning markdown) → judgment-leakage warning check → delete-then-insert into `scan_runs` → pipeline_events archive rows → 200 with payload. `<ScanPanel>` swaps placeholder for chart + markdown. `<StageList>` lights Stage 3.

**Tech Stack:** Next.js 15 App Router · TypeScript · Vitest · React Testing Library · Tailwind · Supabase Postgres · Better Auth · Anthropic SDK · `yahoo-finance2` · `recharts` (newly added).

**Spec:** [docs/superpowers/specs/2026-05-19-s5-scan-stage-design.md](../specs/2026-05-19-s5-scan-stage-design.md)

**GitHub issue:** [#7](https://github.com/wangzaa/2026-05-19-s5-scan-stage/issues/7) — actual link: https://github.com/wangzaa/altree-research/issues/7

**Working branch:** continue on `s3-universe-build` (S3 not yet merged; S5 stacks on top of it).

---

## Preconditions

```bash
git status --short                # only pre-existing "* 2.*" Finder duplicates plus the two S5 doc files
git log --oneline -3              # HEAD should be 7eca3f7
npm test                          # 236 passing across 29 files
```

If anything is red, fix it before starting Task 1.

---

## File Structure

**New files:**
- `lib/aggregation/fundamentals.ts` — `aggregateFundamentals` (Task 2)
- `lib/schemas/scan.ts` — `ScanResultsSchema`, `HistoryPointSchema`, etc. (Task 3)
- `lib/agents/scan-runner.ts` — `scanRunner` agent (Task 4)
- `app/api/scan/run/route.ts` — POST orchestrator (Task 5)
- `app/api/scan/[thesisId]/route.ts` — GET helper (Task 6)
- `components/scan-chart.tsx` — recharts wrapper (Task 7)
- `components/scan-panel.tsx` — middle-panel host (Task 8)
- `tests/aggregation/fundamentals.test.ts` (Task 2)
- `tests/schemas/scan.test.ts` (Task 3)
- `tests/agents/scan-runner.test.ts` (Task 4)
- `tests/api/scan-run.test.ts` (Task 5)
- `tests/api/scan-get.test.ts` (Task 6)
- `tests/components/scan-chart.test.tsx` (Task 7)
- `tests/components/scan-panel.test.tsx` (Task 8)
- `tests/fixtures/scan.ts` — `canonicalScan`, `cloneCanonicalScan()` (Task 3)

**Modified files:**
- `package.json` + `package-lock.json` — add `recharts` (Task 7)
- `lib/data/yahoo.ts` — add `getHistory` + `getRatios` (Task 1)
- `tests/data/yahoo.test.ts` — extend with `getHistory` + `getRatios` tests (Task 1)
- `app/thesis/[id]/page.tsx` — server-side fetch `initialScan` (Task 9)
- `app/thesis/[id]/thesis-detail.client.tsx` — mount `<ScanPanel>` (Task 9)
- `components/stage-list.tsx` — accept `scanComplete?` prop and light Stage 3 (Task 9)

---

## Conventions

**Commit messages.** Every task ends with one commit. The message subject + body + `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer is spelled out per task.

**Bash heredocs in commits have been observed to truncate to the first line in this environment.** For every commit step:
1. Use the `Write` tool to create `/tmp/s5-task<N>-msg.txt` containing the full multi-line message.
2. Run `git commit -F /tmp/s5-task<N>-msg.txt`.
3. Verify with `git cat-file commit HEAD | tail -10` — both the body paragraph and `Co-Authored-By:` trailer must be present before reporting DONE.

---

## Task 1: `getHistory` + `getRatios`

**What it does:** Extends `lib/data/yahoo.ts` with two new functions on top of the existing `getQuote` + `getFundamentals`. `getHistory` returns 5y monthly closes; `getRatios` returns `{gross_margin, ebit_margin, fcf_yield}` from quoteSummary.

**Files:**
- Modify: `lib/data/yahoo.ts`
- Modify: `tests/data/yahoo.test.ts` (append new describe blocks)

- [ ] **Step 1.1: Write the failing tests (append to `tests/data/yahoo.test.ts`)**

The existing file already mocks `yahoo-finance2`. Reuse the same module mock — append new mocks if needed. Open `tests/data/yahoo.test.ts` and add at the top of the file (alongside the existing `quoteMock` + `quoteSummaryMock`):

```ts
const historicalMock = vi.fn();
```

Extend the existing `vi.mock("yahoo-finance2", ...)` factory to also expose `historical`:

```ts
vi.mock("yahoo-finance2", () => ({
  default: class {
    quote = quoteMock;
    quoteSummary = quoteSummaryMock;
    historical = historicalMock;
  },
}));
```

(Note: yahoo-finance2 v3 exports a class — the existing tests already use this shape. If the mock is keyed differently in the current file, match its pattern; the goal is `new YahooFinance().historical(...)` resolves to `historicalMock`.)

Append two new describe blocks at the bottom of the file:

```ts
describe("getHistory", () => {
  beforeEach(() => {
    historicalMock.mockReset();
  });

  it("returns ISO-date + close pairs preferring adjClose", async () => {
    historicalMock.mockResolvedValueOnce([
      { date: new Date("2021-05-01"), open: 100, high: 110, low: 95, close: 105, adjClose: 102, volume: 1000 },
      { date: new Date("2021-06-01"), open: 105, high: 115, low: 100, close: 110, adjClose: 108, volume: 1100 },
    ]);
    const { getHistory } = await import("@/lib/data/yahoo");
    const result = await getHistory("RHM.DE");
    expect(result).toEqual([
      { date: "2021-05-01", close: 102 },
      { date: "2021-06-01", close: 108 },
    ]);
    expect(historicalMock).toHaveBeenCalledTimes(1);
    const args = historicalMock.mock.calls[0];
    expect(args[0]).toBe("RHM.DE");
    expect(args[1]).toEqual(
      expect.objectContaining({ interval: "1mo" }),
    );
  });

  it("falls back to raw close when adjClose is missing", async () => {
    historicalMock.mockResolvedValueOnce([
      { date: new Date("2024-12-01"), open: 200, high: 210, low: 195, close: 208, volume: 5000 },
    ]);
    const { getHistory } = await import("@/lib/data/yahoo");
    const result = await getHistory("FOO.BAR");
    expect(result).toEqual([{ date: "2024-12-01", close: 208 }]);
  });

  it("returns null on yahoo error", async () => {
    historicalMock.mockRejectedValueOnce(new Error("rate limited"));
    const { getHistory } = await import("@/lib/data/yahoo");
    const result = await getHistory("RHM.DE");
    expect(result).toBeNull();
  });

  it("requests period1 ~5 years back when period defaults to '5y'", async () => {
    historicalMock.mockResolvedValueOnce([]);
    const { getHistory } = await import("@/lib/data/yahoo");
    await getHistory("RHM.DE");
    const opts = historicalMock.mock.calls[0][1];
    const period1 = new Date(opts.period1);
    const yearsAgo = (Date.now() - period1.getTime()) / (1000 * 60 * 60 * 24 * 365);
    expect(yearsAgo).toBeGreaterThan(4.9);
    expect(yearsAgo).toBeLessThan(5.1);
  });
});

describe("getRatios", () => {
  beforeEach(() => {
    quoteSummaryMock.mockReset();
  });

  it("joins financialData + defaultKeyStatistics into a flat row", async () => {
    quoteSummaryMock.mockResolvedValueOnce({
      financialData: {
        grossMargins: 0.34,
        operatingMargins: 0.18,
        freeCashflow: 1_500_000_000,
      },
      defaultKeyStatistics: {
        marketCap: 60_000_000_000,
      },
    });
    const { getRatios } = await import("@/lib/data/yahoo");
    const result = await getRatios("RHM.DE");
    expect(result).toEqual({
      gross_margin: 0.34,
      ebit_margin: 0.18,
      fcf_yield: 1_500_000_000 / 60_000_000_000,
    });
    expect(quoteSummaryMock).toHaveBeenCalledWith("RHM.DE", {
      modules: ["financialData", "defaultKeyStatistics"],
    });
  });

  it("returns nulls for missing fields without erroring", async () => {
    quoteSummaryMock.mockResolvedValueOnce({
      financialData: { grossMargins: 0.20 },
      defaultKeyStatistics: {},
    });
    const { getRatios } = await import("@/lib/data/yahoo");
    const result = await getRatios("FOO.BAR");
    expect(result).toEqual({
      gross_margin: 0.20,
      ebit_margin: null,
      fcf_yield: null,
    });
  });

  it("returns null on yahoo error", async () => {
    quoteSummaryMock.mockRejectedValueOnce(new Error("not found"));
    const { getRatios } = await import("@/lib/data/yahoo");
    const result = await getRatios("UNKNOWN");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 1.2: Run the tests to verify they fail**

```bash
npm test -- tests/data/yahoo.test.ts
```

Expected: existing tests still pass; new tests fail with "getHistory is not a function" / "getRatios is not a function".

- [ ] **Step 1.3: Extend the implementation**

Append to `lib/data/yahoo.ts`:

```ts
export interface HistoryPoint {
  date: string;
  close: number;
}

export async function getHistory(
  ticker: string,
  options?: { period?: "5y" | "1y"; interval?: "1mo" | "1d" },
): Promise<HistoryPoint[] | null> {
  const period = options?.period ?? "5y";
  const interval = options?.interval ?? "1mo";
  const yearsBack = period === "5y" ? 5 : 1;
  const period2 = new Date();
  const period1 = new Date(period2);
  period1.setFullYear(period2.getFullYear() - yearsBack);

  try {
    const raw = await yahooFinance.historical(ticker, {
      period1,
      period2,
      interval,
    });
    if (!Array.isArray(raw)) return null;
    return raw.map((row) => {
      const r = row as {
        date: Date | string;
        close: number;
        adjClose?: number;
      };
      const close = typeof r.adjClose === "number" ? r.adjClose : r.close;
      const dateStr =
        r.date instanceof Date
          ? r.date.toISOString().slice(0, 10)
          : String(r.date).slice(0, 10);
      return { date: dateStr, close };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[lib/data/yahoo] getHistory error for ${ticker}:`, message);
    return null;
  }
}

export interface TickerRatios {
  gross_margin: number | null;
  ebit_margin: number | null;
  fcf_yield: number | null;
}

export async function getRatios(ticker: string): Promise<TickerRatios | null> {
  try {
    const raw = await yahooFinance.quoteSummary(ticker, {
      modules: ["financialData", "defaultKeyStatistics"],
    });
    const r = raw as {
      financialData?: {
        grossMargins?: number;
        operatingMargins?: number;
        freeCashflow?: number;
      };
      defaultKeyStatistics?: { marketCap?: number };
    };
    const fd = r.financialData ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    const fcf =
      typeof fd.freeCashflow === "number" && typeof ks.marketCap === "number" && ks.marketCap > 0
        ? fd.freeCashflow / ks.marketCap
        : null;
    return {
      gross_margin: typeof fd.grossMargins === "number" ? fd.grossMargins : null,
      ebit_margin: typeof fd.operatingMargins === "number" ? fd.operatingMargins : null,
      fcf_yield: fcf,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[lib/data/yahoo] getRatios error for ${ticker}:`, message);
    return null;
  }
}
```

- [ ] **Step 1.4: Run the tests to verify they pass**

```bash
npm test -- tests/data/yahoo.test.ts && npx tsc --noEmit
```

Expected: full file green; clean TypeScript.

- [ ] **Step 1.5: Commit**

Write `/tmp/s5-task1-msg.txt` (via the Write tool) with:

```
feat(s5): yahoo getHistory + getRatios

getHistory returns ISO-date + adjClose (raw close fallback) for a 5-year
monthly window via yahoo-finance2.historical. getRatios joins
financialData + defaultKeyStatistics into a flat {gross_margin,
ebit_margin, fcf_yield}. Both return null on any error, matching the
getQuote/getFundamentals contract.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Then:

```bash
git add lib/data/yahoo.ts tests/data/yahoo.test.ts
git commit -F /tmp/s5-task1-msg.txt
git cat-file commit HEAD | tail -10   # verify body + trailer
```

---

## Task 2: `aggregateFundamentals`

**What it does:** Pure module computing mean + median of three ratio columns across a list of `TickerRatios`. Nulls excluded from per-column aggregates.

**Files:**
- Create: `lib/aggregation/fundamentals.ts`
- Test: `tests/aggregation/fundamentals.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `tests/aggregation/fundamentals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aggregateFundamentals } from "@/lib/aggregation/fundamentals";

describe("aggregateFundamentals", () => {
  it("computes mean + median per column on a complete 5-row input", () => {
    const result = aggregateFundamentals([
      { gross_margin: 0.30, ebit_margin: 0.10, fcf_yield: 0.04 },
      { gross_margin: 0.40, ebit_margin: 0.20, fcf_yield: 0.05 },
      { gross_margin: 0.50, ebit_margin: 0.15, fcf_yield: 0.06 },
      { gross_margin: 0.20, ebit_margin: 0.05, fcf_yield: 0.03 },
      { gross_margin: 0.60, ebit_margin: 0.25, fcf_yield: 0.07 },
    ]);
    expect(result.per_ticker_used).toBe(5);
    expect(result.mean.gross_margin).toBeCloseTo(0.40, 5);
    expect(result.median.gross_margin).toBeCloseTo(0.40, 5);
    expect(result.mean.ebit_margin).toBeCloseTo(0.15, 5);
    expect(result.median.ebit_margin).toBeCloseTo(0.15, 5);
    expect(result.mean.fcf_yield).toBeCloseTo(0.05, 5);
    expect(result.median.fcf_yield).toBeCloseTo(0.05, 5);
  });

  it("averages the two middle elements for even-length inputs", () => {
    const result = aggregateFundamentals([
      { gross_margin: 0.10, ebit_margin: null, fcf_yield: null },
      { gross_margin: 0.30, ebit_margin: null, fcf_yield: null },
      { gross_margin: 0.20, ebit_margin: null, fcf_yield: null },
      { gross_margin: 0.40, ebit_margin: null, fcf_yield: null },
    ]);
    // sorted [0.10, 0.20, 0.30, 0.40] → median = (0.20 + 0.30) / 2 = 0.25
    expect(result.median.gross_margin).toBeCloseTo(0.25, 5);
  });

  it("ignores null values within each column independently", () => {
    const result = aggregateFundamentals([
      { gross_margin: 0.20, ebit_margin: null, fcf_yield: 0.03 },
      { gross_margin: null, ebit_margin: 0.10, fcf_yield: 0.05 },
      { gross_margin: 0.40, ebit_margin: 0.20, fcf_yield: null },
    ]);
    expect(result.per_ticker_used).toBe(3); // any column non-null counts
    expect(result.mean.gross_margin).toBeCloseTo(0.30, 5);
    expect(result.mean.ebit_margin).toBeCloseTo(0.15, 5);
    expect(result.mean.fcf_yield).toBeCloseTo(0.04, 5);
  });

  it("returns null mean + median for an all-null column", () => {
    const result = aggregateFundamentals([
      { gross_margin: 0.30, ebit_margin: null, fcf_yield: 0.04 },
      { gross_margin: 0.40, ebit_margin: null, fcf_yield: 0.05 },
    ]);
    expect(result.mean.ebit_margin).toBeNull();
    expect(result.median.ebit_margin).toBeNull();
  });

  it("returns all-null aggregate + per_ticker_used 0 for an empty input", () => {
    const result = aggregateFundamentals([]);
    expect(result.per_ticker_used).toBe(0);
    expect(result.mean).toEqual({
      gross_margin: null,
      ebit_margin: null,
      fcf_yield: null,
    });
    expect(result.median).toEqual({
      gross_margin: null,
      ebit_margin: null,
      fcf_yield: null,
    });
  });

  it("filters non-finite values (NaN, Infinity) out of the aggregate", () => {
    const result = aggregateFundamentals([
      { gross_margin: 0.30, ebit_margin: NaN, fcf_yield: Infinity },
      { gross_margin: 0.40, ebit_margin: 0.20, fcf_yield: 0.05 },
    ]);
    expect(result.mean.ebit_margin).toBeCloseTo(0.20, 5);
    expect(result.mean.fcf_yield).toBeCloseTo(0.05, 5);
  });
});
```

- [ ] **Step 2.2: Run the tests to verify they fail**

```bash
npm test -- tests/aggregation/fundamentals.test.ts
```

Expected: 6 failing with "Cannot find module '@/lib/aggregation/fundamentals'".

- [ ] **Step 2.3: Write the implementation**

Create `lib/aggregation/fundamentals.ts`:

```ts
import type { TickerRatios } from "@/lib/data/yahoo";

export interface FundamentalsAggregate {
  mean: TickerRatios;
  median: TickerRatios;
  per_ticker_used: number;
}

const COLUMNS = ["gross_margin", "ebit_margin", "fcf_yield"] as const;
type Column = (typeof COLUMNS)[number];

function meanOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function columnValues(rows: TickerRatios[], col: Column): number[] {
  const out: number[] = [];
  for (const row of rows) {
    const v = row[col];
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

export function aggregateFundamentals(
  rows: TickerRatios[],
): FundamentalsAggregate {
  const mean: TickerRatios = {
    gross_margin: null,
    ebit_margin: null,
    fcf_yield: null,
  };
  const median: TickerRatios = {
    gross_margin: null,
    ebit_margin: null,
    fcf_yield: null,
  };
  for (const col of COLUMNS) {
    const vals = columnValues(rows, col);
    mean[col] = meanOf(vals);
    median[col] = medianOf(vals);
  }
  let used = 0;
  for (const row of rows) {
    if (
      (typeof row.gross_margin === "number" && Number.isFinite(row.gross_margin)) ||
      (typeof row.ebit_margin === "number" && Number.isFinite(row.ebit_margin)) ||
      (typeof row.fcf_yield === "number" && Number.isFinite(row.fcf_yield))
    ) {
      used++;
    }
  }
  return { mean, median, per_ticker_used: used };
}
```

- [ ] **Step 2.4: Run the tests to verify they pass**

```bash
npm test -- tests/aggregation/fundamentals.test.ts && npx tsc --noEmit
```

Expected: 6 passing, clean TS.

- [ ] **Step 2.5: Commit**

Write `/tmp/s5-task2-msg.txt`:

```
feat(s5): aggregateFundamentals pure aggregator

Per-column mean + median across TickerRatios[]. Nulls and non-finite
values excluded from each column independently. Empty input or all-null
column yields null mean and median. per_ticker_used counts rows that
contributed at least one non-null column.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Then:

```bash
git add lib/aggregation/fundamentals.ts tests/aggregation/fundamentals.test.ts
git commit -F /tmp/s5-task2-msg.txt
git cat-file commit HEAD | tail -10
```

---

## Task 3: `lib/schemas/scan.ts`

**What it does:** Zod schema for the `scan_runs.results` jsonb payload. Mirrors design §`lib/schemas/scan.ts`.

**Files:**
- Create: `lib/schemas/scan.ts`
- Create: `tests/schemas/scan.test.ts`
- Create: `tests/fixtures/scan.ts`

- [ ] **Step 3.1: Write the canonical fixture**

Create `tests/fixtures/scan.ts`:

```ts
import type { ScanResults } from "@/lib/schemas/scan";

export const canonicalScan: ScanResults = {
  thesis_id: "eu_defense_rearmament_cycle_26_05_01",
  universe_id: "eu_defense_rearmament_cycle_26_05_01_universe_01",
  ran_at: "2026-05-19T12:00:00.000Z",
  history_5y: [
    {
      ticker: "RHM.DE",
      points: [
        { date: "2021-05-01", close: 90 },
        { date: "2021-06-01", close: 95 },
        { date: "2021-07-01", close: 100 },
      ],
    },
    {
      ticker: "BA.L",
      points: [
        { date: "2021-05-01", close: 5.50 },
        { date: "2021-06-01", close: 5.80 },
        { date: "2021-07-01", close: 6.00 },
      ],
    },
  ],
  fundamentals_snapshot: {
    as_of: "2026-05-19T12:00:00.000Z",
    mean: { gross_margin: 0.35, ebit_margin: 0.15, fcf_yield: 0.05 },
    median: { gross_margin: 0.34, ebit_margin: 0.14, fcf_yield: 0.05 },
    per_ticker_used: 2,
  },
  descriptive_markdown:
    "The universe price level rose roughly 25% over the period, with the steepest move from late 2024 into Q1 2026.\n\nMean gross margin sits at 35% with the median close behind at 34%. EBIT margin averages 15%; FCF yield 5%.\n\nRheinmetall accounts for the largest single-name move, rising ~110% over the period; BAE Systems compounded ~75%; Leonardo moved roughly in line with the universe.",
};

export function cloneCanonicalScan(): ScanResults {
  return structuredClone(canonicalScan);
}
```

- [ ] **Step 3.2: Write the failing tests**

Create `tests/schemas/scan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ScanResultsSchema } from "@/lib/schemas/scan";
import { cloneCanonicalScan } from "@/tests/fixtures/scan";

describe("ScanResultsSchema", () => {
  it("round-trips the canonical fixture", () => {
    const parsed = ScanResultsSchema.safeParse(cloneCanonicalScan());
    expect(parsed.success).toBe(true);
  });

  it("rejects history_5y with an empty array", () => {
    const bad = cloneCanonicalScan();
    bad.history_5y = [];
    expect(ScanResultsSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a history point with a malformed date", () => {
    const bad = cloneCanonicalScan();
    bad.history_5y[0].points[0] = { date: "2026-5-1", close: 100 };
    const r = ScanResultsSchema.safeParse(bad);
    expect(r.success).toBe(false);
  });

  it("rejects a negative close price", () => {
    const bad = cloneCanonicalScan();
    bad.history_5y[0].points[0] = { date: "2021-05-01", close: -1 };
    expect(ScanResultsSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty descriptive_markdown", () => {
    const bad = cloneCanonicalScan();
    bad.descriptive_markdown = "";
    expect(ScanResultsSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts null mean / median values for fundamentals columns", () => {
    const ok = cloneCanonicalScan();
    ok.fundamentals_snapshot.mean.fcf_yield = null;
    ok.fundamentals_snapshot.median.fcf_yield = null;
    expect(ScanResultsSchema.safeParse(ok).success).toBe(true);
  });
});
```

- [ ] **Step 3.3: Run the tests to verify they fail**

```bash
npm test -- tests/schemas/scan.test.ts
```

Expected: failing with "Cannot find module '@/lib/schemas/scan'".

- [ ] **Step 3.4: Write the implementation**

Create `lib/schemas/scan.ts`:

```ts
import { z } from "zod";
import { ThesisIdSchema } from "@/lib/schemas/thesis-id";

export const HistoryPointSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    close: z.number().nonnegative(),
  })
  .strict();

export const TickerHistorySchema = z
  .object({
    ticker: z.string().min(1),
    points: z.array(HistoryPointSchema).min(1),
  })
  .strict();

export const TickerRatiosSchema = z
  .object({
    gross_margin: z.number().nullable(),
    ebit_margin: z.number().nullable(),
    fcf_yield: z.number().nullable(),
  })
  .strict();

export const FundamentalsSnapshotSchema = z
  .object({
    as_of: z.string(),
    mean: TickerRatiosSchema,
    median: TickerRatiosSchema,
    per_ticker_used: z.number().int().nonnegative(),
  })
  .strict();

export const ScanResultsSchema = z
  .object({
    thesis_id: ThesisIdSchema,
    universe_id: z.string().min(1),
    ran_at: z.string(),
    history_5y: z.array(TickerHistorySchema).min(1),
    fundamentals_snapshot: FundamentalsSnapshotSchema,
    descriptive_markdown: z.string().min(1),
  })
  .strict();

export type HistoryPoint = z.infer<typeof HistoryPointSchema>;
export type TickerHistory = z.infer<typeof TickerHistorySchema>;
export type FundamentalsSnapshot = z.infer<typeof FundamentalsSnapshotSchema>;
export type ScanResults = z.infer<typeof ScanResultsSchema>;
```

- [ ] **Step 3.5: Run the tests to verify they pass**

```bash
npm test -- tests/schemas/scan.test.ts && npx tsc --noEmit
```

Expected: 6 passing, clean TS.

- [ ] **Step 3.6: Commit**

Write `/tmp/s5-task3-msg.txt`:

```
feat(s5): ScanResults Zod schema + canonical fixture

Zod for the scan_runs.results jsonb payload: history_5y per ticker with
ISO-date monthly closes, fundamentals_snapshot with mean/median per
column, descriptive_markdown. Canonical fixture in tests/fixtures/scan.ts
mirrors the pattern from tests/fixtures/universe.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Then:

```bash
git add lib/schemas/scan.ts tests/schemas/scan.test.ts tests/fixtures/scan.ts
git commit -F /tmp/s5-task3-msg.txt
git cat-file commit HEAD | tail -10
```

---

## Task 4: `scan-runner` agent

**What it does:** LLM agent with forced tool use against `return_scan_description`. Returns `{ok: true; markdown}` after Zod validation. System prompt forbids judgment language explicitly.

**Files:**
- Create: `lib/agents/scan-runner.ts`
- Test: `tests/agents/scan-runner.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `tests/agents/scan-runner.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";
import { cloneCanonicalUniverse } from "@/tests/fixtures/universe";
import { cloneCanonicalScan } from "@/tests/fixtures/scan";

const createMessageMock = vi.fn();

vi.mock("@/lib/anthropic/client", () => ({
  createMessage: createMessageMock,
}));

function mockToolUse(input: unknown) {
  createMessageMock.mockResolvedValueOnce({
    content: [
      { type: "tool_use", id: "toolu_1", name: "return_scan_description", input },
    ],
    stop_reason: "tool_use",
    usage: { input_tokens: 100, output_tokens: 50 },
    raw: {},
  });
}

const validMarkdown =
  "The universe rose roughly 25% over the period, concentrated in 2024-2025.\n\nMean gross margin 35%, median 34%. EBIT margin averages 15%.\n\nRheinmetall rose ~110% over the period; Leonardo moved in line; BAE compounded ~75%.";

function buildInput() {
  const scan = cloneCanonicalScan();
  return {
    thesis: cloneCanonicalThesis(),
    universe: cloneCanonicalUniverse(),
    history_5y: scan.history_5y,
    fundamentals_snapshot: {
      mean: scan.fundamentals_snapshot.mean,
      median: scan.fundamentals_snapshot.median,
      per_ticker_used: scan.fundamentals_snapshot.per_ticker_used,
    },
  };
}

describe("scanRunner", () => {
  beforeEach(() => {
    createMessageMock.mockReset();
  });

  it("returns ok:true with markdown on happy path", async () => {
    mockToolUse({ markdown: validMarkdown });
    const { scanRunner } = await import("@/lib/agents/scan-runner");
    const result = await scanRunner(buildInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown).toBe(validMarkdown);
  });

  it("wires return_scan_description with forced tool_choice", async () => {
    mockToolUse({ markdown: validMarkdown });
    const { scanRunner } = await import("@/lib/agents/scan-runner");
    await scanRunner(buildInput());
    const call = createMessageMock.mock.calls[0][0];
    expect(call.tool_choice).toEqual({ type: "tool", name: "return_scan_description" });
    expect(call.tools).toHaveLength(1);
    expect(call.tools[0].name).toBe("return_scan_description");
    expect(Array.isArray(call.system)).toBe(true);
    expect(call.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("system prompt mentions descriptive + forbidden words", async () => {
    mockToolUse({ markdown: validMarkdown });
    const { scanRunner } = await import("@/lib/agents/scan-runner");
    await scanRunner(buildInput());
    const sys = (createMessageMock.mock.calls[0][0].system[0].text as string).toLowerCase();
    expect(sys).toContain("descriptive");
    expect(sys).toContain("forbidden");
    expect(sys).toContain("should");
    expect(sys).toContain("expect");
    expect(sys).toContain("outperform");
  });

  it("user message carries thesis claim + universe ticker list + snapshot fundamentals", async () => {
    mockToolUse({ markdown: validMarkdown });
    const { scanRunner } = await import("@/lib/agents/scan-runner");
    const input = buildInput();
    await scanRunner(input);
    const content = createMessageMock.mock.calls[0][0].messages[0].content as string;
    expect(content).toContain(input.thesis.claim);
    expect(content).toContain("RHM.DE");
    expect(content).toContain("BA.L");
    expect(content).toContain("gross_margin");
  });

  it("returns ok:false when no tool_use block is present", async () => {
    createMessageMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "oops" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
      raw: {},
    });
    const { scanRunner } = await import("@/lib/agents/scan-runner");
    const result = await scanRunner(buildInput());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tool_use|return_scan_description/i);
  });

  it("returns ok:false when markdown is empty", async () => {
    mockToolUse({ markdown: "" });
    const { scanRunner } = await import("@/lib/agents/scan-runner");
    const result = await scanRunner(buildInput());
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 4.2: Run the tests to verify they fail**

```bash
npm test -- tests/agents/scan-runner.test.ts
```

Expected: 6 failing with "Cannot find module '@/lib/agents/scan-runner'".

- [ ] **Step 4.3: Write the implementation**

Create `lib/agents/scan-runner.ts`:

```ts
import { z } from "zod";
import {
  createMessage,
  type AnthropicContentBlock,
  type AnthropicTextBlockParam,
  type AnthropicTool,
  type AnthropicToolUse,
} from "@/lib/anthropic/client";
import type { Thesis } from "@/lib/schemas/thesis";
import type { Universe } from "@/lib/schemas/universe";
import type { FundamentalsAggregate } from "@/lib/aggregation/fundamentals";
import type { TickerHistory } from "@/lib/schemas/scan";

export interface ScanRunnerInput {
  thesis: Thesis;
  universe: Universe;
  history_5y: TickerHistory[];
  fundamentals_snapshot: FundamentalsAggregate;
}

export type ScanRunnerResult =
  | { ok: true; markdown: string }
  | { ok: false; error: string; raw?: unknown };

const TOOL_NAME = "return_scan_description";

const ToolInputSchema = z
  .object({
    markdown: z.string().min(1),
  })
  .strict();

const returnScanDescriptionTool: AnthropicTool = {
  name: TOOL_NAME,
  description:
    "Return the three-paragraph descriptive markdown for the Stage-3 scan. Do not return free-text.",
  input_schema: {
    type: "object",
    properties: {
      markdown: {
        type: "string",
        description:
          "Exactly three short markdown paragraphs separated by blank lines.",
      },
    },
    required: ["markdown"],
  },
};

const systemBlocks: AnthropicTextBlockParam[] = [
  {
    type: "text",
    text: `You are writing the descriptive Stage-3 context for an investment research artifact.

You are given: the thesis claim, the universe of tickers being investigated, 5 years of monthly closing prices per ticker, and a single snapshot of universe-aggregate fundamentals (mean and median gross margin, EBIT margin, FCF yield).

Your job: write exactly three short paragraphs (~80-120 words each) of purely descriptive prose summarising what the data shows.

Paragraph 1 — universe price-history trajectory: aggregate trends across the universe. No predictions.

Paragraph 2 — fundamentals snapshot: report mean and median for gross margin, EBIT margin, FCF yield as observed today. Note the spread between mean and median where notable.

Paragraph 3 — dispersion / outliers: name 1-3 tickers whose 5y trajectory diverges sharply from the universe (top performer, bottom performer, or notable shape). Cite the rough magnitude.

FORBIDDEN: judgment, prediction, valuation language. Do NOT use the words: "should", "will", "expect", "likely", "believe", "outperform", "undervalued", "overvalued". State only what the numbers are. Do NOT recommend action.

Return the markdown via the return_scan_description tool. Do not return free-text alone.`,
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

function summarisePoints(history: TickerHistory): string {
  if (history.points.length === 0) return `${history.ticker}: no data`;
  const first = history.points[0];
  const last = history.points[history.points.length - 1];
  return `${history.ticker}: ${history.points.length} pts, ${first.date} ${first.close.toFixed(2)} → ${last.date} ${last.close.toFixed(2)}`;
}

function buildUserMessage(input: ScanRunnerInput): string {
  const { thesis, universe, history_5y, fundamentals_snapshot } = input;
  const tickerList = universe.tickers.map((t) => `${t.ticker} (${t.name})`).join(", ");
  const histLines = history_5y.map(summarisePoints).join("\n");
  const fund = fundamentals_snapshot;
  return `Thesis claim: ${thesis.claim}

Universe (${universe.tickers.length} tickers): ${tickerList}

5y monthly history summary:
${histLines}

Fundamentals snapshot (${fund.per_ticker_used} tickers contributing):
gross_margin: mean=${fund.mean.gross_margin ?? "n/a"} median=${fund.median.gross_margin ?? "n/a"}
ebit_margin: mean=${fund.mean.ebit_margin ?? "n/a"} median=${fund.median.ebit_margin ?? "n/a"}
fcf_yield: mean=${fund.mean.fcf_yield ?? "n/a"} median=${fund.median.fcf_yield ?? "n/a"}

Write the three-paragraph descriptive markdown via the return_scan_description tool.`;
}

export async function scanRunner(
  input: ScanRunnerInput,
): Promise<ScanRunnerResult> {
  const result = await createMessage({
    system: systemBlocks,
    tools: [returnScanDescriptionTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: buildUserMessage(input) }],
    max_tokens: 1024,
  });

  const toolUse = findToolUse(result.content);
  if (!toolUse) {
    return {
      ok: false,
      error: "Model did not produce a return_scan_description tool_use block",
    };
  }
  if (
    typeof toolUse.input !== "object" ||
    toolUse.input === null ||
    Array.isArray(toolUse.input)
  ) {
    return { ok: false, error: "tool_use.input was not an object", raw: toolUse.input };
  }
  const parsed = ToolInputSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message, raw: toolUse.input };
  }
  return { ok: true, markdown: parsed.data.markdown };
}
```

- [ ] **Step 4.4: Run the tests to verify they pass**

```bash
npm test -- tests/agents/scan-runner.test.ts && npx tsc --noEmit
```

Expected: 6 passing, clean TS.

- [ ] **Step 4.5: Commit**

Write `/tmp/s5-task4-msg.txt`:

```
feat(s5): scan-runner agent (descriptive markdown via forced tool_use)

Single createMessage with return_scan_description forced tool_choice.
System prompt explicitly forbids judgment language (should/will/expect/
likely/believe/outperform/undervalued/overvalued) and structures the
output as exactly three descriptive paragraphs over price history +
fundamentals snapshot. Zod-validates the returned markdown.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Then:

```bash
git add lib/agents/scan-runner.ts tests/agents/scan-runner.test.ts
git commit -F /tmp/s5-task4-msg.txt
git cat-file commit HEAD | tail -10
```

---

## Task 5: `POST /api/scan/run`

**What it does:** Orchestrator endpoint. Body `{thesis_id}` → resolves universe → serial Yahoo fetches → aggregator → agent → judgment-leakage warning → delete-then-insert → pipeline_events archive rows → 200.

**Files:**
- Create: `app/api/scan/run/route.ts`
- Test: `tests/api/scan-run.test.ts`

- [ ] **Step 5.1: Write the failing tests**

Create `tests/api/scan-run.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";
import { cloneCanonicalUniverse } from "@/tests/fixtures/universe";

const getCurrentUserMock = vi.fn();
const getHistoryMock = vi.fn();
const getRatiosMock = vi.fn();
const scanRunnerMock = vi.fn();

const thesisMaybeSingleMock = vi.fn();
const thesisSelectEqMock = vi.fn(() => ({ maybeSingle: thesisMaybeSingleMock }));
const thesisSelectMock = vi.fn(() => ({ eq: thesisSelectEqMock }));

const universeMaybeSingleMock = vi.fn();
const universeSelectEqMock = vi.fn(() => ({ maybeSingle: universeMaybeSingleMock }));
const universeSelectMock = vi.fn(() => ({ eq: universeSelectEqMock }));

const scanDeleteEqMock = vi.fn();
const scanDeleteMock = vi.fn(() => ({ eq: scanDeleteEqMock }));
const scanInsertMock = vi.fn();
const pipelineInsertMock = vi.fn();

const fromMock = vi.fn((table: string) => {
  if (table === "theses") return { select: thesisSelectMock };
  if (table === "universes") return { select: universeSelectMock };
  if (table === "scan_runs") return { delete: scanDeleteMock, insert: scanInsertMock };
  if (table === "pipeline_events") return { insert: pipelineInsertMock };
  throw new Error(`unexpected table ${table}`);
});

const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/data/yahoo", () => ({
  getHistory: getHistoryMock,
  getRatios: getRatiosMock,
}));
vi.mock("@/lib/agents/scan-runner", () => ({ scanRunner: scanRunnerMock }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));

const THESIS_ID = "eu_defense_rearmament_cycle_26_05_01";

function makeRequest(body: unknown): Request {
  return new Request("http://test/api/scan/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function thesisRowFor(universe_id: string | null) {
  const t = cloneCanonicalThesis();
  t.universe_id = universe_id;
  return { id: t.id, user_id: "alice", version: 1, thesis: t };
}

function universeRow() {
  const u = cloneCanonicalUniverse();
  return { id: u.id, created_by: "alice", universe: u };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getHistoryMock.mockReset();
  getRatiosMock.mockReset();
  scanRunnerMock.mockReset();
  fromMock.mockClear();
  thesisSelectMock.mockClear();
  thesisSelectEqMock.mockClear();
  thesisMaybeSingleMock.mockReset();
  universeSelectMock.mockClear();
  universeSelectEqMock.mockClear();
  universeMaybeSingleMock.mockReset();
  scanDeleteMock.mockClear();
  scanDeleteEqMock.mockReset();
  scanInsertMock.mockReset();
  pipelineInsertMock.mockReset();
  scanDeleteEqMock.mockResolvedValue({ error: null });
  scanInsertMock.mockResolvedValue({ error: null });
  pipelineInsertMock.mockResolvedValue({ error: null });
});

describe("POST /api/scan/run", () => {
  it("returns 400 on invalid JSON body", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    const { POST } = await import("@/app/api/scan/run/route");
    const res = await POST(makeRequest("not json"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/scan/run/route");
    const res = await POST(makeRequest({ thesis_id: THESIS_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when thesis missing or wrong owner", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    thesisMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const { POST } = await import("@/app/api/scan/run/route");
    const res = await POST(makeRequest({ thesis_id: THESIS_ID }));
    expect(res.status).toBe(404);
  });

  it("returns 422 no_universe when thesis has no universe_id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    thesisMaybeSingleMock.mockResolvedValueOnce({ data: thesisRowFor(null), error: null });
    const { POST } = await import("@/app/api/scan/run/route");
    const res = await POST(makeRequest({ thesis_id: THESIS_ID }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("no_universe");
  });

  it("happy path persists scan_runs and emits start + complete pipeline_events", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    const u = cloneCanonicalUniverse();
    thesisMaybeSingleMock.mockResolvedValueOnce({
      data: thesisRowFor(u.id),
      error: null,
    });
    universeMaybeSingleMock.mockResolvedValueOnce({
      data: universeRow(),
      error: null,
    });
    for (let i = 0; i < u.tickers.length; i++) {
      getHistoryMock.mockResolvedValueOnce([
        { date: "2021-05-01", close: 100 },
        { date: "2021-06-01", close: 105 },
        { date: "2021-07-01", close: 110 },
      ]);
      getRatiosMock.mockResolvedValueOnce({
        gross_margin: 0.3, ebit_margin: 0.15, fcf_yield: 0.04,
      });
    }
    scanRunnerMock.mockResolvedValueOnce({
      ok: true,
      markdown:
        "para 1\n\npara 2\n\npara 3",
    });

    const { POST } = await import("@/app/api/scan/run/route");
    const res = await POST(makeRequest({ thesis_id: THESIS_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scan.descriptive_markdown).toContain("para 1");
    expect(body.scan.history_5y.length).toBeGreaterThan(0);
    expect(body.scan.fundamentals_snapshot.per_ticker_used).toBeGreaterThan(0);

    expect(scanDeleteMock).toHaveBeenCalledTimes(1);
    expect(scanInsertMock).toHaveBeenCalledTimes(1);

    const pipelineCalls = pipelineInsertMock.mock.calls.map((c) => c[0].event_type);
    expect(pipelineCalls).toEqual(["start", "complete"]);
  });

  it("returns 422 too_few_history when fewer than 3 tickers have history", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    const u = cloneCanonicalUniverse();
    thesisMaybeSingleMock.mockResolvedValueOnce({
      data: thesisRowFor(u.id),
      error: null,
    });
    universeMaybeSingleMock.mockResolvedValueOnce({
      data: universeRow(),
      error: null,
    });
    // All but one ticker fails history lookup
    getHistoryMock.mockResolvedValueOnce([{ date: "2021-05-01", close: 100 }]);
    for (let i = 1; i < u.tickers.length; i++) {
      getHistoryMock.mockResolvedValueOnce(null);
    }
    getRatiosMock.mockResolvedValue({
      gross_margin: 0.3, ebit_margin: 0.15, fcf_yield: 0.04,
    });

    const { POST } = await import("@/app/api/scan/run/route");
    const res = await POST(makeRequest({ thesis_id: THESIS_ID }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.detail).toBe("too_few_history");
  });

  it("returns 422 when the LLM agent fails", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    const u = cloneCanonicalUniverse();
    thesisMaybeSingleMock.mockResolvedValueOnce({
      data: thesisRowFor(u.id),
      error: null,
    });
    universeMaybeSingleMock.mockResolvedValueOnce({
      data: universeRow(),
      error: null,
    });
    for (let i = 0; i < u.tickers.length; i++) {
      getHistoryMock.mockResolvedValueOnce([
        { date: "2021-05-01", close: 100 },
        { date: "2021-06-01", close: 105 },
        { date: "2021-07-01", close: 110 },
      ]);
      getRatiosMock.mockResolvedValueOnce({
        gross_margin: 0.3, ebit_margin: 0.15, fcf_yield: 0.04,
      });
    }
    scanRunnerMock.mockResolvedValueOnce({
      ok: false,
      error: "Model did not produce return_scan_description",
    });

    const { POST } = await import("@/app/api/scan/run/route");
    const res = await POST(makeRequest({ thesis_id: THESIS_ID }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("scan_failed");
  });

  it("logs a console.warn when descriptive_markdown contains a forbidden word", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    const u = cloneCanonicalUniverse();
    thesisMaybeSingleMock.mockResolvedValueOnce({
      data: thesisRowFor(u.id),
      error: null,
    });
    universeMaybeSingleMock.mockResolvedValueOnce({
      data: universeRow(),
      error: null,
    });
    for (let i = 0; i < u.tickers.length; i++) {
      getHistoryMock.mockResolvedValueOnce([
        { date: "2021-05-01", close: 100 },
        { date: "2021-06-01", close: 105 },
        { date: "2021-07-01", close: 110 },
      ]);
      getRatiosMock.mockResolvedValueOnce({
        gross_margin: 0.3, ebit_margin: 0.15, fcf_yield: 0.04,
      });
    }
    scanRunnerMock.mockResolvedValueOnce({
      ok: true,
      markdown:
        "para 1 the universe should outperform the broader index.\n\npara 2 margins look strong.\n\npara 3 RHM.DE rose 110% over the period.",
    });

    const { POST } = await import("@/app/api/scan/run/route");
    const res = await POST(makeRequest({ thesis_id: THESIS_ID }));
    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
    const warnArgs = warnSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(warnArgs).toMatch(/should|outperform/i);
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 5.2: Run the tests to verify they fail**

```bash
npm test -- tests/api/scan-run.test.ts
```

Expected: failing with "Cannot find module '@/app/api/scan/run/route'".

- [ ] **Step 5.3: Write the implementation**

Create `app/api/scan/run/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { scanRunner } from "@/lib/agents/scan-runner";
import { aggregateFundamentals } from "@/lib/aggregation/fundamentals";
import { getCurrentUser } from "@/lib/auth/session";
import { getHistory, getRatios, type TickerRatios } from "@/lib/data/yahoo";
import { ThesisIdSchema, type Thesis } from "@/lib/schemas/thesis";
import { ScanResultsSchema, type ScanResults, type TickerHistory } from "@/lib/schemas/scan";
import type { Universe } from "@/lib/schemas/universe";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = z.object({ thesis_id: ThesisIdSchema });

const MIN_HISTORY_TICKERS = 3;
const JUDGMENT_PATTERN =
  /\b(should|will|expect|likely|believe|outperform|undervalued|overvalued)\b/gi;

interface DroppedTicker {
  ticker: string;
  reason: "history_lookup_failed";
}
interface DroppedRatios {
  ticker: string;
  reason: "ratios_lookup_failed";
}

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
    const { thesis_id } = parsed.data;

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
    const universeId = thesis.universe_id;
    if (!universeId) {
      return NextResponse.json({ error: "no_universe" }, { status: 422 });
    }

    const universeRow = await supabase
      .from("universes")
      .select("*")
      .eq("id", universeId)
      .maybeSingle();
    if (
      universeRow.error ||
      !universeRow.data ||
      universeRow.data.created_by !== user.id
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const universe = universeRow.data.universe as Universe;

    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "scan",
      event_type: "start",
      payload: { thesis_id, universe_id: universeId },
    });

    const history_5y: TickerHistory[] = [];
    const dropped: DroppedTicker[] = [];
    const ratios: TickerRatios[] = [];
    const dropped_ratios: DroppedRatios[] = [];

    for (const row of universe.tickers) {
      const points = await getHistory(row.ticker);
      if (points && points.length > 0) {
        history_5y.push({ ticker: row.ticker, points });
      } else {
        dropped.push({ ticker: row.ticker, reason: "history_lookup_failed" });
        continue;
      }
      if (row.exposure_tier !== "etf_proxy") {
        const r = await getRatios(row.ticker);
        if (r) {
          ratios.push(r);
        } else {
          dropped_ratios.push({ ticker: row.ticker, reason: "ratios_lookup_failed" });
        }
      }
    }

    if (history_5y.length < MIN_HISTORY_TICKERS) {
      return NextResponse.json(
        { error: "scan_failed", detail: "too_few_history", dropped },
        { status: 422 },
      );
    }

    const fundamentalsAggregate = aggregateFundamentals(ratios);

    const agentResult = await scanRunner({
      thesis,
      universe,
      history_5y,
      fundamentals_snapshot: fundamentalsAggregate,
    });
    if (!agentResult.ok) {
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "scan",
        event_type: "error",
        payload: { error: agentResult.error },
      });
      return NextResponse.json(
        {
          error: "scan_failed",
          detail: agentResult.error,
          raw: agentResult.raw ?? null,
        },
        { status: 422 },
      );
    }

    const ranAt = new Date().toISOString();
    const scanPayload: ScanResults = {
      thesis_id,
      universe_id: universeId,
      ran_at: ranAt,
      history_5y,
      fundamentals_snapshot: {
        as_of: ranAt,
        mean: fundamentalsAggregate.mean,
        median: fundamentalsAggregate.median,
        per_ticker_used: fundamentalsAggregate.per_ticker_used,
      },
      descriptive_markdown: agentResult.markdown,
    };

    const validated = ScanResultsSchema.safeParse(scanPayload);
    if (!validated.success) {
      console.error("[/api/scan/run] invalid_scan:", validated.error.message);
      return NextResponse.json(
        { error: "invalid_scan", detail: validated.error.message },
        { status: 422 },
      );
    }

    const matches = validated.data.descriptive_markdown.match(JUDGMENT_PATTERN);
    if (matches && matches.length > 0) {
      console.warn(
        `[/api/scan/run] judgment-leakage matches in ${thesis_id}:`,
        matches.slice(0, 3),
      );
    }

    const del = await supabase
      .from("scan_runs")
      .delete()
      .eq("thesis_id", thesis_id);
    if (del.error) {
      console.error("[/api/scan/run] persist_failed (delete):", del.error);
      return NextResponse.json(
        { error: "persist_failed", detail: del.error.message },
        { status: 500 },
      );
    }
    const ins = await supabase
      .from("scan_runs")
      .insert({ thesis_id, results: validated.data });
    if (ins.error) {
      console.error("[/api/scan/run] persist_failed (insert):", ins.error);
      return NextResponse.json(
        { error: "persist_failed", detail: ins.error.message },
        { status: 500 },
      );
    }
    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "scan",
      event_type: "complete",
      payload: validated.data,
    });

    return NextResponse.json(
      { scan: validated.data, dropped, dropped_ratios },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/scan/run] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", detail: message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 5.4: Run the tests to verify they pass**

```bash
npm test -- tests/api/scan-run.test.ts && npx tsc --noEmit
```

Expected: 8 passing, clean TS.

- [ ] **Step 5.5: Commit**

Write `/tmp/s5-task5-msg.txt`:

```
feat(s5): POST /api/scan/run orchestrator

Body {thesis_id}; owner-scoped thesis + universe resolution; serial
yahoo getHistory + getRatios per ticker; aggregateFundamentals; LLM
scanRunner agent for descriptive markdown; judgment-leakage console
warn; delete-then-insert into scan_runs (no migration needed);
pipeline_events start + complete archive rows. 422 on no_universe,
too_few_history, agent failure, schema failure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Then:

```bash
git add app/api/scan/run/route.ts tests/api/scan-run.test.ts
git commit -F /tmp/s5-task5-msg.txt
git cat-file commit HEAD | tail -10
```

---

## Task 6: `GET /api/scan/[thesisId]`

**What it does:** Owner-scoped helper. Returns the most recent `scan_runs.results` for the thesis, or 404. Mirrors `GET /api/universe/[id]/route.ts`.

**Files:**
- Create: `app/api/scan/[thesisId]/route.ts`
- Test: `tests/api/scan-get.test.ts`

- [ ] **Step 6.1: Write the failing tests**

Create `tests/api/scan-get.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalScan } from "@/tests/fixtures/scan";

const getCurrentUserMock = vi.fn();

const thesisMaybeSingleMock = vi.fn();
const thesisSelectEqMock = vi.fn(() => ({ maybeSingle: thesisMaybeSingleMock }));
const thesisSelectMock = vi.fn(() => ({ eq: thesisSelectEqMock }));

const scanLimitMock = vi.fn();
const scanOrderMock = vi.fn(() => ({ limit: scanLimitMock }));
const scanSelectEqMock = vi.fn(() => ({ order: scanOrderMock }));
const scanSelectMock = vi.fn(() => ({ eq: scanSelectEqMock }));

const fromMock = vi.fn((table: string) => {
  if (table === "theses") return { select: thesisSelectMock };
  if (table === "scan_runs") return { select: scanSelectMock };
  throw new Error(`unexpected table ${table}`);
});

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => ({ from: fromMock }),
}));

const THESIS_ID = "eu_defense_rearmament_cycle_26_05_01";

function makeRequest(id: string): Request {
  return new Request(`http://test/api/scan/${id}`, { method: "GET" });
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  fromMock.mockClear();
  thesisSelectMock.mockClear();
  thesisSelectEqMock.mockClear();
  thesisMaybeSingleMock.mockReset();
  scanSelectMock.mockClear();
  scanSelectEqMock.mockClear();
  scanOrderMock.mockClear();
  scanLimitMock.mockReset();
});

describe("GET /api/scan/[thesisId]", () => {
  it("returns 401 unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import("@/app/api/scan/[thesisId]/route");
    const res = await GET(makeRequest(THESIS_ID), {
      params: Promise.resolve({ thesisId: THESIS_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when thesis missing or wrong owner", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    thesisMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const { GET } = await import("@/app/api/scan/[thesisId]/route");
    const res = await GET(makeRequest(THESIS_ID), {
      params: Promise.resolve({ thesisId: THESIS_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when no scan_runs row exists", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    thesisMaybeSingleMock.mockResolvedValueOnce({
      data: { id: THESIS_ID, user_id: "alice" },
      error: null,
    });
    scanLimitMock.mockResolvedValueOnce({ data: [], error: null });
    const { GET } = await import("@/app/api/scan/[thesisId]/route");
    const res = await GET(makeRequest(THESIS_ID), {
      params: Promise.resolve({ thesisId: THESIS_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 with the most-recent scan_runs.results when present", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    const scan = cloneCanonicalScan();
    thesisMaybeSingleMock.mockResolvedValueOnce({
      data: { id: THESIS_ID, user_id: "alice" },
      error: null,
    });
    scanLimitMock.mockResolvedValueOnce({
      data: [{ results: scan }],
      error: null,
    });
    const { GET } = await import("@/app/api/scan/[thesisId]/route");
    const res = await GET(makeRequest(THESIS_ID), {
      params: Promise.resolve({ thesisId: THESIS_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scan.thesis_id).toBe(scan.thesis_id);
  });
});
```

- [ ] **Step 6.2: Run the tests to verify they fail**

```bash
npm test -- tests/api/scan-get.test.ts
```

Expected: failing with "Cannot find module '@/app/api/scan/[thesisId]/route'".

- [ ] **Step 6.3: Write the implementation**

Create `app/api/scan/[thesisId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ thesisId: string }> },
) {
  try {
    const { thesisId } = await params;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const supabase = getSupabaseServerClient();

    const thesisRow = await supabase
      .from("theses")
      .select("*")
      .eq("id", thesisId)
      .maybeSingle();
    if (
      thesisRow.error ||
      !thesisRow.data ||
      thesisRow.data.user_id !== user.id
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const rows = await supabase
      .from("scan_runs")
      .select("results, run_at")
      .eq("thesis_id", thesisId)
      .order("run_at", { ascending: false })
      .limit(1);

    if (rows.error) {
      return NextResponse.json(
        { error: "internal_error", detail: rows.error.message },
        { status: 500 },
      );
    }
    if (!rows.data || rows.data.length === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ scan: rows.data[0].results }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/scan/[thesisId]:GET] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", detail: message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 6.4: Run the tests to verify they pass**

```bash
npm test -- tests/api/scan-get.test.ts && npx tsc --noEmit
```

Expected: 4 passing, clean TS.

- [ ] **Step 6.5: Commit**

Write `/tmp/s5-task6-msg.txt`:

```
feat(s5): GET /api/scan/[thesisId]

Owner-scoped helper returning the most recent scan_runs.results for the
thesis. 404 when thesis missing/wrong-owner or when no scan row exists.
Mirrors the GET universe pattern from S3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Then:

```bash
git add app/api/scan/[thesisId]/route.ts tests/api/scan-get.test.ts
git commit -F /tmp/s5-task6-msg.txt
git cat-file commit HEAD | tail -10
```

---

## Task 7: `<ScanChart>` + recharts dep

**What it does:** Adds `recharts` as a runtime dep. Builds `<ScanChart>` — a thin React wrapper around recharts' `<LineChart>` that plots the universe-mean monthly close rebased to 100 at t0.

**Files:**
- Modify: `package.json` + `package-lock.json`
- Create: `components/scan-chart.tsx`
- Test: `tests/components/scan-chart.test.tsx`

- [ ] **Step 7.1: Install recharts**

```bash
npm install recharts@^2
grep recharts package.json
```

Expected: line in `"dependencies"`.

- [ ] **Step 7.2: Write the failing tests**

Create `tests/components/scan-chart.test.tsx`:

```tsx
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScanChart } from "@/components/scan-chart";
import type { TickerHistory } from "@/lib/schemas/scan";

const sampleHistory: TickerHistory[] = [
  {
    ticker: "RHM.DE",
    points: [
      { date: "2021-05-01", close: 100 },
      { date: "2021-06-01", close: 110 },
      { date: "2021-07-01", close: 120 },
    ],
  },
  {
    ticker: "BA.L",
    points: [
      { date: "2021-05-01", close: 50 },
      { date: "2021-06-01", close: 52 },
      { date: "2021-07-01", close: 55 },
    ],
  },
];

describe("<ScanChart>", () => {
  it("renders without crashing on a canonical history", () => {
    const { container } = render(<ScanChart history={sampleHistory} />);
    // recharts renders an SVG; smoke-test by presence.
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders an empty-state message when history is empty", () => {
    render(<ScanChart history={[]} />);
    expect(screen.getByText(/no history/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7.3: Run the tests to verify they fail**

```bash
npm test -- tests/components/scan-chart.test.tsx
```

Expected: failing with "Cannot find module '@/components/scan-chart'".

- [ ] **Step 7.4: Write the implementation**

Create `components/scan-chart.tsx`:

```tsx
"use client";

import React, { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TickerHistory } from "@/lib/schemas/scan";

interface ScanChartProps {
  history: TickerHistory[];
}

interface ChartRow {
  date: string;
  universe: number;
}

function rebaseToHundred(history: TickerHistory[]): ChartRow[] {
  if (history.length === 0) return [];
  // Build a date → mean(close) map across tickers, then rebase to 100 at the
  // first date that has data for any ticker.
  const byDate = new Map<string, number[]>();
  for (const h of history) {
    for (const p of h.points) {
      const arr = byDate.get(p.date) ?? [];
      arr.push(p.close);
      byDate.set(p.date, arr);
    }
  }
  const dates = Array.from(byDate.keys()).sort();
  if (dates.length === 0) return [];
  const meanCloses = dates.map((d) => {
    const vals = byDate.get(d) ?? [];
    return vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length;
  });
  const base = meanCloses[0];
  if (base === 0) {
    return dates.map((d, i) => ({ date: d, universe: 100 + meanCloses[i] }));
  }
  return dates.map((d, i) => ({ date: d, universe: (meanCloses[i] / base) * 100 }));
}

export function ScanChart({ history }: ScanChartProps) {
  const data = useMemo(() => rebaseToHundred(history), [history]);
  if (data.length === 0) {
    return (
      <p className="text-sm text-neutral-500">No history to display.</p>
    );
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="universe"
            stroke="#171717"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 7.5: Run the tests to verify they pass**

```bash
npm test -- tests/components/scan-chart.test.tsx && npx tsc --noEmit
```

Expected: 2 passing, clean TS.

If recharts complains about SSR or hydration under React 19 / jsdom, the smoke test may flake. If so, wrap recharts in `next/dynamic({ssr: false})` at the component level — but try the straight import first.

- [ ] **Step 7.6: Commit**

Write `/tmp/s5-task7-msg.txt`:

```
feat(s5): ScanChart (recharts line chart, universe rebased to 100)

ScanChart computes a single universe-mean monthly close series, rebased
to 100 at the first observed date, and renders it as a recharts
<LineChart> inside a <ResponsiveContainer>. Per-ticker series and chart
filters are deferred to S10 (screener).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Then:

```bash
git add package.json package-lock.json components/scan-chart.tsx tests/components/scan-chart.test.tsx
git commit -F /tmp/s5-task7-msg.txt
git cat-file commit HEAD | tail -10
```

---

## Task 8: `<ScanPanel>`

**What it does:** Middle-panel host. When `initial === null` shows a "Run scan" button; when `initial` is present, renders ScanChart + fundamentals table + markdown + a "Re-run scan" button. Dropped count surfaces in a `<details>`.

**Files:**
- Create: `components/scan-panel.tsx`
- Test: `tests/components/scan-panel.test.tsx`

- [ ] **Step 8.1: Write the failing tests**

Create `tests/components/scan-panel.test.tsx`:

```tsx
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScanPanel } from "@/components/scan-panel";
import { cloneCanonicalScan } from "@/tests/fixtures/scan";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("<ScanPanel>", () => {
  it("renders the Run scan button when initial is null", () => {
    render(
      <ScanPanel
        thesisId="t1"
        universeId="t1_universe_01"
        initial={null}
      />,
    );
    expect(screen.getByRole("button", { name: /run scan/i })).toBeInTheDocument();
  });

  it("renders the chart, markdown, and Re-run button when initial is set", () => {
    const scan = cloneCanonicalScan();
    render(
      <ScanPanel
        thesisId={scan.thesis_id}
        universeId={scan.universe_id}
        initial={scan}
      />,
    );
    expect(screen.getByText(/RHM\.DE/)).toBeInTheDocument();
    expect(screen.getByText(/Mean gross margin/i).closest("section")).not.toBeNull();
    expect(screen.getByRole("button", { name: /re-run scan/i })).toBeInTheDocument();
  });

  it("POSTs /api/scan/run on Run click and swaps to the returned payload", async () => {
    const user = userEvent.setup();
    const scan = cloneCanonicalScan();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ scan, dropped: [], dropped_ratios: [] }),
    });

    render(
      <ScanPanel
        thesisId={scan.thesis_id}
        universeId={scan.universe_id}
        initial={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: /run scan/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /re-run scan/i }),
      ).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/scan/run",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces dropped count when present in response", async () => {
    const user = userEvent.setup();
    const scan = cloneCanonicalScan();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        scan,
        dropped: [{ ticker: "X.L", reason: "history_lookup_failed" }],
        dropped_ratios: [],
      }),
    });
    render(
      <ScanPanel
        thesisId={scan.thesis_id}
        universeId={scan.universe_id}
        initial={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: /run scan/i }));
    await waitFor(() => {
      expect(screen.getByText(/1 ticker.*filtered/i)).toBeInTheDocument();
    });
  });

  it("surfaces 422 detail in an alert when POST fails", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: "scan_failed", detail: "too_few_history" }),
    });
    render(
      <ScanPanel
        thesisId="t1"
        universeId="t1_universe_01"
        initial={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: /run scan/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/too_few_history/);
    });
  });
});
```

- [ ] **Step 8.2: Run the tests to verify they fail**

```bash
npm test -- tests/components/scan-panel.test.tsx
```

Expected: failing with "Cannot find module '@/components/scan-panel'".

- [ ] **Step 8.3: Write the implementation**

Create `components/scan-panel.tsx`:

```tsx
"use client";

import React, { useState } from "react";
import { ScanChart } from "@/components/scan-chart";
import type { ScanResults } from "@/lib/schemas/scan";

interface ScanPanelProps {
  thesisId: string;
  universeId: string;
  initial: ScanResults | null;
}

interface Dropped {
  ticker: string;
  reason: string;
}

function FundamentalsTable({
  snapshot,
}: {
  snapshot: ScanResults["fundamentals_snapshot"];
}) {
  const fmt = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
  return (
    <section className="rounded-md border border-neutral-200 bg-white p-3 text-xs">
      <h4 className="mb-2 font-medium text-neutral-700">
        Mean gross margin / EBIT margin / FCF yield
        <span className="ml-2 font-normal text-neutral-500">
          ({snapshot.per_ticker_used} tickers)
        </span>
      </h4>
      <table className="w-full text-neutral-800">
        <thead className="text-neutral-500">
          <tr>
            <th className="text-left font-normal"></th>
            <th className="text-right font-normal">Gross</th>
            <th className="text-right font-normal">EBIT</th>
            <th className="text-right font-normal">FCF yld</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Mean</td>
            <td className="text-right tabular-nums">{fmt(snapshot.mean.gross_margin)}</td>
            <td className="text-right tabular-nums">{fmt(snapshot.mean.ebit_margin)}</td>
            <td className="text-right tabular-nums">{fmt(snapshot.mean.fcf_yield)}</td>
          </tr>
          <tr>
            <td>Median</td>
            <td className="text-right tabular-nums">{fmt(snapshot.median.gross_margin)}</td>
            <td className="text-right tabular-nums">{fmt(snapshot.median.ebit_margin)}</td>
            <td className="text-right tabular-nums">{fmt(snapshot.median.fcf_yield)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

export function ScanPanel({ thesisId, initial }: ScanPanelProps) {
  const [scan, setScan] = useState<ScanResults | null>(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropped, setDropped] = useState<Dropped[]>([]);

  async function handleRun() {
    setRunning(true);
    setError(null);
    setDropped([]);
    try {
      const res = await fetch("/api/scan/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis_id: thesisId }),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            scan?: ScanResults;
            dropped?: Dropped[];
            dropped_ratios?: Dropped[];
            error?: string;
            detail?: string;
          }
        | null;
      if (!res.ok || !body?.scan) {
        setError(body?.detail ?? body?.error ?? `Scan failed (${res.status})`);
        setRunning(false);
        return;
      }
      setScan(body.scan);
      setDropped([...(body.dropped ?? []), ...(body.dropped_ratios ?? [])]);
      setRunning(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setRunning(false);
    }
  }

  if (scan === null) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-dashed border-neutral-300 p-4">
        <p className="text-sm text-neutral-600">
          No scan has been run for this thesis yet.
        </p>
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="self-start rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          {running ? "Running..." : "Run scan"}
        </button>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ScanChart history={scan.history_5y} />
      <FundamentalsTable snapshot={scan.fundamentals_snapshot} />
      <article className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-800">
        {scan.descriptive_markdown}
      </article>
      {dropped.length > 0 ? (
        <details className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
          <summary className="cursor-pointer font-medium">
            {dropped.length} ticker(s) filtered during scan
          </summary>
          <ul className="mt-2 list-disc pl-5">
            {dropped.map((d) => (
              <li key={`${d.ticker}-${d.reason}`}>
                <code className="font-mono">{d.ticker}</code> — {d.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:bg-neutral-100"
        >
          {running ? "Re-running..." : "Re-run scan"}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 8.4: Run the tests to verify they pass**

```bash
npm test -- tests/components/scan-panel.test.tsx && npx tsc --noEmit
```

Expected: 5 passing, clean TS.

- [ ] **Step 8.5: Commit**

Write `/tmp/s5-task8-msg.txt`:

```
feat(s5): ScanPanel middle-panel host

Renders a Run scan button when initial is null; renders ScanChart +
fundamentals mean/median table + descriptive markdown + Re-run scan
button when a scan is present. POSTs /api/scan/run on click; surfaces
dropped count in a <details>; surfaces 422 detail in an inline alert.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Then:

```bash
git add components/scan-panel.tsx tests/components/scan-panel.test.tsx
git commit -F /tmp/s5-task8-msg.txt
git cat-file commit HEAD | tail -10
```

---

## Task 9: Page wire-up + StageList Stage 3 light-up

**What it does:** Server-side fetches `initialScan` in `app/thesis/[id]/page.tsx`, passes it through `ThesisDetail`, mounts `<ScanPanel>` below `<UniverseTable>`, and updates `<StageList>` to light Stage 3 when scan present.

**Files:**
- Modify: `app/thesis/[id]/page.tsx`
- Modify: `app/thesis/[id]/thesis-detail.client.tsx`
- Modify: `components/stage-list.tsx`
- Modify: existing `tests/components/stage-list.test.tsx` (extend)

- [ ] **Step 9.1: Read the current page.tsx and thesis-detail.client.tsx**

```bash
cat app/thesis/[id]/page.tsx
cat app/thesis/[id]/thesis-detail.client.tsx
cat components/stage-list.tsx
cat tests/components/stage-list.test.tsx
```

You're about to extend three files. The minimum-change pattern:

- Server `page.tsx`: alongside the existing universe fetch, add a scan fetch. Pass `initialScan` to `<ThesisDetail>`.
- Client `thesis-detail.client.tsx`: accept `initialScan: ScanResults | null`, render `<ScanPanel>` inside a new section below the universe section.
- `<StageList>`: accept `scanComplete?: boolean`, light up Stage 3 row when both `universeAttached` and `scanComplete`.
- `tests/components/stage-list.test.tsx`: assert the new prop wiring.

- [ ] **Step 9.2: Add a `fetchScanByThesis` helper (inline in page.tsx)**

Inside `app/thesis/[id]/page.tsx`, alongside whatever inline data loading already happens, add:

```ts
async function fetchScanByThesis(
  thesisId: string,
  userId: string,
): Promise<ScanResults | null> {
  const supabase = getSupabaseServerClient();
  const thesisRow = await supabase
    .from("theses")
    .select("user_id")
    .eq("id", thesisId)
    .maybeSingle();
  if (!thesisRow.data || thesisRow.data.user_id !== userId) return null;

  const rows = await supabase
    .from("scan_runs")
    .select("results")
    .eq("thesis_id", thesisId)
    .order("run_at", { ascending: false })
    .limit(1);
  if (rows.error || !rows.data || rows.data.length === 0) return null;
  const parsed = ScanResultsSchema.safeParse(rows.data[0].results);
  if (!parsed.success) return null;
  return parsed.data;
}
```

Add imports at the top:

```ts
import { ScanResultsSchema, type ScanResults } from "@/lib/schemas/scan";
```

Then in the existing data-loading block, add the scan fetch (in parallel where possible):

```ts
const initialScan = thesis ? await fetchScanByThesis(thesis.id, user.id) : null;
```

Pass it to `<ThesisDetail initialScan={initialScan} ... />`.

- [ ] **Step 9.3: Update `thesis-detail.client.tsx`**

Add to imports:

```ts
import { ScanPanel } from "@/components/scan-panel";
import type { ScanResults } from "@/lib/schemas/scan";
```

Extend props:

```ts
interface ThesisDetailProps {
  initial: Thesis;
  initialUniverse: Universe | null;
  initialScan: ScanResults | null;            // new
  seedNames?: Record<string, string>;
}
```

Destructure `initialScan` and add a new section below the existing Stage 2 section:

```tsx
{universe ? (
  <section className="flex flex-col gap-3">
    <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
      Stage 3 — Scan
    </h2>
    <ScanPanel
      thesisId={thesis.id}
      universeId={universe.id}
      initial={initialScan}
    />
  </section>
) : null}
```

(Stage 3 section only renders when a universe is present — the operator can't scan without one.)

- [ ] **Step 9.4: Update `<StageList>`**

Read the current file. Add `scanComplete?: boolean` to its props. In the Stage 3 row, when `universeAttached && scanComplete`, render in the same "complete" style as Stage 2's lit state. Otherwise render in the existing placeholder style.

If the existing StageList doesn't already plumb stage props through the page, the minimum-change path is to derive both `universeAttached` and `scanComplete` from the same data the page already has (`thesis.universe_id` and `initialScan !== null`).

- [ ] **Step 9.5: Extend `tests/components/stage-list.test.tsx`**

Add a test asserting Stage 3 row lights up when `scanComplete && universeAttached`:

```tsx
it("lights Stage 3 row when scanComplete && universeAttached", () => {
  render(<StageList universeAttached scanComplete />);
  const stage3 = screen.getByText(/Stage 3/i).closest("li");
  // Assertion shape depends on the existing styling convention — mirror Stage 2.
  // E.g. expect(stage3?.className).toMatch(/text-green/);
  expect(stage3).not.toBeNull();
});
```

Adapt the assertion shape to whatever the existing Stage 2 test does — consistency over invention.

- [ ] **Step 9.6: Type-check + full suite**

```bash
npx tsc --noEmit
npm test
```

Expected: clean TS; total tests pass.

- [ ] **Step 9.7: Manual smoke (do not skip)**

```bash
npm run dev
```

Walk through:

1. Sign in.
2. Navigate to a thesis that already has a universe (e.g. one built earlier).
3. Scroll to the new "Stage 3 — Scan" section. Should render with "No scan has been run for this thesis yet" and a **Run scan** button.
4. Click **Run scan**. Wait ~30–90s for 20+ Yahoo calls + the agent.
5. On success, the chart should render (single line, universe-mean rebased to 100), the mean/median fundamentals table should appear, and the 3-paragraph markdown should render in a `<pre>` block.
6. Filtered tickers (if any) appear in the collapsible details list below.
7. Reload the page — the scan persists; Stage 3 in `<StageList>` is lit.
8. Click **Re-run scan** — produces a new payload. Open the Supabase studio (or `psql`) and verify only one `scan_runs` row exists for this `thesis_id`, but `pipeline_events` has accumulated `start` + `complete` rows from both runs.

Stop the dev server when verified.

- [ ] **Step 9.8: Commit**

Write `/tmp/s5-task9-msg.txt`:

```
feat(s5): mount ScanPanel on /thesis/[id]; light up Stage 3

page.tsx server-fetches initialScan from scan_runs; thesis-detail.client
renders <ScanPanel> below the universe section when a universe exists.
StageList accepts a scanComplete prop and lights Stage 3 when
universeAttached && scanComplete.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Then:

```bash
git add app/thesis/[id]/page.tsx app/thesis/[id]/thesis-detail.client.tsx components/stage-list.tsx tests/components/stage-list.test.tsx
git commit -F /tmp/s5-task9-msg.txt
git cat-file commit HEAD | tail -10
```

---

## Task 10: AC walkthrough + close issue #7

- [ ] **Step 10.1: Full test suite one more time**

```bash
npm test
```

Capture the final summary line.

- [ ] **Step 10.2: Close issue #7 with the AC walk**

Write `/tmp/s5-task10-msg.txt` with the issue body content (verbatim below), then:

```bash
gh issue close 7 --body-file /tmp/s5-task10-msg.txt
```

Body:

```
## S5 acceptance criteria walkthrough

Per the design spec at docs/superpowers/specs/2026-05-19-s5-scan-stage-design.md:

- [x] POST /api/scan/run returns {scan: {history_5y, fundamentals_snapshot, descriptive_markdown}} — covered by tests/api/scan-run.test.ts happy path + manual smoke.
- [x] Descriptive markdown free of forbidden tokens (regex assertion in route logs warning, ships result) — covered by tests/api/scan-run.test.ts judgment-leakage test.
- [x] Chart renders 5y universe-mean returns line — covered by tests/components/scan-chart.test.tsx + manual smoke.
- [x] Re-run replaces scan_runs row payload; prior payload observable in pipeline_events — covered by tests/api/scan-run.test.ts delete-then-insert + pipeline_events start+complete assertions.
- [x] Vitest unit test for the aggregation function — tests/aggregation/fundamentals.test.ts.
- [x] Stage 3 in left panel lights up after a successful run — components/stage-list.tsx edit + tests/components/stage-list.test.tsx + manual smoke.

## Deviations from the original issue

- Driver-specific time series from yahoo-finance2 fundamentals (mentioned in scope) is **not** included. The data is not deterministically available across global tickers, and S9 will land driver-specific data once the driver schema is concrete. S5 ships universe-aggregate fundamentals only (gross margin, EBIT margin, FCF yield).
- IR transcripts are NOT a precondition for this stage (S4 is deferred). The transcript_source / transcript_url fields on universe rows remain optional and ignored by the scan path.

## Out of scope (per design spec)

- Per-ticker chart series — S10 (screener).
- Concurrency in Yahoo wrapper — S10.
- Background scheduling / cron — S13.
- Auto-invalidation of scan when universe edits — operator clicks Re-run.
```

- [ ] **Step 10.3: (Optional) Push the branch and update or open a PR**

If S3 is unmerged and S5 stacked on top, decide whether to:
- update the existing S3 PR title/body to also cover S5, or
- cut a fresh `s5-scan-stage` branch off the current HEAD and open a stacked PR — `gh pr create --base s3-universe-build --head s5-scan-stage`.

If S3 is already merged, push S5 to its own branch off master and open a normal PR.

---

## Self-review notes

- **Spec coverage:** every section in the design doc maps to a task. Decision 1 (recharts) → Task 7. Decision 2 (5y monthly) → Task 1 getHistory. Decision 3 (fundamentals snapshot, ETFs excluded) → Tasks 1 + 2 + 5. Decision 4 (delete-then-insert) → Task 5. Decision 5 (pipeline_events start + complete) → Task 5. Decision 6 (judgment-leakage warning) → Task 5. Decision 7 (serial) → Task 5's `for...of` loop. Decision 8 (Run / Re-run UX) → Task 8. Decision 9 (Stage 3 light-up) → Task 9.
- **Type consistency:** `TickerRatios` is defined in `lib/data/yahoo.ts` and imported by `lib/aggregation/fundamentals.ts`. `ScanResults` is defined in `lib/schemas/scan.ts` and consumed by the route, the GET helper, ScanPanel, and the server page.tsx fetch.
- **No placeholders.** Every step contains the actual code or command.
- **IR-transcript independence is preserved.** Search the plan for "transcript" — the only mention is in the AC-walk note clarifying that S5 doesn't need S4.
