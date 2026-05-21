import { thesisBubbles } from "@/lib/thesis-bubbles";
import type { Thesis } from "@/lib/schemas/thesis";

/**
 * Plain-prose flattening of the chat bubbles for the diff narrator and other
 * non-UI consumers. The UI itself reads `thesisBubbles()` directly so each
 * piece can render as its own message.
 */
export function summariseThesis(t: Thesis): string {
  return thesisBubbles(t)
    .map((b) => (b.label ? `${b.label}: ${b.body}` : b.body))
    .join("\n\n");
}
