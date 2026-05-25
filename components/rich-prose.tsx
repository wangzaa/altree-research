import React from "react";

/**
 * Lightweight prose renderer that handles two markdown affordances:
 *   - **bold** spans (inline)
 *   - leading "- " or "* " bullet lines, grouped into a <ul>
 *
 * Anything else is rendered as-is, with line breaks preserved via
 * `whitespace: pre-line` on the surrounding block. This is intentionally
 * narrower than a general markdown parser — the memo/diff-narrator/bubble
 * outputs only need these two affordances and a real parser would pull
 * in dependencies we don't need.
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((segment, i) =>
    i % 2 === 1 ? (
      <strong key={`${keyPrefix}-b-${i}`}>{segment}</strong>
    ) : (
      <React.Fragment key={`${keyPrefix}-t-${i}`}>{segment}</React.Fragment>
    ),
  );
}

export function RichProse({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  // Walk the line array, batching consecutive bullet lines into a single
  // <ul> so the output is semantic rather than visually mimicked.
  const blocks: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];
  let blockIdx = 0;

  function flushBullets() {
    if (bulletBuffer.length === 0) return;
    const items = bulletBuffer.map((item, i) => (
      <li key={`li-${blockIdx}-${i}`}>{renderInline(item, `li-${blockIdx}-${i}`)}</li>
    ));
    blocks.push(
      <ul
        key={`ul-${blockIdx}`}
        className="my-1 ml-5 list-disc space-y-0.5"
      >
        {items}
      </ul>,
    );
    bulletBuffer = [];
    blockIdx += 1;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (bulletMatch) {
      bulletBuffer.push(bulletMatch[1]);
      continue;
    }
    flushBullets();
    if (line.length === 0) {
      blocks.push(<div key={`sp-${blockIdx}`} className="h-2" />);
    } else {
      blocks.push(
        <p key={`p-${blockIdx}`} className="my-0.5">
          {renderInline(line, `p-${blockIdx}`)}
        </p>,
      );
    }
    blockIdx += 1;
  }
  flushBullets();

  return <>{blocks}</>;
}
