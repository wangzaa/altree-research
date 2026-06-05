import React from "react";
import Link from "next/link";
import type { Theme } from "@/lib/schemas/themes";

export interface HotTopicCardsProps {
  themes: Theme[];
  selectedId?: string;
}

/**
 * The theme-first front door (#30 / ADR-0003): the 4–5 hand-declared hot-topic
 * cards. Each links to its opportunity set on the /thesis/new scaffold
 * (?topic=<id>); the free-form discovery entry on top is a separate slice.
 */
export function HotTopicCards({ themes, selectedId }: HotTopicCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {themes.map((theme) => {
        const isSelected = theme.id === selectedId;
        return (
          <Link
            key={theme.id}
            href={`/thesis/new?topic=${theme.id}`}
            aria-current={isSelected ? "true" : undefined}
            className="block transition-shadow hover:shadow-sm"
            style={{
              borderRadius: 18.75,
              padding: 20,
              background: isSelected ? "#F0EFEC" : "white",
              border: `1px solid ${isSelected ? "var(--color-black)" : "#E5E5E5"}`,
            }}
          >
            <h3
              className="text-base"
              style={{
                fontFamily: "var(--font-playfair)",
                fontWeight: 500,
                color: "var(--color-black)",
              }}
            >
              {theme.label}
            </h3>
            <p
              className="mt-1.5 text-sm"
              style={{ color: "#585858", lineHeight: 1.5 }}
            >
              {theme.description}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
