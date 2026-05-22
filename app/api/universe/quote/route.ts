import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getRegionForTicker } from "@/lib/data/regions";
import { getQuote } from "@/lib/data/yahoo";
import { toUsd } from "@/lib/data/fx";

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
  const market_cap_usd = toUsd(quote.market_cap_local, quote.currency);
  return NextResponse.json(
    { name: quote.name, market_cap_usd, currency: quote.currency },
    { status: 200 },
  );
}
