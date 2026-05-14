import { requireUser } from "@/lib/auth/require-user";
import { ThesisExtractForm } from "@/components/thesis-extract-form";

export default async function NewThesisPage() {
  await requireUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-2xl rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-900">New thesis</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Paste a thesis snippet and we will extract the structured Stage 1
          object.
        </p>

        <div className="mt-6">
          <ThesisExtractForm />
        </div>
      </div>
    </main>
  );
}
