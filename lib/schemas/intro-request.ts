import { z } from "zod";
import { ThesisIdSchema } from "@/lib/schemas/thesis";

/**
 * Lead-gen "Request intro" payload (ADR-0004). The user asks to be introduced
 * to a Japanese fund/brokerage for a researched company. v1 captures intent
 * only — persisted to intro_requests, no live partner routing.
 */
export const IntroRequestBodySchema = z
  .object({
    thesis_id: ThesisIdSchema,
    ticker: z.string().min(1).max(40),
    memo_id: z.string().uuid().optional(),
    note: z.string().max(2000).optional(),
  })
  .strict();

export type IntroRequestBody = z.infer<typeof IntroRequestBodySchema>;
