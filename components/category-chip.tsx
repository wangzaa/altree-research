import React from "react";
import type { QuestionCategory } from "@/lib/schemas/question";

const LABELS: Record<QuestionCategory, string> = {
  derivable: "from scan data",
  corpus: "from corpus",
  web: "needs web",
  fundamentals_extra: "needs fundamentals",
  needs_analyst: "needs analyst",
};

const TONES: Record<QuestionCategory, string> = {
  derivable: "bg-pear-cyan-light text-pear-black",
  corpus: "bg-pear-beige text-pear-black",
  web: "bg-pear-peach text-pear-black",
  fundamentals_extra: "bg-neutral-200 text-neutral-700",
  needs_analyst: "bg-neutral-200 text-neutral-700",
};

export function CategoryChip({
  category,
}: {
  category: QuestionCategory | undefined;
}) {
  if (!category) {
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
        classifying…
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${TONES[category]}`}
    >
      {LABELS[category]}
    </span>
  );
}
