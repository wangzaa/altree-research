// Server-only module. Reached only from server components; persist.ts pulls the
// Supabase client via a dynamic import, so nothing server-only lands at module
// import time. Mirrors the fx-live (server) vs fx (client) split.
import { getCoveredCompany } from "@/lib/data/jp-companies";
import { getOpportunitySet } from "./persist";
import { joinCoveredData, type OpportunityRow } from "./view";

/**
 * Server-only: read a topic's persisted opportunity set (#28) and join it to
 * the committed covered set for the display rows (#30). Kept separate from the
 * client-safe view.ts so the Supabase server client never reaches a client
 * bundle (same guard as lib/data/fx-live vs fx).
 */
export async function getOpportunityView(
  themeId: string,
): Promise<OpportunityRow[]> {
  const set = await getOpportunitySet(themeId);
  return joinCoveredData(set, (ticker) => getCoveredCompany(ticker));
}
