export type GicsLevel = "sector" | "industry_group" | "industry" | "sub_industry";

export interface GicsNode {
  code: string;
  level: GicsLevel;
  name: string;
  parent: string | null;
}

export const GICS_NODES: readonly GicsNode[] = [
  // Sectors (2-digit)
  { code: "10", level: "sector", name: "Energy", parent: null },
  { code: "15", level: "sector", name: "Materials", parent: null },
  { code: "20", level: "sector", name: "Industrials", parent: null },
  { code: "25", level: "sector", name: "Consumer Discretionary", parent: null },
  { code: "30", level: "sector", name: "Consumer Staples", parent: null },
  { code: "35", level: "sector", name: "Health Care", parent: null },
  { code: "40", level: "sector", name: "Financials", parent: null },
  { code: "45", level: "sector", name: "Information Technology", parent: null },
  { code: "50", level: "sector", name: "Communication Services", parent: null },
  { code: "55", level: "sector", name: "Utilities", parent: null },
  { code: "60", level: "sector", name: "Real Estate", parent: null },

  // Industry groups (4-digit)
  { code: "1010", level: "industry_group", name: "Energy", parent: "10" },
  { code: "1510", level: "industry_group", name: "Materials", parent: "15" },
  { code: "2010", level: "industry_group", name: "Capital Goods", parent: "20" },
  { code: "2020", level: "industry_group", name: "Commercial Services", parent: "20" },
  { code: "2030", level: "industry_group", name: "Transportation", parent: "20" },
  { code: "2510", level: "industry_group", name: "Automobiles & Components", parent: "25" },
  { code: "2520", level: "industry_group", name: "Consumer Durables & Apparel", parent: "25" },
  { code: "2530", level: "industry_group", name: "Consumer Services", parent: "25" },
  { code: "2550", level: "industry_group", name: "Consumer Discretionary Distribution & Retail", parent: "25" },
  { code: "3010", level: "industry_group", name: "Consumer Staples Distribution & Retail", parent: "30" },
  { code: "3020", level: "industry_group", name: "Food, Beverage & Tobacco", parent: "30" },
  { code: "3030", level: "industry_group", name: "Household & Personal Products", parent: "30" },
  { code: "3510", level: "industry_group", name: "Health Care Equipment & Services", parent: "35" },
  { code: "3520", level: "industry_group", name: "Pharmaceuticals & Biotech", parent: "35" },
  { code: "4010", level: "industry_group", name: "Banks", parent: "40" },
  { code: "4020", level: "industry_group", name: "Financial Services", parent: "40" },
  { code: "4030", level: "industry_group", name: "Insurance", parent: "40" },
  { code: "4510", level: "industry_group", name: "Software & Services", parent: "45" },
  { code: "4520", level: "industry_group", name: "Tech Hardware & Equipment", parent: "45" },
  { code: "4530", level: "industry_group", name: "Semiconductors & Equipment", parent: "45" },
  { code: "5010", level: "industry_group", name: "Telecom Services", parent: "50" },
  { code: "5020", level: "industry_group", name: "Media & Entertainment", parent: "50" },
  { code: "5510", level: "industry_group", name: "Utilities", parent: "55" },
  { code: "6010", level: "industry_group", name: "Equity REITs", parent: "60" },
  { code: "6020", level: "industry_group", name: "Real Estate Management & Development", parent: "60" },

  // Industries (6-digit)
  { code: "101010", level: "industry", name: "Energy Equipment & Services", parent: "1010" },
  { code: "101020", level: "industry", name: "Oil, Gas & Consumable Fuels", parent: "1010" },
  { code: "151010", level: "industry", name: "Chemicals", parent: "1510" },
  { code: "151040", level: "industry", name: "Metals & Mining", parent: "1510" },
  { code: "201010", level: "industry", name: "Aerospace & Defense", parent: "2010" },
  { code: "201060", level: "industry", name: "Machinery", parent: "2010" },
  { code: "203020", level: "industry", name: "Passenger Airlines", parent: "2030" },
  { code: "251020", level: "industry", name: "Automobiles", parent: "2510" },
  { code: "253020", level: "industry", name: "Diversified Consumer Services", parent: "2530" },
  { code: "301010", level: "industry", name: "Consumer Staples Distribution & Retail", parent: "3010" },
  { code: "302020", level: "industry", name: "Food Products", parent: "3020" },
  { code: "352010", level: "industry", name: "Biotechnology", parent: "3520" },
  { code: "352020", level: "industry", name: "Pharmaceuticals", parent: "3520" },
  { code: "352030", level: "industry", name: "Life Sciences Tools & Services", parent: "3520" },
  { code: "401010", level: "industry", name: "Banks", parent: "4010" },
  { code: "402020", level: "industry", name: "Consumer Finance", parent: "4020" },
  { code: "402030", level: "industry", name: "Capital Markets", parent: "4020" },
  { code: "403010", level: "industry", name: "Insurance", parent: "4030" },
  { code: "451030", level: "industry", name: "Software", parent: "4510" },
  { code: "451020", level: "industry", name: "IT Services", parent: "4510" },
  { code: "452020", level: "industry", name: "Technology Hardware, Storage & Peripherals", parent: "4520" },
  { code: "452030", level: "industry", name: "Electronic Equipment & Components", parent: "4520" },
  { code: "453010", level: "industry", name: "Semiconductors & Equipment", parent: "4530" },
  { code: "501010", level: "industry", name: "Diversified Telecom Services", parent: "5010" },
  { code: "501020", level: "industry", name: "Wireless Telecom Services", parent: "5010" },
  { code: "502020", level: "industry", name: "Entertainment", parent: "5020" },
  { code: "502030", level: "industry", name: "Interactive Media & Services", parent: "5020" },
  { code: "551010", level: "industry", name: "Electric Utilities", parent: "5510" },
  { code: "551020", level: "industry", name: "Gas Utilities", parent: "5510" },
  { code: "601010", level: "industry", name: "Diversified REITs", parent: "6010" },
  { code: "601025", level: "industry", name: "Industrial REITs", parent: "6010" },
  { code: "601030", level: "industry", name: "Hotel & Resort REITs", parent: "6010" },
  { code: "601040", level: "industry", name: "Office REITs", parent: "6010" },
  { code: "601050", level: "industry", name: "Health Care REITs", parent: "6010" },
  { code: "601060", level: "industry", name: "Residential REITs", parent: "6010" },
  { code: "601070", level: "industry", name: "Retail REITs", parent: "6010" },

  // Sub-industries (8-digit)
  { code: "10101010", level: "sub_industry", name: "Oil & Gas Drilling", parent: "101010" },
  { code: "10101020", level: "sub_industry", name: "Oil & Gas Equipment & Services", parent: "101010" },
  { code: "10102010", level: "sub_industry", name: "Integrated Oil & Gas", parent: "101020" },
  { code: "10102020", level: "sub_industry", name: "Oil & Gas Exploration & Production", parent: "101020" },
  { code: "10102030", level: "sub_industry", name: "Oil & Gas Refining & Marketing", parent: "101020" },
  { code: "15101010", level: "sub_industry", name: "Commodity Chemicals", parent: "151010" },
  { code: "15101020", level: "sub_industry", name: "Diversified Chemicals", parent: "151010" },
  { code: "15101030", level: "sub_industry", name: "Fertilizers & Agricultural Chemicals", parent: "151010" },
  { code: "15101040", level: "sub_industry", name: "Industrial Gases", parent: "151010" },
  { code: "15101050", level: "sub_industry", name: "Specialty Chemicals", parent: "151010" },
  { code: "15104010", level: "sub_industry", name: "Aluminum", parent: "151040" },
  { code: "15104020", level: "sub_industry", name: "Diversified Metals & Mining", parent: "151040" },
  { code: "15104050", level: "sub_industry", name: "Gold", parent: "151040" },
  { code: "20101010", level: "sub_industry", name: "Aerospace & Defense", parent: "201010" },
  { code: "20106010", level: "sub_industry", name: "Construction Machinery & Heavy Transport", parent: "201060" },
  { code: "20106020", level: "sub_industry", name: "Agricultural & Farm Machinery", parent: "201060" },
  { code: "20106030", level: "sub_industry", name: "Industrial Machinery & Supplies", parent: "201060" },
  { code: "25102010", level: "sub_industry", name: "Automobile Manufacturers", parent: "251020" },
  { code: "25102020", level: "sub_industry", name: "Motorcycle Manufacturers", parent: "251020" },
  { code: "35201010", level: "sub_industry", name: "Biotechnology", parent: "352010" },
  { code: "35202010", level: "sub_industry", name: "Pharmaceuticals", parent: "352020" },
  { code: "35203010", level: "sub_industry", name: "Life Sciences Tools & Services", parent: "352030" },
  { code: "40101010", level: "sub_industry", name: "Diversified Banks", parent: "401010" },
  { code: "40101015", level: "sub_industry", name: "Regional Banks", parent: "401010" },
  { code: "40203010", level: "sub_industry", name: "Asset Management & Custody Banks", parent: "402030" },
  { code: "40203020", level: "sub_industry", name: "Investment Banking & Brokerage", parent: "402030" },
  { code: "45103010", level: "sub_industry", name: "Application Software", parent: "451030" },
  { code: "45103020", level: "sub_industry", name: "Systems Software", parent: "451030" },
  { code: "45301010", level: "sub_industry", name: "Semiconductor Materials & Equipment", parent: "453010" },
  { code: "45301020", level: "sub_industry", name: "Semiconductors", parent: "453010" },
  { code: "50203010", level: "sub_industry", name: "Interactive Media & Services", parent: "502030" },
  { code: "55101010", level: "sub_industry", name: "Electric Utilities", parent: "551010" },
  { code: "60101010", level: "sub_industry", name: "Diversified REITs", parent: "601010" },
  { code: "60102510", level: "sub_industry", name: "Industrial REITs", parent: "601025" },
  { code: "60105010", level: "sub_industry", name: "Health Care REITs", parent: "601050" },
  { code: "60106010", level: "sub_industry", name: "Multi-Family Residential REITs", parent: "601060" },
  { code: "60106020", level: "sub_industry", name: "Single-Family Residential REITs", parent: "601060" },
  { code: "60107010", level: "sub_industry", name: "Retail REITs", parent: "601070" },
];

const GICS_CODE_SET: ReadonlySet<string> = new Set(GICS_NODES.map((n) => n.code));

export function isValidGicsCode(code: string): boolean {
  return GICS_CODE_SET.has(code);
}

export function gicsLevelFromCode(code: string): GicsLevel | null {
  if (!/^\d+$/.test(code)) return null;
  switch (code.length) {
    case 2:
      return "sector";
    case 4:
      return "industry_group";
    case 6:
      return "industry";
    case 8:
      return "sub_industry";
    default:
      return null;
  }
}

export function gicsAncestors(code: string): string[] {
  const level = gicsLevelFromCode(code);
  if (level === null) return [];
  const result: string[] = [];
  for (const len of [2, 4, 6, 8]) {
    if (len > code.length) break;
    result.push(code.slice(0, len));
  }
  return result;
}
