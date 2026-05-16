"use client";

import React, { useState } from "react";
import { ThesisEditor } from "@/components/thesis-editor";
import { ThesisJsonView } from "@/components/thesis-json-view";
import type { Thesis } from "@/lib/schemas/thesis";

export function ThesisDetail({ initial }: { initial: Thesis }) {
  const [thesis, setThesis] = useState<Thesis>(initial);
  return (
    <div className="flex flex-col gap-6">
      <ThesisJsonView thesis={thesis} />
      <ThesisEditor thesis={thesis} onApplied={setThesis} />
    </div>
  );
}
