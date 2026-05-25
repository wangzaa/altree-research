import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverUniverse } from "@/lib/agents/universe-discoverer";
import { getCurrentUser } from "@/lib/auth/session";
import { getQuote, getFundamentals } from "@/lib/data/yahoo";
import { toUsdLive } from "@/lib/data/fx";
import { getRatesUsd } from "@/lib/data/fx-live";
import { getRegionForTicker } from "@/lib/data/regions";
import { ThesisIdSchema, type Thesis } from "@/lib/schemas/thesis";
import {
  UniverseSchema,
  type Universe,
  type UniverseTicker,
} from "@/lib/schemas/universe";
import { generateUniverseId } from "@/lib/schemas/universe-id";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getModelFor } from "@/lib/data/agent-models";

const BodySchema = z.object({
  thesis_id: ThesisIdSchema,
  anchor_ticker: z.string().min(1).max(40),
});

interface DroppedTicker {
  ticker: string;
  reason:
    | "unknown_suffix"
    | "yahoo_lookup_failed"
    | "unknown_currency"
    | "below_market_cap_floor";
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
    const currentVersion =
      (thesisRow.data.version as number | undefined) ?? thesis.version;

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

    const discovererModel = getModelFor("universe_discoverer");
    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "universe",
      agent: "universe_discoverer",
      event_type: "start",
      payload: { anchor: anchor_ticker, model: discovererModel },
    });

    const { rates: anchorRates } = await getRatesUsd(
      anchorQuote.currency ? [anchorQuote.currency] : [],
    );
    const anchorMcapUsd = toUsdLive(
      anchorQuote.market_cap_local,
      anchorQuote.currency,
      anchorRates,
    );

    let discovery;
    try {
      discovery = await discoverUniverse({
        thesis,
        anchor: {
          ticker: anchor_ticker,
          name: anchorQuote.name,
          sector: anchorFundamentals.sector,
          industry: anchorFundamentals.industry,
          market_cap_usd: anchorMcapUsd,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[/api/universe/build] discover_failed:", message);
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "universe",
        agent: "universe_discoverer",
        event_type: "error",
        payload: { error: message, model: discovererModel },
      });
      return NextResponse.json(
        { error: "discovery_failed", detail: message },
        { status: 422 },
      );
    }
    if (!discovery.ok) {
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "universe",
        agent: "universe_discoverer",
        event_type: "error",
        payload: { error: discovery.error, model: discovererModel },
      });
      return NextResponse.json(
        {
          error: "discovery_failed",
          detail: discovery.error,
          raw: discovery.raw ?? null,
        },
        { status: 422 },
      );
    }

    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "universe",
      agent: "universe_discoverer",
      event_type: "complete",
      payload: {
        model: discovery.model,
        usage: discovery.usage,
        proposed: discovery.tickers.length,
      },
    });

    const tickers: UniverseTicker[] = [];
    const dropped: DroppedTicker[] = [];

    // Always seed the anchor first (deduped against agent output). If the
    // discoverer happened to also return the anchor in its proposed list,
    // borrow its exposure_rationale + notes so the anchor row carries the
    // same context as every other row; otherwise leave them empty (the row
    // is visually distinguished by is_anchor=true).
    const anchorProposed = discovery.tickers.find(
      (p) => p.ticker === anchor_ticker,
    );
    const anchorTicker: UniverseTicker = {
      ticker: anchor_ticker,
      name: anchorQuote.name,
      region: anchorRegion,
      market_cap_usd_b: (anchorMcapUsd ?? 0) / 1e9,
      exposure_tier: "pure_play",
      exposure_rationale: anchorProposed?.exposure_rationale || undefined,
      notes: anchorProposed?.notes ?? "",
      is_anchor: true,
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
      // FX module caches per-currency for 30 min, so repeat currencies in
      // the discovery list are O(1) lookups, not extra Yahoo calls.
      const { rates } = await getRatesUsd(
        quote.currency ? [quote.currency] : [],
      );
      const mcapUsd = toUsdLive(
        quote.market_cap_local,
        quote.currency,
        rates,
      );
      if (mcapUsd === null) {
        dropped.push({ ticker: proposed.ticker, reason: "unknown_currency" });
        continue;
      }
      if (mcapUsd < thesis.scope.market_cap_min_usd) {
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
        market_cap_usd_b: mcapUsd / 1e9,
        exposure_tier: proposed.exposure_tier,
        exposure_rationale: proposed.exposure_rationale || undefined,
        notes: proposed.notes,
      });
    }

    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "universe",
      agent: "yahoo_filter",
      event_type: "complete",
      payload: {
        survivors: tickers.length,
        dropped: dropped.length,
        dropped_reasons: dropped.reduce<Record<string, number>>((acc, d) => {
          acc[d.reason] = (acc[d.reason] ?? 0) + 1;
          return acc;
        }, {}),
      },
    });

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
