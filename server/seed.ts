import { db } from "./storage";
import {
  municipality, revenueSources, departmentBudgets, capitalProjects,
} from "@shared/schema";

export function seedDatabase() {
  // Check if already seeded
  const existing = db.select().from(municipality).get();
  if (existing) return;

  // Municipality info
  db.insert(municipality).values({
    name: "Maplewood",
    state: "Vermont",
    population: 28500,
    fiscalYear: "FY2026",
    contactEmail: "finance@maplewoodvt.gov",
    contactPhone: "(802) 555-0142",
    website: "https://maplewoodvt.gov",
    lastUpdated: "2026-03-28T14:30:00Z",
  }).run();

  // Revenue Sources FY2026
  const fy26Revenue = [
    { year: "FY2026", source: "Residential Property Tax", category: "Property Taxes", budgetedAmount: 18200000, collectedAmount: 17890000 },
    { year: "FY2026", source: "Commercial Property Tax", category: "Property Taxes", budgetedAmount: 6800000, collectedAmount: 6650000 },
    { year: "FY2026", source: "Education Fund Grant", category: "State Aid", budgetedAmount: 8400000, collectedAmount: 8400000 },
    { year: "FY2026", source: "Highway Fund Allocation", category: "State Aid", budgetedAmount: 2100000, collectedAmount: 2050000 },
    { year: "FY2026", source: "Municipal Aid", category: "State Aid", budgetedAmount: 1500000, collectedAmount: 1500000 },
    { year: "FY2026", source: "Building Permits & Fees", category: "Fees", budgetedAmount: 1200000, collectedAmount: 1150000 },
    { year: "FY2026", source: "Recreation Program Fees", category: "Fees", budgetedAmount: 650000, collectedAmount: 620000 },
    { year: "FY2026", source: "Licensing & Registration", category: "Fees", budgetedAmount: 480000, collectedAmount: 465000 },
    { year: "FY2026", source: "Federal ARPA Funds", category: "Grants", budgetedAmount: 1800000, collectedAmount: 1800000 },
    { year: "FY2026", source: "Clean Water State Grant", category: "Grants", budgetedAmount: 950000, collectedAmount: 750000 },
    { year: "FY2026", source: "Community Development Block Grant", category: "Grants", budgetedAmount: 600000, collectedAmount: 450000 },
    { year: "FY2026", source: "Investment Income", category: "Other", budgetedAmount: 320000, collectedAmount: 385000 },
    { year: "FY2026", source: "Fines & Penalties", category: "Other", budgetedAmount: 180000, collectedAmount: 165000 },
    { year: "FY2026", source: "Miscellaneous Revenue", category: "Other", budgetedAmount: 120000, collectedAmount: 95000 },
  ];

  // Revenue Sources FY2025
  const fy25Revenue = [
    { year: "FY2025", source: "Residential Property Tax", category: "Property Taxes", budgetedAmount: 17500000, collectedAmount: 17350000 },
    { year: "FY2025", source: "Commercial Property Tax", category: "Property Taxes", budgetedAmount: 6500000, collectedAmount: 6420000 },
    { year: "FY2025", source: "Education Fund Grant", category: "State Aid", budgetedAmount: 8100000, collectedAmount: 8100000 },
    { year: "FY2025", source: "Highway Fund Allocation", category: "State Aid", budgetedAmount: 2000000, collectedAmount: 1980000 },
    { year: "FY2025", source: "Municipal Aid", category: "State Aid", budgetedAmount: 1400000, collectedAmount: 1400000 },
    { year: "FY2025", source: "Building Permits & Fees", category: "Fees", budgetedAmount: 1100000, collectedAmount: 1050000 },
    { year: "FY2025", source: "Recreation Program Fees", category: "Fees", budgetedAmount: 600000, collectedAmount: 580000 },
    { year: "FY2025", source: "Licensing & Registration", category: "Fees", budgetedAmount: 450000, collectedAmount: 440000 },
    { year: "FY2025", source: "Federal ARPA Funds", category: "Grants", budgetedAmount: 2200000, collectedAmount: 2200000 },
    { year: "FY2025", source: "Clean Water State Grant", category: "Grants", budgetedAmount: 800000, collectedAmount: 800000 },
    { year: "FY2025", source: "Community Development Block Grant", category: "Grants", budgetedAmount: 500000, collectedAmount: 500000 },
    { year: "FY2025", source: "Investment Income", category: "Other", budgetedAmount: 280000, collectedAmount: 310000 },
    { year: "FY2025", source: "Fines & Penalties", category: "Other", budgetedAmount: 170000, collectedAmount: 155000 },
    { year: "FY2025", source: "Miscellaneous Revenue", category: "Other", budgetedAmount: 100000, collectedAmount: 88000 },
  ];

  for (const r of [...fy26Revenue, ...fy25Revenue]) {
    db.insert(revenueSources).values(r).run();
  }

  // Department Budgets FY2026
  const fy26Departments = [
    // Public Safety
    { year: "FY2026", department: "Public Safety", category: "Police Department", budgetedAmount: 5200000, spentAmount: 4680000 },
    { year: "FY2026", department: "Public Safety", category: "Fire Department", budgetedAmount: 3800000, spentAmount: 3420000 },
    { year: "FY2026", department: "Public Safety", category: "Emergency Services", budgetedAmount: 1200000, spentAmount: 1050000 },
    { year: "FY2026", department: "Public Safety", category: "Animal Control", budgetedAmount: 280000, spentAmount: 245000 },
    // Education
    { year: "FY2026", department: "Education", category: "K-12 Schools", budgetedAmount: 12500000, spentAmount: 11250000 },
    { year: "FY2026", department: "Education", category: "Special Education", budgetedAmount: 2800000, spentAmount: 2650000 },
    { year: "FY2026", department: "Education", category: "School Transportation", budgetedAmount: 1400000, spentAmount: 1260000 },
    { year: "FY2026", department: "Education", category: "School Nutrition", budgetedAmount: 800000, spentAmount: 720000 },
    // Public Works
    { year: "FY2026", department: "Public Works", category: "Road Maintenance", budgetedAmount: 3200000, spentAmount: 2880000 },
    { year: "FY2026", department: "Public Works", category: "Water & Sewer", budgetedAmount: 2400000, spentAmount: 2160000 },
    { year: "FY2026", department: "Public Works", category: "Snow Removal", budgetedAmount: 1100000, spentAmount: 990000 },
    { year: "FY2026", department: "Public Works", category: "Solid Waste", budgetedAmount: 800000, spentAmount: 680000 },
    // Parks & Recreation
    { year: "FY2026", department: "Parks & Recreation", category: "Parks Maintenance", budgetedAmount: 1200000, spentAmount: 1020000 },
    { year: "FY2026", department: "Parks & Recreation", category: "Recreation Programs", budgetedAmount: 850000, spentAmount: 765000 },
    { year: "FY2026", department: "Parks & Recreation", category: "Community Center", budgetedAmount: 450000, spentAmount: 405000 },
    // Administration
    { year: "FY2026", department: "Administration", category: "Town Manager Office", budgetedAmount: 680000, spentAmount: 612000 },
    { year: "FY2026", department: "Administration", category: "Finance Department", budgetedAmount: 520000, spentAmount: 468000 },
    { year: "FY2026", department: "Administration", category: "Human Resources", budgetedAmount: 380000, spentAmount: 342000 },
    { year: "FY2026", department: "Administration", category: "IT Services", budgetedAmount: 620000, spentAmount: 558000 },
    { year: "FY2026", department: "Administration", category: "Legal Services", budgetedAmount: 350000, spentAmount: 315000 },
    // Social Services
    { year: "FY2026", department: "Social Services", category: "Housing Assistance", budgetedAmount: 900000, spentAmount: 810000 },
    { year: "FY2026", department: "Social Services", category: "Senior Services", budgetedAmount: 650000, spentAmount: 585000 },
    { year: "FY2026", department: "Social Services", category: "Youth Programs", budgetedAmount: 420000, spentAmount: 378000 },
    // Library
    { year: "FY2026", department: "Library", category: "Operations", budgetedAmount: 580000, spentAmount: 522000 },
    { year: "FY2026", department: "Library", category: "Collections & Programs", budgetedAmount: 220000, spentAmount: 198000 },
  ];

  // Department Budgets FY2025
  const fy25Departments = [
    { year: "FY2025", department: "Public Safety", category: "Police Department", budgetedAmount: 4950000, spentAmount: 4900000 },
    { year: "FY2025", department: "Public Safety", category: "Fire Department", budgetedAmount: 3600000, spentAmount: 3550000 },
    { year: "FY2025", department: "Public Safety", category: "Emergency Services", budgetedAmount: 1100000, spentAmount: 1080000 },
    { year: "FY2025", department: "Public Safety", category: "Animal Control", budgetedAmount: 260000, spentAmount: 255000 },
    { year: "FY2025", department: "Education", category: "K-12 Schools", budgetedAmount: 12000000, spentAmount: 11900000 },
    { year: "FY2025", department: "Education", category: "Special Education", budgetedAmount: 2600000, spentAmount: 2580000 },
    { year: "FY2025", department: "Education", category: "School Transportation", budgetedAmount: 1300000, spentAmount: 1280000 },
    { year: "FY2025", department: "Education", category: "School Nutrition", budgetedAmount: 750000, spentAmount: 740000 },
    { year: "FY2025", department: "Public Works", category: "Road Maintenance", budgetedAmount: 3000000, spentAmount: 2950000 },
    { year: "FY2025", department: "Public Works", category: "Water & Sewer", budgetedAmount: 2200000, spentAmount: 2150000 },
    { year: "FY2025", department: "Public Works", category: "Snow Removal", budgetedAmount: 1000000, spentAmount: 1120000 },
    { year: "FY2025", department: "Public Works", category: "Solid Waste", budgetedAmount: 750000, spentAmount: 730000 },
    { year: "FY2025", department: "Parks & Recreation", category: "Parks Maintenance", budgetedAmount: 1100000, spentAmount: 1080000 },
    { year: "FY2025", department: "Parks & Recreation", category: "Recreation Programs", budgetedAmount: 800000, spentAmount: 790000 },
    { year: "FY2025", department: "Parks & Recreation", category: "Community Center", budgetedAmount: 400000, spentAmount: 395000 },
    { year: "FY2025", department: "Administration", category: "Town Manager Office", budgetedAmount: 650000, spentAmount: 640000 },
    { year: "FY2025", department: "Administration", category: "Finance Department", budgetedAmount: 500000, spentAmount: 490000 },
    { year: "FY2025", department: "Administration", category: "Human Resources", budgetedAmount: 360000, spentAmount: 350000 },
    { year: "FY2025", department: "Administration", category: "IT Services", budgetedAmount: 580000, spentAmount: 570000 },
    { year: "FY2025", department: "Administration", category: "Legal Services", budgetedAmount: 320000, spentAmount: 315000 },
    { year: "FY2025", department: "Social Services", category: "Housing Assistance", budgetedAmount: 850000, spentAmount: 840000 },
    { year: "FY2025", department: "Social Services", category: "Senior Services", budgetedAmount: 600000, spentAmount: 590000 },
    { year: "FY2025", department: "Social Services", category: "Youth Programs", budgetedAmount: 380000, spentAmount: 375000 },
    { year: "FY2025", department: "Library", category: "Operations", budgetedAmount: 550000, spentAmount: 545000 },
    { year: "FY2025", department: "Library", category: "Collections & Programs", budgetedAmount: 200000, spentAmount: 195000 },
  ];

  for (const d of [...fy26Departments, ...fy25Departments]) {
    db.insert(departmentBudgets).values(d).run();
  }

  // Capital Projects
  const projects = [
    {
      name: "Main Street Bridge Replacement",
      department: "Public Works",
      totalBudget: 4200000,
      spentToDate: 2940000,
      percentComplete: 68,
      startDate: "2025-03-15",
      expectedEnd: "2026-09-30",
      status: "on-track",
      description: "Replacement of the aging Main Street bridge over Otter Creek with modern infrastructure.",
    },
    {
      name: "Maplewood Community Center Renovation",
      department: "Parks & Recreation",
      totalBudget: 2800000,
      spentToDate: 840000,
      percentComplete: 30,
      startDate: "2025-09-01",
      expectedEnd: "2027-02-28",
      status: "on-track",
      description: "Full renovation of the community center including ADA upgrades, HVAC, and multipurpose room expansion.",
    },
    {
      name: "Water Treatment Plant Upgrade",
      department: "Public Works",
      totalBudget: 6500000,
      spentToDate: 5850000,
      percentComplete: 88,
      startDate: "2024-06-01",
      expectedEnd: "2026-06-30",
      status: "on-track",
      description: "Modernization of water treatment facility to meet new EPA standards and increase capacity.",
    },
    {
      name: "School District Solar Installation",
      department: "Education",
      totalBudget: 1800000,
      spentToDate: 1260000,
      percentComplete: 55,
      startDate: "2025-05-01",
      expectedEnd: "2026-04-30",
      status: "at-risk",
      description: "Installation of rooftop solar panels across three school buildings. Supply chain delays on inverter units.",
    },
    {
      name: "Downtown Fiber Network",
      department: "Administration",
      totalBudget: 3200000,
      spentToDate: 640000,
      percentComplete: 15,
      startDate: "2025-11-01",
      expectedEnd: "2027-06-30",
      status: "behind",
      description: "Municipal fiber-optic network build-out for downtown business district. Permitting delays with state utilities.",
    },
    {
      name: "Public Safety Radio System",
      department: "Public Safety",
      totalBudget: 1500000,
      spentToDate: 1350000,
      percentComplete: 92,
      startDate: "2025-01-15",
      expectedEnd: "2026-05-15",
      status: "on-track",
      description: "Upgrade of police and fire department radio communications to digital P25 system.",
    },
  ];

  for (const p of projects) {
    db.insert(capitalProjects).values(p).run();
  }
}
