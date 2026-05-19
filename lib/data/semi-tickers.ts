// Ticker dictionary for the semis universe. Used by lib/ingest/html.ts to
// extract company mentions from post content. The dictionary is sector-
// specific: each new sector will register its own dictionary alongside.

export const SEMI_TICKER_MAP: Record<string, string> = {
  // US logic + design
  nvidia: "NVDA",
  nvda: "NVDA",
  amd: "AMD",
  "advanced micro devices": "AMD",
  intel: "INTC",
  intc: "INTC",
  broadcom: "AVGO",
  avgo: "AVGO",
  marvell: "MRVL",
  qualcomm: "QCOM",
  qcom: "QCOM",
  arm: "ARM",
  // Foundries
  tsmc: "TSM",
  "taiwan semiconductor": "TSM",
  "samsung foundry": "005930.KS",
  "samsung electronics": "005930.KS",
  smic: "0981.HK",
  globalfoundries: "GFS",
  gf: "GFS",
  umc: "UMC",
  // Memory
  micron: "MU",
  "sk hynix": "000660.KS",
  hynix: "000660.KS",
  // Semicap
  asml: "ASML",
  "applied materials": "AMAT",
  amat: "AMAT",
  "lam research": "LRCX",
  kla: "KLAC",
  klac: "KLAC",
  "tokyo electron": "8035.T",
  tel: "8035.T",
  "asm international": "ASM",
  // Equipment / materials / test
  teradyne: "TER",
  advantest: "6857.T",
  entegris: "ENTG",
  // Hyperscalers (relevant for AI accelerator demand)
  microsoft: "MSFT",
  azure: "MSFT",
  google: "GOOGL",
  alphabet: "GOOGL",
  amazon: "AMZN",
  aws: "AMZN",
  meta: "META",
  oracle: "ORCL",
};

export const SEMI_SORTED_KEYS = Object.keys(SEMI_TICKER_MAP).sort(
  (a, b) => b.length - a.length,
);
