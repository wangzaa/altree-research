import { requireUser } from "@/lib/auth/require-user";
import { ThesisExtractForm } from "@/components/thesis-extract-form";

export default async function NewThesisPage() {
  await requireUser();

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
            Drop in a headline, a paragraph, a Substack post you saved — drop
            it in. We&apos;ll lift out the claims and drivers. Sharpen it
            before the evidence weighs in.
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
        </div>
      </div>
    </main>
  );
}
