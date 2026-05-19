// PROTOTYPE — CLI entry point.
//
// Usage:
//   npm run pulse -- ingest
//   npm run pulse -- run --query "AI accelerator demand sustainability"
//   npm run pulse -- run --ticker NVDA --query "..."
//   npm run pulse -- run --ticker TSM --keyword HBM --query "..." --limit 8

import { ingest } from "./ingest";
import { retrieve } from "./retrieve";
import { runLens, type EvidenceItem, type LensResult } from "./lens";

type Args = {
  cmd: string;
  opts: {
    ticker?: string;
    keyword?: string[];
    query?: string;
    since?: string;
    limit?: string;
  };
};

function parseArgs(argv: string[]): Args {
  const cmd = argv[0] || "";
  const opts: Args["opts"] = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val === undefined || val.startsWith("--")) continue;
    if (key === "keyword") {
      opts.keyword = [...(opts.keyword ?? []), val];
    } else if (key in opts || ["ticker", "query", "since", "limit"].includes(key)) {
      (opts as Record<string, string>)[key] = val;
    }
    i++;
  }
  return { cmd, opts };
}

function printEvidence(label: string, items: EvidenceItem[]): void {
  console.log(`\n--- ${label} (${items.length} item${items.length === 1 ? "" : "s"}) ---`);
  if (!items.length) {
    console.log("  (none)");
    return;
  }
  items.forEach((e, i) => {
    console.log(`\n[${i + 1}] ${e.expert} — ${(e.date || "").slice(0, 10)}`);
    console.log(`    ${e.post_title}`);
    console.log(`    ${e.post_url}`);
    console.log(`    "${e.quote}"`);
  });
}

async function runCmd(opts: Args["opts"]): Promise<void> {
  const ticker = opts.ticker;
  const keywords = opts.keyword ?? [];
  const query = opts.query ?? "general thesis on the matched companies";
  const limit = opts.limit ? Number(opts.limit) : 12;

  const posts = retrieve({ ticker, keywords, since: opts.since, limit });

  console.log("\n=== Retrieval ===");
  console.log(`ticker:    ${ticker ?? "(none)"}`);
  console.log(`keywords:  ${keywords.join(", ") || "(none)"}`);
  console.log(`since:     ${opts.since ?? "(none)"}`);
  console.log(`limit:     ${limit}`);
  console.log(`query:     ${query}`);
  console.log(`matched:   ${posts.length} post(s)`);
  posts.forEach((p) =>
    console.log(
      `  • ${p.expert_name} — ${p.published.slice(0, 10)} — ${p.title}${
        p.is_paywalled ? " [paywalled excerpt]" : ""
      }`,
    ),
  );

  if (!posts.length) {
    console.log("\nNo posts matched. Try a different ticker, or run ingest first.");
    return;
  }

  console.log("\n=== Running Bull and Bear in parallel ===");
  const t0 = Date.now();
  const results: [LensResult, LensResult] = await Promise.all([
    runLens("bull", query, posts),
    runLens("bear", query, posts),
  ]);
  const [bull, bear] = results;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  printEvidence("BULL", bull.evidence);
  printEvidence("BEAR", bear.evidence);

  console.log("\n=== Usage ===");
  console.log(
    `bull: ${bull.usage.input_tokens} in / ${bull.usage.output_tokens} out`,
  );
  console.log(
    `bear: ${bear.usage.input_tokens} in / ${bear.usage.output_tokens} out`,
  );
  console.log(`elapsed: ${elapsed}s`);
}

function printUsage(): void {
  console.error("Usage:");
  console.error("  npm run pulse -- ingest");
  console.error('  npm run pulse -- run --query "..." [--ticker NVDA] [--keyword X] [--since 2024-01-01] [--limit 12]');
}

async function main(): Promise<void> {
  const { cmd, opts } = parseArgs(process.argv.slice(2));
  if (cmd === "ingest") {
    await ingest();
    return;
  }
  if (cmd === "run") {
    await runCmd(opts);
    return;
  }
  console.error(`Unknown command: ${cmd || "(none)"}`);
  printUsage();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
