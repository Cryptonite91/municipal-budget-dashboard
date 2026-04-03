import { db } from "./storage";
import {
  municipalities, revenueSources, departmentBudgets, capitalProjects,
} from "@shared/schema";
import bcrypt from "bcryptjs";

export function seedDatabase() {
  // Check if already seeded
  const existing = db.select().from(municipalities).get();
  if (existing) return;

  const passwordHash = bcrypt.hashSync("maplewood", 10);
  const passwordHash2 = bcrypt.hashSync("riverdale", 10);

  // ── Tenant 1: Maplewood, VT ─────────────────────────────────────────────────
  const maplewood = db.insert(municipalities).values({
    slug: "maplewood-vt",
    name: "Maplewood",
    state: "Vermont",
    population: 28500,
    fiscalYear: "FY2026",
    contactEmail: "finance@maplewoodvt.gov",
    contactPhone: "(802) 555-0142",
    website: "https://maplewoodvt.gov",
    lastUpdated: "2026-03-28T14:30:00Z",
    adminPasswordHash: passwordHash,
    revenuePublished: true,
    departmentsPublished: true,
    projectsPublished: true,
    onboardingComplete: true,
  }).returning().get();

  // ── Tenant 2: Riverdale, NH (second demo) ────────────────────────────────────
  const riverdale = db.insert(municipalities).values({
    slug: "riverdale-nh",
    name: "Riverdale",
    state: "New Hampshire",
    population: 12800,
    fiscalYear: "FY2026",
    contactEmail: "finance@riverdale-nh.gov",
    contactPhone: "(603) 555-0201",
    website: "https://riverdale-nh.gov",
    lastUpdated: "2026-03-15T10:00:00Z",
    adminPasswordHash: passwordHash2,
    revenuePublished: true,
    departmentsPublished: true,
    projectsPublished: false,
    onboardingComplete: true,
  }).returning().get();

  // ── Revenue: Maplewood FY2026 ──────────────────────────────────────────────
  const mapleRev26 = [
    { source: "Residential Property Tax", category: "Property Taxes", budgetedAmount: 18200000, collectedAmount: 17890000 },
    { source: "Commercial Property Tax", category: "Property Taxes", budgetedAmount: 6800000, collectedAmount: 6650000 },
    { source: "Education Fund Grant", category: "State Aid", budgetedAmount: 8400000, collectedAmount: 8400000 },
    { source: "Highway Fund Allocation", category: "State Aid", budgetedAmount: 2100000, collectedAmount: 2050000 },
    { source: "Municipal Aid", category: "State Aid", budgetedAmount: 1500000, collectedAmount: 1500000 },
    { source: "Building Permits & Fees", category: "Fees", budgetedAmount: 1200000, collectedAmount: 1150000 },
    { source: "Recreation Program Fees", category: "Fees", budgetedAmount: 650000, collectedAmount: 620000 },
    { source: "Licensing & Registration", category: "Fees", budgetedAmount: 480000, collectedAmount: 465000 },
    { source: "Federal ARPA Funds", category: "Grants", budgetedAmount: 1800000, collectedAmount: 1800000 },
    { source: "Clean Water State Grant", category: "Grants", budgetedAmount: 950000, collectedAmount: 750000 },
    { source: "Community Development Block Grant", category: "Grants", budgetedAmount: 600000, collectedAmount: 450000 },
    { source: "Investment Income", category: "Other", budgetedAmount: 320000, collectedAmount: 385000 },
    { source: "Fines & Penalties", category: "Other", budgetedAmount: 180000, collectedAmount: 165000 },
    { source: "Miscellaneous Revenue", category: "Other", budgetedAmount: 120000, collectedAmount: 95000 },
  ];
  const mapleRev25 = [
    { source: "Residential Property Tax", category: "Property Taxes", budgetedAmount: 17500000, collectedAmount: 17350000 },
    { source: "Commercial Property Tax", category: "Property Taxes", budgetedAmount: 6500000, collectedAmount: 6420000 },
    { source: "Education Fund Grant", category: "State Aid", budgetedAmount: 8100000, collectedAmount: 8100000 },
    { source: "Highway Fund Allocation", category: "State Aid", budgetedAmount: 2000000, collectedAmount: 1980000 },
    { source: "Municipal Aid", category: "State Aid", budgetedAmount: 1400000, collectedAmount: 1400000 },
    { source: "Building Permits & Fees", category: "Fees", budgetedAmount: 1100000, collectedAmount: 1050000 },
    { source: "Recreation Program Fees", category: "Fees", budgetedAmount: 600000, collectedAmount: 580000 },
    { source: "Licensing & Registration", category: "Fees", budgetedAmount: 450000, collectedAmount: 440000 },
    { source: "Federal ARPA Funds", category: "Grants", budgetedAmount: 2200000, collectedAmount: 2200000 },
    { source: "Clean Water State Grant", category: "Grants", budgetedAmount: 800000, collectedAmount: 800000 },
    { source: "Investment Income", category: "Other", budgetedAmount: 280000, collectedAmount: 310000 },
    { source: "Fines & Penalties", category: "Other", budgetedAmount: 170000, collectedAmount: 155000 },
  ];

  for (const r of mapleRev26) db.insert(revenueSources).values({ ...r, municipalityId: maplewood.id, year: "FY2026" }).run();
  for (const r of mapleRev25) db.insert(revenueSources).values({ ...r, municipalityId: maplewood.id, year: "FY2025" }).run();

  // ── Departments: Maplewood FY2026 + FY2025 ─────────────────────────────────
  const mapleDept26 = [
    { department: "Public Safety", category: "Police Department", budgetedAmount: 5200000, spentAmount: 4680000 },
    { department: "Public Safety", category: "Fire Department", budgetedAmount: 3800000, spentAmount: 3420000 },
    { department: "Public Safety", category: "Emergency Services", budgetedAmount: 1200000, spentAmount: 1050000 },
    { department: "Public Safety", category: "Animal Control", budgetedAmount: 280000, spentAmount: 245000 },
    { department: "Education", category: "K-12 Schools", budgetedAmount: 12500000, spentAmount: 11250000 },
    { department: "Education", category: "Special Education", budgetedAmount: 2800000, spentAmount: 2650000 },
    { department: "Education", category: "School Transportation", budgetedAmount: 1400000, spentAmount: 1260000 },
    { department: "Education", category: "School Nutrition", budgetedAmount: 800000, spentAmount: 720000 },
    { department: "Public Works", category: "Road Maintenance", budgetedAmount: 3200000, spentAmount: 2880000 },
    { department: "Public Works", category: "Water & Sewer", budgetedAmount: 2400000, spentAmount: 2160000 },
    { department: "Public Works", category: "Snow Removal", budgetedAmount: 1100000, spentAmount: 990000 },
    { department: "Public Works", category: "Solid Waste", budgetedAmount: 800000, spentAmount: 680000 },
    { department: "Parks & Recreation", category: "Parks Maintenance", budgetedAmount: 1200000, spentAmount: 1020000 },
    { department: "Parks & Recreation", category: "Recreation Programs", budgetedAmount: 850000, spentAmount: 765000 },
    { department: "Parks & Recreation", category: "Community Center", budgetedAmount: 450000, spentAmount: 405000 },
    { department: "Administration", category: "Town Manager Office", budgetedAmount: 680000, spentAmount: 612000 },
    { department: "Administration", category: "Finance Department", budgetedAmount: 520000, spentAmount: 468000 },
    { department: "Administration", category: "Human Resources", budgetedAmount: 380000, spentAmount: 342000 },
    { department: "Administration", category: "IT Services", budgetedAmount: 620000, spentAmount: 558000 },
    { department: "Administration", category: "Legal Services", budgetedAmount: 350000, spentAmount: 315000 },
    { department: "Social Services", category: "Housing Assistance", budgetedAmount: 900000, spentAmount: 810000 },
    { department: "Social Services", category: "Senior Services", budgetedAmount: 650000, spentAmount: 585000 },
    { department: "Social Services", category: "Youth Programs", budgetedAmount: 420000, spentAmount: 378000 },
    { department: "Library", category: "Operations", budgetedAmount: 580000, spentAmount: 522000 },
    { department: "Library", category: "Collections & Programs", budgetedAmount: 220000, spentAmount: 198000 },
  ];
  const mapleDept25 = [
    { department: "Public Safety", category: "Police Department", budgetedAmount: 4950000, spentAmount: 4900000 },
    { department: "Public Safety", category: "Fire Department", budgetedAmount: 3600000, spentAmount: 3550000 },
    { department: "Public Safety", category: "Emergency Services", budgetedAmount: 1100000, spentAmount: 1080000 },
    { department: "Public Safety", category: "Animal Control", budgetedAmount: 260000, spentAmount: 255000 },
    { department: "Education", category: "K-12 Schools", budgetedAmount: 12000000, spentAmount: 11900000 },
    { department: "Education", category: "Special Education", budgetedAmount: 2600000, spentAmount: 2580000 },
    { department: "Education", category: "School Transportation", budgetedAmount: 1300000, spentAmount: 1280000 },
    { department: "Education", category: "School Nutrition", budgetedAmount: 750000, spentAmount: 740000 },
    { department: "Public Works", category: "Road Maintenance", budgetedAmount: 3000000, spentAmount: 2950000 },
    { department: "Public Works", category: "Water & Sewer", budgetedAmount: 2200000, spentAmount: 2150000 },
    { department: "Public Works", category: "Snow Removal", budgetedAmount: 1000000, spentAmount: 1120000 },
    { department: "Public Works", category: "Solid Waste", budgetedAmount: 750000, spentAmount: 730000 },
    { department: "Parks & Recreation", category: "Parks Maintenance", budgetedAmount: 1100000, spentAmount: 1080000 },
    { department: "Parks & Recreation", category: "Recreation Programs", budgetedAmount: 800000, spentAmount: 790000 },
    { department: "Parks & Recreation", category: "Community Center", budgetedAmount: 400000, spentAmount: 395000 },
    { department: "Administration", category: "Town Manager Office", budgetedAmount: 650000, spentAmount: 640000 },
    { department: "Administration", category: "Finance Department", budgetedAmount: 500000, spentAmount: 490000 },
    { department: "Administration", category: "Human Resources", budgetedAmount: 360000, spentAmount: 350000 },
    { department: "Administration", category: "IT Services", budgetedAmount: 580000, spentAmount: 570000 },
    { department: "Administration", category: "Legal Services", budgetedAmount: 320000, spentAmount: 315000 },
    { department: "Social Services", category: "Housing Assistance", budgetedAmount: 850000, spentAmount: 840000 },
    { department: "Social Services", category: "Senior Services", budgetedAmount: 600000, spentAmount: 590000 },
    { department: "Social Services", category: "Youth Programs", budgetedAmount: 380000, spentAmount: 375000 },
    { department: "Library", category: "Operations", budgetedAmount: 550000, spentAmount: 545000 },
    { department: "Library", category: "Collections & Programs", budgetedAmount: 200000, spentAmount: 195000 },
  ];

  for (const d of mapleDept26) db.insert(departmentBudgets).values({ ...d, municipalityId: maplewood.id, year: "FY2026" }).run();
  for (const d of mapleDept25) db.insert(departmentBudgets).values({ ...d, municipalityId: maplewood.id, year: "FY2025" }).run();

  // ── Projects: Maplewood ────────────────────────────────────────────────────
  const mapleProjects = [
    { name: "Main Street Bridge Replacement", department: "Public Works", totalBudget: 4200000, spentToDate: 2940000, percentComplete: 68, startDate: "2025-03-15", expectedEnd: "2026-09-30", status: "on-track", description: "Replacement of the aging Main Street bridge over Otter Creek." },
    { name: "Community Center Renovation", department: "Parks & Recreation", totalBudget: 2800000, spentToDate: 840000, percentComplete: 30, startDate: "2025-09-01", expectedEnd: "2027-02-28", status: "on-track", description: "Full renovation including ADA upgrades, HVAC, and multipurpose room expansion." },
    { name: "Water Treatment Plant Upgrade", department: "Public Works", totalBudget: 6500000, spentToDate: 5850000, percentComplete: 88, startDate: "2024-06-01", expectedEnd: "2026-06-30", status: "on-track", description: "Modernization to meet new EPA standards and increase capacity." },
    { name: "School District Solar Installation", department: "Education", totalBudget: 1800000, spentToDate: 1260000, percentComplete: 55, startDate: "2025-05-01", expectedEnd: "2026-04-30", status: "at-risk", description: "Rooftop solar panels across three school buildings. Supply chain delays on inverter units." },
    { name: "Downtown Fiber Network", department: "Administration", totalBudget: 3200000, spentToDate: 640000, percentComplete: 15, startDate: "2025-11-01", expectedEnd: "2027-06-30", status: "behind", description: "Municipal fiber-optic network for downtown business district. Permitting delays." },
    { name: "Public Safety Radio System", department: "Public Safety", totalBudget: 1500000, spentToDate: 1350000, percentComplete: 92, startDate: "2025-01-15", expectedEnd: "2026-05-15", status: "on-track", description: "Upgrade to digital P25 radio communications system." },
  ];

  for (const p of mapleProjects) db.insert(capitalProjects).values({ ...p, municipalityId: maplewood.id }).run();

  // ── Revenue: Riverdale FY2026 ──────────────────────────────────────────────
  const riverdaleRev26 = [
    { source: "Residential Property Tax", category: "Property Taxes", budgetedAmount: 7200000, collectedAmount: 7100000 },
    { source: "Commercial Property Tax", category: "Property Taxes", budgetedAmount: 2800000, collectedAmount: 2750000 },
    { source: "Education Fund Grant", category: "State Aid", budgetedAmount: 3600000, collectedAmount: 3600000 },
    { source: "Highway Fund", category: "State Aid", budgetedAmount: 900000, collectedAmount: 880000 },
    { source: "Building Permits", category: "Fees", budgetedAmount: 420000, collectedAmount: 395000 },
    { source: "Recreation Fees", category: "Fees", budgetedAmount: 180000, collectedAmount: 165000 },
    { source: "Federal Grants", category: "Grants", budgetedAmount: 650000, collectedAmount: 650000 },
    { source: "Investment Income", category: "Other", budgetedAmount: 110000, collectedAmount: 128000 },
  ];

  for (const r of riverdaleRev26) db.insert(revenueSources).values({ ...r, municipalityId: riverdale.id, year: "FY2026" }).run();

  const riverdaleDept26 = [
    { department: "Public Safety", category: "Police", budgetedAmount: 2100000, spentAmount: 1950000 },
    { department: "Public Safety", category: "Fire", budgetedAmount: 1500000, spentAmount: 1380000 },
    { department: "Education", category: "K-12 Schools", budgetedAmount: 5200000, spentAmount: 4900000 },
    { department: "Education", category: "Special Education", budgetedAmount: 980000, spentAmount: 940000 },
    { department: "Public Works", category: "Roads", budgetedAmount: 1400000, spentAmount: 1250000 },
    { department: "Public Works", category: "Water & Sewer", budgetedAmount: 900000, spentAmount: 820000 },
    { department: "Administration", category: "Town Offices", budgetedAmount: 680000, spentAmount: 620000 },
    { department: "Parks & Recreation", category: "Parks", budgetedAmount: 420000, spentAmount: 380000 },
  ];

  for (const d of riverdaleDept26) db.insert(departmentBudgets).values({ ...d, municipalityId: riverdale.id, year: "FY2026" }).run();
}
