import registryJson from "./experts.json";
import {
  ExpertRegistrySchema,
  type Expert,
  type ExpertRegistry,
} from "@/lib/schemas/experts";

let _cache: ExpertRegistry | null = null;

export function loadRegistry(): ExpertRegistry {
  if (_cache) return _cache;
  const parsed = ExpertRegistrySchema.safeParse(registryJson);
  if (!parsed.success) {
    throw new Error(
      `Invalid lib/data/experts.json: ${parsed.error.message}`,
    );
  }
  _cache = parsed.data;
  return _cache;
}

export function getActiveExpertsForSectors(sectorTags: string[]): Expert[] {
  const reg = loadRegistry();
  const wanted = new Set(sectorTags);
  return reg.experts.filter(
    (e) => e.active !== false && e.sectors.some((s) => wanted.has(s)),
  );
}

export type { Expert };
