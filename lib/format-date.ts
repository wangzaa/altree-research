/** Compact "Apr 20 · 14:32" date format used in the recent-sessions
 * carousel and the Anti/Thesis "Last refreshed …" caption. Short enough
 * for narrow UI surfaces without losing the hour, which matters when the
 * user runs multiple theses per day. Returns the raw input on parse
 * failure so the UI degrades gracefully. */
export function formatCompactDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const month = d.toLocaleString([], { month: "short" });
  const day = d.getDate();
  const time = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${month} ${day} · ${time}`;
}
