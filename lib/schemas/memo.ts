import { z } from "zod";
import { VerdictSchema } from "@/lib/schemas/thesis";

export const MemoSchema = z
  .object({
    verdict: VerdictSchema,
    bull_summary: z.string().min(1),
    bear_summary: z.string().min(1),
    recommendation: z.string().min(1),
    open_questions: z.array(z.string().min(1)).min(0).max(8).default([]),
  })
  .strict();

export type Memo = z.infer<typeof MemoSchema>;
