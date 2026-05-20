import { z } from "zod";

export const ExpertSchema = z
  .object({
    slug: z.string().regex(/^[a-z][a-z0-9_]*$/),
    name: z.string().min(1),
    author: z.string().min(1),
    url: z.string().url(),
    feed_url: z.string().url(),
    sectors: z.array(z.string().min(1)).min(1),
    active: z.boolean().default(true),
    notes: z.string().optional(),
  })
  .strict();

export const SectorRegistryEntrySchema = z
  .object({
    label: z.string().min(1),
    gics: z.array(z.string().regex(/^\d{2,8}$/)).default([]),
  })
  .strict();

export const ExpertRegistrySchema = z
  .object({
    experts: z.array(ExpertSchema).min(1),
    sectors: z.record(z.string(), SectorRegistryEntrySchema),
  })
  .strict();

export type Expert = z.infer<typeof ExpertSchema>;
export type SectorRegistryEntry = z.infer<typeof SectorRegistryEntrySchema>;
export type ExpertRegistry = z.infer<typeof ExpertRegistrySchema>;
