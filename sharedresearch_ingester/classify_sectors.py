"""One-shot script: classify sector from description and UPDATE company_financials.sector.

Run from the project root:
    python sharedresearch_ingester/classify_sectors.py [--db PATH] [--dry-run]
"""

import argparse
import re
import sqlite3
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Sector taxonomy — ordered by priority (first match wins).
# Keys are canonical sector names; values are lists of regexes (case-insensitive).
# ---------------------------------------------------------------------------
RULES: list[tuple[str, list[str]]] = [
    ("Cryptocurrency / Digital Assets", [
        r"\bbitcoin\b", r"\bcrypto\b", r"\bblockchain\b", r"\bdigital asset",
        r"\btreasury\s+company\b",
    ]),
    ("Biotechnology", [
        r"\bbiotechnology\b", r"\bbiotech\b", r"\bregenerat\w+\s+medicine",
        r"\bcell\s+therap", r"\bgene\s+therap", r"\bdrug\s+candidate",
        r"\bpharmaceutical\b.*\bR&D\b", r"\bclinical\s+trial",
        r"\bself-assembling\s+peptide", r"\bon-orbit\s+service",
    ]),
    ("Pharmaceuticals", [
        r"\bpharmaceutical\b", r"\bdrug\b.*\bmanufactur", r"\bmedicine\b.*\bmanufactur",
        r"\bgeneric\s+drug", r"\bover-the-counter\b",
        r"\bdental\s+material", r"\bdental\s+product",
    ]),
    ("Medical Devices / Life Sciences", [
        r"\bmedical\s+(device|equipment|instrument|technology|technolog)",
        r"\bdiagnost\w+\s+(kit|system|equipment|reagent)",
        r"\bin\s+vitro\b", r"\bautomated\s+systems?\s+for\s+testing\s+(gene|protein)",
        r"\bsurgical\b", r"\bendoscop\b",
        r"\bgenes?,\s+proteins?\b", r"\bmicroalga\b",
    ]),
    ("Cybersecurity", [
        r"\bcyber\s*security\b", r"\bweb\s+application\s+firewall",
        r"\binformation\s+security\b", r"\bsecurity\s+(software|solution|service)",
    ]),
    ("Healthcare IT", [
        r"\bmedical\s+(platform|system|IT|software|cloud|data)",
        r"\bhospital\s+(system|management)", r"\belectronic\s+medical\s+record",
        r"\bhealth(care)?\s+(IT|cloud|platform|data|management)",
        r"\blong-term\s+care\b.*\bcloud\b", r"\bnursing\s+care\b.*\bcloud\b",
        r"\bhealthcare\s+tech\b", r"\bweb\s+marketing\b.*\bclinic\b",
    ]),
    ("Healthcare / Long-term Care", [
        r"\blong-term\s+care\b", r"\bnursing\s+care\b",
        r"\bassisted.living\b", r"\bsenior\s+care\b",
        r"\bcare\s+(facility|home|service|corporation)\b",
        r"\bhealthcare\s+service", r"\bmedical\s+institution",
        r"\bfuneral\s+service", r"\bfuneral\s+hall", r"\bmemorial\s+service",
    ]),
    ("Semiconductors / Electronic Components", [
        r"\bsemiconductor\b", r"\bsilicon\s+wafer\b", r"\bchip\b.*\bdesign",
        r"\belectronic\s+component", r"\bdevice\s+programmer\b",
        r"\bmemory\s+module\b", r"\bintegrated\s+circuit\b",
    ]),
    ("Technology / IT Services", [
        r"\bsystems?\s+integrat", r"\bIT\s+solution", r"\bcloud\s+service",
        r"\bSaaS\b", r"\bsoftware\s+develop", r"\bdigital\s+transform",
        r"\bdata\s+analytic", r"\bartificial\s+intelligence\b",
        r"\bAI\b.*\b(platform|solution|service|product|inside|integrat)",
        r"\bmachine\s+learning\b", r"\bdeep\s+learning\b",
        r"\benterprise\s+software", r"\bERP\b", r"\bBI\s+tool",
        r"\bsystem\s+develop", r"\binfrastructure.*\bmanage",
        r"\bpackaged\s+software", r"\bconsolidated\s+accounting\s+system",
        r"\bDX\s+solution", r"\bdigital\s+(solution|platform)",
        r"\baccounting\s+(software|service)\b", r"\bIT.related\s+equipment\b",
        r"\bweb\s+hosting\b", r"\bcloud\s+integrat\b",
        r"\bIT\s+securit\b.*\b(product|service)\b",
        r"\bauthentication\s+solution\b", r"\belectronic\s+data\s+interchange\b",
        r"\bgraphics\s+technolog\b", r"\bIT\s+compan\b",
        r"\bforms?\s+(management|software)\b.*\binvoice\b",
        r"\bmanage\b.*\bforms?\b.*\binvoice\b",
        r"\bB2B\b.*\b(platform|transact)\b",
        r"\bcontent\s+platform\b", r"\bcreator\s+platform\b",
    ]),
    ("Telecommunications", [
        r"\btelecommunication\b", r"\bWi-Fi\s+routers?\b",
        r"\bmobile\s+(carrier|operator|service\s+provider|phone\s+distributor)",
        r"\bbroadband\b", r"\binternet\s+service\s+provider\b",
        r"\btelecommunications\s+(operator|service|network|company)\b",
        r"\btelecom\b", r"\bfiber.optic\s+access\b", r"\bcellular\s+telephone\b",
        r"\bmobile\s+phone\s+(distributor|dealer|shop)\b",
        r"\bSoftBank\s+Mobile\b", r"\bKDDI\b", r"\bprovides\s+telecommunications\b",
    ]),
    ("Electronic Equipment / Testing", [
        r"\btesting\s+equipment\b", r"\bmeasurement\s+equipment\b",
        r"\btest\s+(and|&)\s+measurement\b",
        r"\bmobile\s+communication.*\btest", r"\bnetwork\s+test",
        r"\bfire\s+alarm\b", r"\bfire\s+extinguish",
    ]),
    ("Chemicals", [
        r"\bchemical(s)?\s+manufacturer", r"\bmanufactures\b.*\bchemicals?\b",
        r"\bcaustic\s+soda\b", r"\bacrylic\s+acid\b",
        r"\bpetrochemical\b", r"\bsynthetic\s+resin\b",
        r"\binorganic\s+chemical", r"\borganic\s+chemical",
        r"\badhesive\b", r"\binstant\s+glue\b", r"\bspecialty\s+chemical",
        r"\bprinting\s+ink\b", r"\borganic\s+pigment", r"\bPPS\s+compound",
        r"\bferroalloys?\b", r"\bnonferrous\s+metal",
        r"\bmarine\s+paint\b", r"\bflavor\b.*\bfragrance",
        r"\bfragrance\s+manufacturer", r"\bhousing\s+material",
    ]),
    ("Food & Beverages", [
        r"\bseasonings?\b", r"\bfrozen\s+food\b", r"\bprocessed\s+food\b",
        r"\bfood\s+product", r"\bbeverage\b", r"\bdrink\b.*\bmanufactur",
        r"\bfood\s+manufacturer", r"\bfood\s+distributor",
        r"\bdairy\b", r"\bmilk\b.*\bproduct", r"\bdonut\b", r"\bcoffee\b.*\bchain",
        r"\bmushroom\b", r"\bconfectionery\b", r"\bmineral\s+water\b",
        r"\brice\s+cracker", r"\bsnack\b.*\bmanufactur",
        r"\bseaweed\s+product", r"\bvitamin\b.*\bmanufactur",
    ]),
    ("Apparel / Fashion", [
        r"\bapparel\b", r"\bclothing\b", r"\bfashion\b", r"\bselect\s+shop",
        r"\bgarment\b",
    ]),
    ("Retail", [
        r"\bdepartment\s+stores?\b", r"\bsupermarket\b", r"\bconvenience\s+store\b",
        r"\bshopping\s+(center|mall|complex)", r"\bretail\s+(chain|store|operation)",
        r"\bsecondhand\b", r"\bused\s+(goods|product)",
        r"\bec\s+site\b", r"\be-commerce\b",
        r"\bdrugstore\b", r"\bpharmacy\s+chain\b",
        r"\bsporting\s+goods\s+retailer\b", r"\bhome\s+improvement\s+store\b",
        r"\bdiscount\s+stores?\b", r"\b100.yen\s+stores?\b", r"\bflat\s+price\b.*\bstore\b",
        r"\beyewear\b", r"\bsmartphone\s+accessories\b",
    ]),
    ("Automotive", [
        r"\bautomotiv\b", r"\bcar\s+(dealer|distribution|manufactur)",
        r"\bused\s+(car|motorcycle)\b", r"\bauto\s+(part|dealer|manufactur|service)",
        r"\bvehicle\b.*\bdistrib", r"\bautomotive\s+part",
        r"\bmotor\b.*\bmanufactur", r"\bmotorcycle\s+part",
    ]),
    ("Amusement / Entertainment", [
        r"\bamusement\b", r"\barcade\b", r"\bgame\s+(center|facility|machine)",
        r"\bplayground\s+facilit", r"\bentertainment\s+facilit",
        r"\bpachinko\b", r"\bpachislot\b", r"\bkaraoke\b",
    ]),
    ("Hospitality / Travel", [
        r"\bhospitatl", r"\bhotel\b", r"\bresort\b", r"\btravel\s+agenc",
        r"\bonline\s+travel\b", r"\btourism\b", r"\baccommodat",
        r"\bmembers.only\s+hotel", r"\btravel\s+platform",
    ]),
    ("Media / Advertising / Marketing", [
        r"\badvertis\w+\s+(compan|agency|platform|service)",
        r"\bdigital\s+marketing\b", r"\bmarketing\s+support",
        r"\bperformance.based\b.*\bmarketing", r"\bmarketing\s+data\b",
        r"\bonline\s+advertis", r"\bmedia\s+compan",
        r"\bpublish\w+\b.*\bcompan", r"\bnews\b.*\bcompan",
        r"\bcontract\s+bidding\s+information\b",
        r"\bDX\s+solutions\b.*\bmarketing\b",
        r"\bticket\s+distribution\b", r"\blive\s+event\s+planning\b",
        r"\bentertainment\s+compan\b",
        r"\bcharacter\b.*\bcreates?\b", r"\bcreates?\b.*\bcharacter",
    ]),
    ("Education", [
        r"\beducation\s+(service|platform|business|institution)",
        r"\be-learning\b", r"\bonline\s+educat", r"\bcram\s+school",
        r"\btutor\b", r"\blearning\s+service",
    ]),
    ("Real Estate", [
        r"\breal\s+estate\b", r"\bproperty\s+(develop|manage|invest)",
        r"\bcondominium\b", r"\bleasing\b.*\breal\s+estate",
        r"\bREIT\b",
    ]),
    ("Construction / Engineering", [
        r"\bconstruction\s+compan", r"\bcivil\s+engineering\b",
        r"\bbuilding\s+(construction|contractor)", r"\bgeneral\s+contractor",
        r"\bHVAC\b", r"\bheating,\s+ventilation\s+and\s+air\s+conditioning\b",
        r"\bplumbing\s+construction\b", r"\binstrumentation\s+work\b",
        r"\bair\s+conditioning.*\binstallation\b", r"\bscaffolding\b",
    ]),
    ("Printing / Packaging", [
        r"\bprinting\s+compan", r"\bprint\w+\s+and\s+packag",
        r"\bpackaging\s+manufacturer", r"\bpackag\w+\b.*\bprod",
        r"\bpaper\s+manufactur", r"\bprinting\s+presses?\b",
        r"\bgravure\s+printing\b", r"\boffset\s+printing\b",
    ]),
    ("Banking / Insurance", [
        r"\bregional\s+bank\b", r"\bcommercial\s+bank\b", r"\bbank\b.*\bheadquartered",
        r"\binsurance\s+compan", r"\blife\s+insurance\b", r"\bnon-life\s+insurance\b",
        r"\bconsumer\s+credit\b", r"\bcredit\s+card\b", r"\binstalment\b",
        r"\bdeferred\s+payment\b", r"\bpet\s+insurance\b",
    ]),
    ("Financial Services", [
        r"\bprivate\s+equity\b", r"\binvestment\s+(fund|firm|company|bank)",
        r"\bfinancial\s+(service|instrument)", r"\boperating\s+lease\b",
        r"\bsecurit(ies|y)\s+(broker|firm|compan)",
        r"\basset\s+management\b", r"\bventure\s+capital\b",
        r"\bfintech\b", r"\bM&A\b.*\b(intermediat|advisor)\b",
        r"\bonline\s+stock\s+trading\b", r"\bbrokerage\b",
    ]),
    ("Human Resources / Staffing", [
        r"\bstaffing\b", r"\btemporary\s+staff", r"\bworker\s+dispatch",
        r"\bhuman\s+resource", r"\bjob\s+placement\b",
        r"\brecruitment\b", r"\boutsouring\b.*\blabor\b",
        r"\bpaid\s+job\s+placement\b",
    ]),
    ("BPO / Professional Services", [
        r"\bbusiness\s+process\s+outsourc", r"\bBPO\b",
        r"\bbusiness\s+consulting\b", r"\bconsulting\b.*\bstrateg",
        r"\bbusiness\s+producing\b", r"\bnew\s+business\s+creat",
        r"\bmanagement\s+consulting\b", r"\bconsulting\s+firm\b",
        r"\blargest.*\bconsulting\b",
    ]),
    ("Trading Company", [
        r"\btrading\s+compan", r"\bwholesale\b.*\bchemical",
        r"\bimport(er)?\b.*\bexport(er)?\b",
        r"\bgeneral\s+trading\b", r"\bnonferrous\s+metals\b.*\btrading",
        r"\benergy\s+trading\b",
    ]),
    ("Industrial Machinery / Equipment", [
        r"\bmachinery\b", r"\bmanufactur.*\bequipment\b",
        r"\bindustrial\s+equipment\b", r"\bmachine\s+tool\b",
        r"\bautomated\s+(liquid handling|dispensing|pipetting)\b",
        r"\bspecial.purpose\s+vehicle\b", r"\bfine\s+powder\s+processing\b",
        r"\bautomating\s+manufacturing\s+process\b",
        r"\bmeasurement\s+and\s+control\b.*\btechnolog",
    ]),
    ("Energy / Utilities", [
        r"\benergy\s+(compan|service|solution|trading)",
        r"\brenewable\s+energy\b", r"\bsolar\b", r"\bwind\s+power\b",
        r"\belectric\s+utility\b", r"\bLP\s+gas\b", r"\bpetroleum\s+product",
        r"\bkerosene\b", r"\bgasoline\b.*\bdistrib",
        r"\bpower\s+producer\b", r"\bbulk\s+power\s+supply\b",
        r"\bpower\s+supplier\b",
    ]),
    ("Waste Management / Recycling", [
        r"\bindustrial\s+waste\b", r"\bwaste\s+(treatment|management|processing)",
        r"\brecycling\s+(compan|business)\b", r"\benvironmental\s+service",
        r"\bnon.ferrous\s+metal\b.*\brecycl", r"\bmetal\s+scrap\b.*\brecycl",
    ]),
    ("Logistics / Transportation", [
        r"\blogistic\b", r"\btransportation\b", r"\bshipping\s+compan",
        r"\bfreight\b", r"\bcourier\b", r"\b3PL\b", r"\bthird.party\s+logistics\b",
    ]),
    ("Aerospace / Space", [
        r"\baerospace\b", r"\bsatellite\b", r"\bspace\s+(technology|company|service)",
        r"\bon-orbit\b", r"\borbital\s+service",
    ]),
    ("Agriculture / Agrochemicals", [
        r"\bagrochemical\b", r"\bherbicide\b", r"\bpesticide\b", r"\bfungicide\b",
        r"\bagriculture\b", r"\bhorticultur\b", r"\bfarm\b.*\bproduct",
        r"\bmushroom\b.*\bproduct", r"\bR&D.*\bproduction.*\bsales\b.*\bmushroom\b",
        r"\bAgriTechno\b", r"\bagrochemical\s+active\s+ingredient\b",
    ]),
    ("Water Treatment / Environment", [
        r"\bwater\s+treatment\b", r"\bwastewater\b", r"\bwater\s+purif",
        r"\benvironmental\b.*\bbusiness", r"\bbiomass\b", r"\bwaste\s+wood\b",
        r"\bscaffolding\b.*\brental\b",
    ]),
    ("Consumer Products", [
        r"\bbaby\s+product", r"\bnursing\s+bottle", r"\bwriting\s+instrument",
        r"\bstationery\b", r"\boffice\s+furniture\b", r"\bhousehold\s+insecticide",
        r"\bbath\s+salt", r"\bhair\s+care\b", r"\bcosmetic\b.*\bsalon",
        r"\btoiletri", r"\bskincare\b.*\binfant",
    ]),
    ("Food Services / Restaurants", [
        r"\bramen\b", r"\bfood\s+service\s+compan", r"\brestaurant\s+chain",
        r"\bfood\s+delivery\b", r"\bfood\s+(delivery|portal)\b", r"\bdonut\s+chain\b",
        r"\bchinese\s+dish", r"\bdining\b.*\bchain",
    ]),
    ("Personal Services", [
        r"\bhaircut\b.*\bsalon", r"\bbridal\b", r"\bwedding\s+ceremony\b",
        r"\bphoto\s+wedding\b", r"\bfuneral\s+service\b", r"\bkaraoke\b",
        r"\bchildcare\b.*\bservice", r"\belderly\s+care\b.*\bservice",
    ]),
    ("Electronic Materials", [
        r"\bflexible\s+printed\s+circuit\b", r"\bFPC\b",
        r"\belectronic\s+material", r"\boptical\s+disc\b",
        r"\bsurface\s+treatment\b", r"\bcarbon\s+product",
        r"\bisotropic\s+graphite\b",
    ]),
    ("Industrial Materials / Metals", [
        r"\bpower\s+transmission\b.*\bbelts?\b", r"\bconveyor\s+belts?\b",
        r"\bnon.ferrous\s+metal\b", r"\bmetal\s+scrap\b",
        r"\bsteel\s+material\b", r"\bmold\b.*\bmanufactur",
        r"\bejector\s+pin", r"\bcarbide\b.*\bend\s+mill",
        r"\bstructural\s+steel\b", r"\binterior\s+material\b.*\bautomobile",
        r"\bauomobile.*\binterior\s+material",
    ]),
    ("Leasing / Rental Services", [
        r"\bleasing\s+compan", r"\bvendor\s+leasing\b",
        r"\boperating\s+lease\b.*\baircraft", r"\bstorage\s+space\b.*\brental\b",
        r"\bself-storage\b", r"\bscaffolding\s+rental\b",
    ]),
    ("Character IP / Licensing", [
        r"\bcharacter\s+(licensing|IP|merchandise|brand)",
        r"\blicensing\b.*\bcharacter", r"\bcharacter\s+goods\b",
    ]),
    ("Online Platform / Marketplace", [
        r"\bB2B\s+platform\b", r"\bonline\s+platform\b.*\b(market|trading|exchange)\b",
        r"\be-commerce\s+platform\b", r"\bmarketplace\b.*\bonline\b",
        r"\bEDI\s+software\b", r"\bdigital.*\btransaction\b.*\bplatform\b",
    ]),
    ("Conglomerate / Holding Company", [
        r"\bconglomerate\b", r"\bdiversified\s+(business|holding|group)",
        r"\bpure\s+holding\s+company\b.*\bdivers",
    ]),
]

