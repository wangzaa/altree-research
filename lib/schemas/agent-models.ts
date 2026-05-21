import { z } from "zod";

export const AGENT_NAMES = [
  "thesis_extractor",
  "thesis_refiner",
  "universe_discoverer",
  "scan_runner",
  "bull_researcher",
  "bear_researcher",
] as const;

export const AgentNameSchema = z.enum(AGENT_NAMES);

export const AgentModelMapSchema = z
  .object({
    thesis_extractor: z.string().min(1),
    thesis_refiner: z.string().min(1),
    universe_discoverer: z.string().min(1),
    scan_runner: z.string().min(1),
    bull_researcher: z.string().min(1),
    bear_researcher: z.string().min(1),
  })
  .strict();

export type AgentName = z.infer<typeof AgentNameSchema>;
export type AgentModelMap = z.infer<typeof AgentModelMapSchema>;
