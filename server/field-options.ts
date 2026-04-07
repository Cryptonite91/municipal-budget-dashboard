/**
 * Controlled vocabulary for Department, Source, and Category fields.
 *
 * SYSTEM DEFAULTS  — seeded once into field_options (municipality_id = null).
 * SYNONYM MAP      — maps common abbreviations/aliases → canonical default value.
 * matchToAllowed() — normalizes an incoming string to the best allowed value.
 */

export type FieldType = "department" | "source" | "dept_category" | "rev_category";

// ── System default values ─────────────────────────────────────────────────────

export const SYSTEM_DEFAULTS: Record<FieldType, string[]> = {
  department: [
    "Administration",
    "Public Safety",
    "Public Works",
    "Education",
    "Parks & Recreation",
    "Social Services",
    "Debt Service",
    "Capital Projects",
    "Other",
  ],
  source: [
    "Property Taxes",
    "State Aid",
    "Federal Aid",
    "Local Option Taxes",
    "Fees & Permits",
    "Service Charges",
    "Grants",
    "Fines & Penalties",
    "Investment Income",
    "Transfers In",
    "Other",
  ],
  dept_category: [
    "Personnel",
    "Benefits",
    "Contracted Services",
    "Professional Services",
    "Supplies",
    "Equipment",
    "Vehicles",
    "Buildings & Grounds",
    "Utilities",
    "Insurance",
    "Debt Service",
    "Capital Outlay",
    "Training & Travel",
    "Technology",
    "Program Costs",
    "Transfers Out",
    "Other",
  ],
  rev_category: [
    "Current Taxes",
    "Delinquent Taxes",
    "Licenses",
    "Permits",
    "Intergovernmental",
    "Charges for Services",
    "Grants",
    "Fines",
    "Interest Income",
    "Reimbursements",
    "Transfers In",
    "Other",
  ],
};

// ── Synonym / alias map ────────────────────────────────────────────────────────
// Keys are lower-cased, punctuation-stripped versions of common raw values.
// Values are the canonical default strings above.
// Broader phrases are listed first so the matcher finds them before single-word keys.

type SynonymMap = Record<string, string>;

export const DEPT_SYNONYMS: SynonymMap = {
  // Public Safety
  "police": "Public Safety",
  "fire": "Public Safety",
  "ems": "Public Safety",
  "emergency services": "Public Safety",
  "emergency management": "Public Safety",
  "law enforcement": "Public Safety",
  "fire & ems": "Public Safety",
  "fire and ems": "Public Safety",
  "police and fire": "Public Safety",
  "fire department": "Public Safety",
  "police department": "Public Safety",
  "public safety": "Public Safety",
  // Public Works
  "public works": "Public Works",
  "highway": "Public Works",
  "roads": "Public Works",
  "dpw": "Public Works",
  "dept of public works": "Public Works",
  "department of public works": "Public Works",
  "streets": "Public Works",
  "street department": "Public Works",
  "road maintenance": "Public Works",
  "highway department": "Public Works",
  // Administration
  "administration": "Administration",
  "admin": "Administration",
  "general government": "Administration",
  "town manager": "Administration",
  "city manager": "Administration",
  "executive": "Administration",
  "finance": "Administration",
  "clerk": "Administration",
  "town clerk": "Administration",
  "town office": "Administration",
  "city hall": "Administration",
  "legal": "Administration",
  "it": "Administration",
  "information technology": "Administration",
  // Education
  "education": "Education",
  "schools": "Education",
  "library": "Education",
  "school district": "Education",
  // Parks & Recreation
  "parks": "Parks & Recreation",
  "recreation": "Parks & Recreation",
  "parks & recreation": "Parks & Recreation",
  "parks and recreation": "Parks & Recreation",
  "parks recreation": "Parks & Recreation",
  "community center": "Parks & Recreation",
  // Social Services
  "social services": "Social Services",
  "health": "Social Services",
  "human services": "Social Services",
  "welfare": "Social Services",
  "senior services": "Social Services",
  // Debt Service
  "debt service": "Debt Service",
  "debt": "Debt Service",
  "bond": "Debt Service",
  "principal": "Debt Service",
  "interest": "Debt Service",
  // Capital Projects
  "capital projects": "Capital Projects",
  "capital": "Capital Projects",
  "capital improvement": "Capital Projects",
  "capital improvements": "Capital Projects",
  "capital outlay dept": "Capital Projects",
};

