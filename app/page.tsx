import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";

export default async function Home() {
  await requireUser();

  return (
    <main className="min-h-screen bg-pear-off-white">
      <section className="container mx-auto px-6 lg:px-12 py-24">
        <div className="max-w-3xl">
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-black)" }}
          >
            altree research
          </span>
          <h1
            className="mt-4"
            style={{
              fontFamily: "var(--font-playfair)",
              fontWeight: 500,
              fontSize: "clamp(2.5rem, 5vw + 1rem, 3.75rem)",
              lineHeight: 1.1,
            }}
          >
            Investment thesis research, end to end.
          </h1>
          <p
            className="mt-6 text-lg"
            style={{ color: "#585858", maxWidth: 560, lineHeight: 1.6 }}
          >
            Extract structure from prose, build a universe, gather supporting
            and threshold-breach evidence, and decide whether the thesis still
            holds.
          </p>
          <div className="mt-8 flex gap-4">
            <Link href="/thesis/new" className="btn btn-primary">
              New thesis
            </Link>
            <form action="/sign-out" method="post">
              <button type="submit" className="btn btn-outline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
