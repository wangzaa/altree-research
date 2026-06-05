import { requireUser } from "@/lib/auth/require-user";
import { PreviousSessions } from "@/components/previous-sessions";
import { ThesisExtractForm } from "@/components/thesis-extract-form";
import { HotTopicCards } from "@/components/hot-topic-cards";
import { OpportunitySetView } from "@/components/opportunity-set-view";
import { getThemes, getTheme } from "@/lib/data/themes";
import { getOpportunityView } from "@/lib/agents/theme-exposure/view-server";
import { getRatesUsd, formatFxAsOf } from "@/lib/data/fx-live";

export default async function NewThesisPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  await requireUser();
  const { topic } = await searchParams;

  const themes = getThemes();
  const selected = topic ? getTheme(topic) : undefined;

  // Fetch the opportunity set + live FX only when a topic is selected.
  let rows = null as Awaited<ReturnType<typeof getOpportunityView>> | null;
  let ratesByCurrency: Record<string, number> | undefined;
  let fxAsOf: string | null = null;
  if (selected) {
    rows = await getOpportunityView(selected.id);
    const fx = await getRatesUsd(["JPY"]);
    ratesByCurrency = fx.rates;
    fxAsOf = formatFxAsOf(fx.as_of_ms);
  }

  return (
    <main className="min-h-screen bg-pear-off-white py-16">
      <div className="container mx-auto px-6 lg:px-12">
        <div className="max-w-2xl mx-auto">
          <h1
            style={{
              fontFamily: "var(--font-playfair)",
              fontWeight: 500,
              fontSize: "clamp(2rem, 4vw, 2.5rem)",
              lineHeight: 1.15,
            }}
          >
            New thesis
          </h1>
          <p className="mt-3 text-base" style={{ color: "#585858" }}>
            A headline, a paragraph, a Substack post you saved — drop it in.
            We&apos;ll lift out the claims and drivers. Sharpen it before the
            evidence weighs in.
          </p>
          <div
            className="mt-8 bg-white"
            style={{
              borderRadius: 18.75,
              padding: 30,
              border: "1px solid #E5E5E5",
            }}
          >
            <ThesisExtractForm />
          </div>

          <section className="mt-12 flex flex-col gap-4">
            <h2
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-black)" }}
            >
              Hot topics
            </h2>
            <p className="-mt-2 text-sm" style={{ color: "#585858" }}>
              Global storylines moving now. Pick one to see the Japanese
              companies recently exposed to it.
            </p>
            <HotTopicCards themes={themes} selectedId={selected?.id} />
          </section>

          {selected && rows ? (
            <section className="mt-8">
              <OpportunitySetView
                themeLabel={selected.label}
                rows={rows}
                ratesByCurrency={ratesByCurrency}
                fxAsOf={fxAsOf}
              />
            </section>
          ) : null}

          <section className="mt-12 flex flex-col gap-4">
            <h2
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-black)" }}
            >
              Previous sessions
            </h2>
            <PreviousSessions />
          </section>
        </div>
      </div>
    </main>
  );
}
