import { z } from "zod";

/**
 * Hot topics: the 4–5 hand-declared global macro storylines that seed the
 * theme-first front door (ADR-0003). The expert corpus *substantiates* these;
 * it does not pick them. Each topic's keyword set drives stage-1 recall in the
 * theme-exposure funnel, so it must be WIDE (synonyms + supply-chain terms) —
 * a stage-1 miss never reaches the LLM precision pass.
 */

export const ThemeSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().min(1),
    description: z.string().min(1),
    // Wide on purpose: include synonyms + supply-chain terms, not just the
    // topic name. Minimum 6 to discourage a too-narrow net.
    keywords: z.array(z.string().min(1)).min(6),
  })
  .strict();

export const ThemeRegistrySchema = z
  .object({
    themes: z.array(ThemeSchema).min(4).max(5),
  })
  .strict();

export type Theme = z.infer<typeof ThemeSchema>;
export type ThemeRegistry = z.infer<typeof ThemeRegistrySchema>;