export const SOURCE_SYNONYMS: SynonymMap = {
  // Property Taxes
  "property taxes": "Property Taxes",
  "property tax": "Property Taxes",
  "real estate taxes": "Property Taxes",
  "real property taxes": "Property Taxes",
  "tax levy": "Property Taxes",
  "general fund taxes": "Property Taxes",
  // State Aid
  "state aid": "State Aid",
  "state grants": "State Aid",
  "state revenue": "State Aid",
  "state reimbursements": "State Aid",
  "state shared revenue": "State Aid",
  "act 60": "State Aid",
  "education aid": "State Aid",
  // Federal Aid
  "federal aid": "Federal Aid",
  "federal grants": "Federal Aid",
  "federal revenue": "Federal Aid",
  "arpa": "Federal Aid",
  "cdbg": "Federal Aid",
  // Local Option Taxes
  "local option taxes": "Local Option Taxes",
  "meals tax": "Local Option Taxes",
  "rooms tax": "Local Option Taxes",
  "sales tax": "Local Option Taxes",
  // Fees & Permits
  "fees & permits": "Fees & Permits",
  "fees and permits": "Fees & Permits",
  "permits": "Fees & Permits",
  "licenses": "Fees & Permits",
  "licenses & permits": "Fees & Permits",
  "licenses and permits": "Fees & Permits",
  "building permits": "Fees & Permits",
  "permit fees": "Fees & Permits",
  // Service Charges
  "service charges": "Service Charges",
  "charges for services": "Service Charges",
  "user fees": "Service Charges",
  "recreation fees": "Service Charges",
  "garbage fees": "Service Charges",
  "sewer charges": "Service Charges",
  "water fees": "Service Charges",
  // Grants
  "grants": "Grants",
  "grant revenue": "Grants",
  // Fines & Penalties
  "fines & penalties": "Fines & Penalties",
  "fines and penalties": "Fines & Penalties",
  "fines": "Fines & Penalties",
  "penalties": "Fines & Penalties",
  "traffic fines": "Fines & Penalties",
  // Investment Income
  "investment income": "Investment Income",
  "interest income": "Investment Income",
  "interest earnings": "Investment Income",
  "interest on investments": "Investment Income",
  "investment earnings": "Investment Income",
  // Transfers In
  "transfers in": "Transfers In",
  "transfers": "Transfers In",
  "interfund transfers": "Transfers In",
};

export const DEPT_CAT_SYNONYMS: SynonymMap = {
  // Personnel
  "personnel": "Personnel",
  "salaries": "Personnel",
  "wages": "Personnel",
  "full time salaries": "Personnel",
  "part time wages": "Personnel",
  "overtime": "Personnel",
  "payroll": "Personnel",
  "salaries & wages": "Personnel",
  "salaries and wages": "Personnel",
  "salary": "Personnel",
  // Benefits
  "benefits": "Benefits",
  "fringe benefits": "Benefits",
  "fringe": "Benefits",
  "health insurance": "Benefits",
  "retirement": "Benefits",
  "fica": "Benefits",
  "social security": "Benefits",
  "pension": "Benefits",
  // Contracted Services
  "contracted services": "Contracted Services",
  "contract services": "Contracted Services",
  "contracts": "Contracted Services",
  "outside services": "Contracted Services",
  // Professional Services
  "professional services": "Professional Services",
  "legal services": "Professional Services",
  "engineering": "Professional Services",
  "audit": "Professional Services",
  "consulting": "Professional Services",
  "accounting": "Professional Services",
  // Supplies
  "supplies": "Supplies",
  "office supplies": "Supplies",
  "operating supplies": "Supplies",
  "materials": "Supplies",
  "materials & supplies": "Supplies",
  "materials and supplies": "Supplies",
  // Equipment
  "equipment": "Equipment",
  "equipment purchase": "Equipment",
  "small equipment": "Equipment",
  "tools": "Equipment",
  // Vehicles
  "vehicles": "Vehicles",
  "vehicle purchase": "Vehicles",
  "fleet": "Vehicles",
  "auto": "Vehicles",
  // Buildings & Grounds
  "buildings & grounds": "Buildings & Grounds",
  "buildings and grounds": "Buildings & Grounds",
  "maintenance": "Buildings & Grounds",
  "facility maintenance": "Buildings & Grounds",
  "grounds maintenance": "Buildings & Grounds",
  "building maintenance": "Buildings & Grounds",
  // Utilities
  "utilities": "Utilities",
  "electricity": "Utilities",
  "gas": "Utilities",
  "water": "Utilities",
  "sewer": "Utilities",
  "heat": "Utilities",
  "fuel": "Utilities",
  // Insurance
  "insurance": "Insurance",
  "liability insurance": "Insurance",
  "property insurance": "Insurance",
  "workers comp": "Insurance",
  "workers compensation": "Insurance",
  // Debt Service
  "debt service": "Debt Service",
  "principal": "Debt Service",
  "interest": "Debt Service",
  "bond payments": "Debt Service",
  "debt payments": "Debt Service",
  // Capital Outlay
  "capital outlay": "Capital Outlay",
  "capital expenditures": "Capital Outlay",
  "capital improvements": "Capital Outlay",
  "capital purchases": "Capital Outlay",
  // Training & Travel
  "training & travel": "Training & Travel",
  "training and travel": "Training & Travel",
  "training": "Training & Travel",
  "travel": "Training & Travel",
  "conferences": "Training & Travel",
  "professional development": "Training & Travel",
  // Technology
  "technology": "Technology",
  "software": "Technology",
  "computers": "Technology",
  "it services": "Technology",
  "telecommunications": "Technology",
  // Program Costs
  "program costs": "Program Costs",
  "program expenses": "Program Costs",
  "program": "Program Costs",
  // Transfers Out
  "transfers out": "Transfers Out",
  "transfers": "Transfers Out",
  "interfund transfers": "Transfers Out",
};

