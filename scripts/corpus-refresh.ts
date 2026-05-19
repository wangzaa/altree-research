// One-shot manual ingest. Run via `npm run corpus:refresh`.

import { refreshCorpus } from "@/lib/ingest/expert-corpus";

async function main() {
  console.log("Refreshing expert corpus...\n");
  const summary = await refreshCorpus();
  for (const e of summary.per_expert) {
    if (e.error) {
      console.log(`✗ ${e.slug}: ${e.error}`);
    } else {
      console.log(
        `✓ ${e.slug}: +${e.new_posts} new (feed had ${e.total_seen})`,
      );
    }
  }
  console.log(`\nTotal new: ${summary.total_new}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
