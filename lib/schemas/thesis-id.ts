export interface ThesisIdInput {
  slug: string;
  year: number;
  month: number;
  existingIds: string[];
}

const SLUG_REGEX = /^[a-z][a-z0-9_]*$/;

export function generateThesisId(input: ThesisIdInput): string {
  const { slug, year, month, existingIds } = input;

  if (!SLUG_REGEX.test(slug)) {
    throw new Error(
      `Invalid slug "${slug}": must match /^[a-z][a-z0-9_]*$/`,
    );
  }
  if (year < 2000 || year > 2099) {
    throw new Error(
      `Invalid year ${year}: must be in [2000, 2099]`,
    );
  }
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month ${month}: must be in [1, 12]`);
  }

  const yy = String(year % 100).padStart(2, "0");
  const mm = String(month).padStart(2, "0");

  const prefix = `${slug}_${yy}_${mm}_`;
  const runRegex = new RegExp(`^${slug}_${yy}_${mm}_(\\d{2})$`);

  let maxRun = 0;
  for (const id of existingIds) {
    const match = id.match(runRegex);
    if (match) {
      const run = parseInt(match[1], 10);
      if (run > maxRun) maxRun = run;
    }
  }

  const nextRun = maxRun + 1;
  return `${prefix}${String(nextRun).padStart(2, "0")}`;
}