export const REV_CAT_SYNONYMS: SynonymMap = {
  // Current Taxes
  "current taxes": "Current Taxes",
  "current year taxes": "Current Taxes",
  "property taxes": "Current Taxes",
  "real property taxes": "Current Taxes",
  // Delinquent Taxes
  "delinquent taxes": "Delinquent Taxes",
  "back taxes": "Delinquent Taxes",
  "prior year taxes": "Delinquent Taxes",
  "overdue taxes": "Delinquent Taxes",
  // Licenses
  "licenses": "Licenses",
  "business licenses": "Licenses",
  "liquor licenses": "Licenses",
  // Permits
  "permits": "Permits",
  "building permits": "Permits",
  "permit fees": "Permits",
  "zoning fees": "Permits",
  // Intergovernmental
  "intergovernmental": "Intergovernmental",
  "state aid": "Intergovernmental",
  "federal aid": "Intergovernmental",
  "state grants": "Intergovernmental",
  "federal grants": "Intergovernmental",
  "shared revenue": "Intergovernmental",
  "act 60": "Intergovernmental",
  // Charges for Services
  "charges for services": "Charges for Services",
  "service charges": "Charges for Services",
  "user fees": "Charges for Services",
  "recreation fees": "Charges for Services",
  "garbage fees": "Charges for Services",
  "sewer charges": "Charges for Services",
  // Grants
  "grants": "Grants",
  "grant revenue": "Grants",
  // Fines
  "fines": "Fines",
  "fines & penalties": "Fines",
  "fines and penalties": "Fines",
  "penalties": "Fines",
  // Interest Income
  "interest income": "Interest Income",
  "investment income": "Interest Income",
  "interest earnings": "Interest Income",
  // Reimbursements
  "reimbursements": "Reimbursements",
  "insurance reimbursements": "Reimbursements",
  "refunds": "Reimbursements",
  // Transfers In
  "transfers in": "Transfers In",
  "interfund transfers": "Transfers In",
  "transfers": "Transfers In",
};

const SYNONYM_MAP_BY_TYPE: Record<FieldType, SynonymMap> = {
  department:    DEPT_SYNONYMS,
  source:        SOURCE_SYNONYMS,
  dept_category: DEPT_CAT_SYNONYMS,
  rev_category:  REV_CAT_SYNONYMS,
};

// ── Normalization helpers ──────────────────────────────────────────────────────

/** Strip punctuation, collapse whitespace, lowercase. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match an incoming raw value to an allowed value.
 *
 * Resolution order:
 * 1. Exact match (case-insensitive) against allowed list.
 * 2. Synonym map lookup.
 * 3. Allowed-list substring containment (both directions).
 * 4. Falls back to the raw value (custom option — caller should persist it).
 *
 * Returns { matched: string; isNew: boolean }
 *   isNew=true  → not in allowed list; caller should create a custom option
 *   isNew=false → matched an existing allowed value
 */
export function matchToAllowed(
  raw: string,
  allowed: string[],
  fieldType: FieldType,
): { matched: string; isNew: boolean } {
  const cleaned = raw.trim();
  if (!cleaned) return { matched: "Other", isNew: false };

  const lowCleaned = normalize(cleaned);

  // 1. Exact match (case-insensitive)
  const exact = allowed.find(a => normalize(a) === lowCleaned);
  if (exact) return { matched: exact, isNew: false };

  // 2. Synonym map
  const synonymMap = SYNONYM_MAP_BY_TYPE[fieldType];
  const synonym = synonymMap[lowCleaned];
  if (synonym && allowed.includes(synonym)) return { matched: synonym, isNew: false };

  // 2b. Partial synonym key match (the raw value contains a synonym key)
  for (const [key, target] of Object.entries(synonymMap)) {
    if (lowCleaned.includes(key) && allowed.includes(target)) {
      return { matched: target, isNew: false };
    }
  }

  // 3. Substring containment — allowed value is substring of raw, or vice versa
  for (const a of allowed) {
    const lowA = normalize(a);
    if (lowA === "other") continue; // don't match "other" via substring
    if (lowCleaned.includes(lowA) || lowA.includes(lowCleaned)) {
      return { matched: a, isNew: false };
    }
  }

  // 4. No match — raw value should be preserved as a custom option
  // Normalize casing: title-case the raw value
  const titleCased = cleaned
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  return { matched: titleCased, isNew: true };
}