_COMPILED: list[tuple[str, list[re.Pattern]]] = [
    (sector, [re.compile(pat, re.IGNORECASE) for pat in pats])
    for sector, pats in RULES
]


def classify(description: str) -> str | None:
    if not description:
        return None
    for sector, patterns in _COMPILED:
        for pat in patterns:
            if pat.search(description):
                return sector
    return "Other"


def run(db_path: str, dry_run: bool) -> None:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        "SELECT ticker, description FROM company_financials WHERE description IS NOT NULL"
    ).fetchall()

    updates: list[tuple[str, str]] = []
    no_match: list[str] = []

    for row in rows:
        sector = classify(row["description"])
        if sector:
            updates.append((sector, row["ticker"]))
        else:
            no_match.append(row["ticker"])

    # Tally
    from collections import Counter
    counts = Counter(s for s, _ in updates)
    print(f"Classified {len(updates)}/{len(rows)} rows:")
    for sector, n in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {n:3d}  {sector}")
    if no_match:
        print(f"\n  {len(no_match)} rows without a description (skipped)")

    if dry_run:
        print("\n[dry-run] No changes written.")
        conn.close()
        return

    conn.execute("BEGIN")
    for sector, ticker in updates:
        conn.execute(
            "UPDATE company_financials SET sector=? WHERE ticker=?",
            (sector, ticker),
        )
    conn.commit()
    print(f"\nWrote {len(updates)} sector values.")
    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    default_db = str(Path(__file__).parent / "data" / "sr.db")
    parser.add_argument("--db", default=default_db)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run(args.db, args.dry_run)
