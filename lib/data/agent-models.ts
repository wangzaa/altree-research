import registryJson from "./agent-models.json";
import {
  AgentModelMapSchema,
  type AgentModelMap,
  type AgentName,
} from "@/lib/schemas/agent-models";

let _cache: AgentModelMap | null = null;

export function loadAgentModels(): AgentModelMap {
  if (_cache) return _cache;
  const parsed = AgentModelMapSchema.safeParse(registryJson);
  if (!parsed.success) {
    throw new Error(
      `Invalid lib/data/agent-models.json: ${parsed.error.message}`,
    );
  }
  _cache = parsed.data;
  return _cache;
}

export function getModelFor(agent: AgentName): string {
  return loadAgentModels()[agent];
}

export type { AgentName, AgentModelMap };
