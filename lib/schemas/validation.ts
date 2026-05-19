// New corpus-style evidence shape. Coexists with the older EvidenceSchema in
// lib/schemas/thesis.ts (kept for backward compatibility on the thesis
// object itself); Bull/Bear writes go to validation_runs.results, not to
// thesis.drivers[i].evidence.

import { z } from "zod";

export const CorpusEvidenceSchema = z
  .object({
    expert: z.string().min(1),
    post_id: z.string().min(1),
    post_url: z.string().url(),
    post_title: z.string().min(1),
    quote: z.string().min(1),
    date: z.string(),
  })
  .strict();

export const DriverValidationResultSchema = z
  .object({
    bull_evidence: z.array(CorpusEvidenceSchema).default([]),
    bear_evidence: z.array(CorpusEvidenceSchema).default([]),
    // verified flags and triangulator_output land in narrowed S7.
  })
  .strict();

export type CorpusEvidence = z.infer<typeof CorpusEvidenceSchema>;
export type DriverValidationResult = z.infer<
  typeof DriverValidationResultSchema
>;
