import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";

export default async function Home() {
  await requireUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-900">
          altree-research
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Walking skeleton — Stage 1 thesis extraction.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/thesis/new"
            className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            New thesis
          </Link>

          <form action="/sign-out" method="post">
            <button
              type="submit"
              className="w-full rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
