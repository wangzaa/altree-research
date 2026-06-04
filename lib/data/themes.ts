import registryJson from "./themes.json";
import {
  ThemeRegistrySchema,
  type Theme,
  type ThemeRegistry,
} from "@/lib/schemas/themes";

let _cache: ThemeRegistry | null = null;

/** Load + validate the hot-topic registry. Cached. */
export function loadThemes(): ThemeRegistry {
  if (_cache) return _cache;
  const parsed = ThemeRegistrySchema.safeParse(registryJson);
  if (!parsed.success) {
    throw new Error(`Invalid lib/data/themes.json: ${parsed.error.message}`);
  }
  _cache = parsed.data;
  return _cache;
}

export function getThemes(): Theme[] {
  return loadThemes().themes;
}

export function getTheme(id: string): Theme | undefined {
  return getThemes().find((t) => t.id === id);
}

export type { Theme };
