/**
 * Auto-migration: creates all tables if they don't exist.
 * Uses the raw libsql client so it can run synchronously on startup.
 * Safe to call multiple times (IF NOT EXISTS).
 */
import { createClient } from "@libsql/client";
import { mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { SYSTEM_DEFAULTS, matchToAllowed, type FieldType } from "./field-options";

const dbPath = process.env.DATABASE_PATH || "data.db";
const dbDir = dirname(dbPath);
if (dbDir && dbDir !== ".") {
  try { mkdirSync(dbDir, { recursive: true }); } catch {}
}
const absPath = dbPath.startsWith("/") ? dbPath : resolve(process.cwd(), dbPath);
const migrationClient = createClient({ url: `file:${absPath}` });

const tables = [
  `CREATE TABLE IF NOT EXISTS municipalities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    state TEXT NOT NULL,
    population INTEGER NOT NULL,
    fiscal_year TEXT NOT NULL,
    contact_email TEXT,
    contact_phone TEXT,
    website TEXT,
    last_updated TEXT NOT NULL,
    admin_password_hash TEXT NOT NULL,
    revenue_published INTEGER NOT NULL DEFAULT 0,
    departments_published INTEGER NOT NULL DEFAULT 0,
    projects_published INTEGER NOT NULL DEFAULT 0,
    onboarding_complete INTEGER NOT NULL DEFAULT 0,
    listed INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS revenue_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    municipality_id INTEGER NOT NULL,
    year TEXT NOT NULL,
    source TEXT NOT NULL,
    category TEXT NOT NULL,
    budgeted_amount REAL NOT NULL,
    collected_amount REAL NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS department_budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    municipality_id INTEGER NOT NULL,
    year TEXT NOT NULL,
    department TEXT NOT NULL,
    category TEXT NOT NULL,
    budgeted_amount REAL NOT NULL,
    spent_amount REAL NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS capital_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    municipality_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    total_budget REAL NOT NULL,
    spent_to_date REAL NOT NULL,
    percent_complete INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    expected_end TEXT NOT NULL,
    status TEXT NOT NULL,
    description TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS upload_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    municipality_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    record_count INTEGER NOT NULL,
    status TEXT NOT NULL,
    notes TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS citizen_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    municipality_id INTEGER NOT NULL,
    section TEXT NOT NULL,
    name TEXT,
    email TEXT,
    message TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    approved INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS email_subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    municipality_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    subscribed_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS budget_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    municipality_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    is_public INTEGER NOT NULL DEFAULT 0,
    uploaded_at TEXT NOT NULL,
    description TEXT,
    year TEXT
  )`,
];

// New table: admin_users (municipal + platform admins)
const adminUsersTable = `CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'municipal',
  municipality_id INTEGER,
  created_at TEXT NOT NULL
)`;

// New table: import_batch_records (per-row snapshots for import history detail)
const importBatchRecordsTable = `CREATE TABLE IF NOT EXISTS import_batch_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  municipality_id INTEGER NOT NULL,
  record_json TEXT NOT NULL
)`;

// New table: field_options (controlled vocab for dept/source/category)
const fieldOptionsTable = `CREATE TABLE IF NOT EXISTS field_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  municipality_id INTEGER,
  field_type TEXT NOT NULL,
  value TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0
)`;

// New table: population_figures (year-tagged population per municipality)
const populationFiguresTable = `CREATE TABLE IF NOT EXISTS population_figures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  municipality_id INTEGER NOT NULL,
  year TEXT NOT NULL,
  population INTEGER NOT NULL
)`;

// ALTER TABLE migrations for columns added after initial schema
const alterations = [
  `ALTER TABLE municipalities ADD COLUMN listed INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE budget_documents ADD COLUMN ai_review_log TEXT`,
  `ALTER TABLE municipalities ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved'`,
  // Year management + import history detail
  `ALTER TABLE upload_history ADD COLUMN data_type TEXT`,
  `ALTER TABLE upload_history ADD COLUMN year TEXT`,
];

export async function runMigrations() {
  for (const sql of tables) {
    await migrationClient.execute(sql);
  }
  // Create admin_users table
  await migrationClient.execute(adminUsersTable);
  // Create import_batch_records table
  await migrationClient.execute(importBatchRecordsTable);
  // Create field_options table
  await migrationClient.execute(fieldOptionsTable);
  // Create population_figures table
  await migrationClient.execute(populationFiguresTable);
  // Run alterations, ignoring "duplicate column" errors (idempotent)
  for (const sql of alterations) {
    try {
      await migrationClient.execute(sql);
    } catch (e: any) {
      if (!e.message?.includes("duplicate column") && !e.message?.includes("already exists")) {
        throw e;
      }
    }
  }
  // Seed demo munis as listed so they appear in directory
  await migrationClient.execute(
    `UPDATE municipalities SET listed = 1 WHERE slug IN ('maplewood-vt', 'riverdale-nh')`
  );
  // Set existing demo munis as approved
  await migrationClient.execute(
    `UPDATE municipalities SET approval_status = 'approved' WHERE approval_status IS NULL OR approval_status = ''`
  );
  // Seed platform admin if PLATFORM_ADMIN_EMAIL + PLATFORM_ADMIN_PASSWORD_HASH env vars are set
  // Also seed demo municipal admins for existing demo tenants (idempotent)
  try {
    const bcryptMod = await import("bcryptjs");
    const now = new Date().toISOString();
    // Platform admin from env
    const platformEmail = process.env.PLATFORM_ADMIN_EMAIL;
    const platformPass = process.env.PLATFORM_ADMIN_PASSWORD;
    if (platformEmail && platformPass) {
      const hash = bcryptMod.hashSync(platformPass, 10);
      await migrationClient.execute(
        `INSERT OR IGNORE INTO admin_users (email, password_hash, role, municipality_id, created_at)
         VALUES ('${platformEmail}', '${hash}', 'platform', NULL, '${now}')`
      );
    }
    // Seed demo municipal admins tied to existing demo tenants
    const demoAdmins = [
      { email: "admin@maplewood-vt.gov", password: "maplewood", slug: "maplewood-vt" },
      { email: "admin@riverdale-nh.gov", password: "riverdale", slug: "riverdale-nh" },
      { email: "admin@essex-junction-vermont.gov", password: "essexjunction", slug: "essex-junction-vermont" },
    ];
    for (const da of demoAdmins) {
      const muniRow = await migrationClient.execute(
        `SELECT id FROM municipalities WHERE slug = '${da.slug}' LIMIT 1`
      );
      const muniId = muniRow.rows[0]?.id;
      if (muniId) {
        const hash = bcryptMod.hashSync(da.password, 10);
        await migrationClient.execute(
          `INSERT OR IGNORE INTO admin_users (email, password_hash, role, municipality_id, created_at)
           VALUES ('${da.email}', '${hash}', 'municipal', ${muniId}, '${now}')`
        );
      }
    }
  } catch (e: any) {
    console.warn("[migrate] admin_user seed warning:", e.message);
  }
  // ── Seed system default field options (idempotent) ──────────────────────────
  try {
    for (const [fieldType, values] of Object.entries(SYSTEM_DEFAULTS) as [FieldType, string[]][]) {
      for (const value of values) {
        await migrationClient.execute(
          `INSERT OR IGNORE INTO field_options (municipality_id, field_type, value, is_system)
           SELECT NULL, '${fieldType.replace(/'/g, "''")}', '${value.replace(/'/g, "''")}', 1
           WHERE NOT EXISTS (
             SELECT 1 FROM field_options
             WHERE municipality_id IS NULL AND field_type='${fieldType.replace(/'/g, "''")}' AND value='${value.replace(/'/g, "''")}'
           )`
        );
      }
    }
    console.log("[migrate] Field option defaults seeded");
  } catch (e: any) {
    console.warn("[migrate] field_options seed warning:", e.message);
  }

  // ── Retrofit historical data: normalize dept/source/category to allowed values ──
  // For each municipality, load their rows and remap values via matchToAllowed().
  // New custom options are auto-created so no data is lost.
  try {
    const munis = (await migrationClient.execute("SELECT id FROM municipalities")).rows as { id: number }[];

    // Helper: get current allowed values for a municipality + fieldType
    const getAllowed = async (muniId: number, ft: FieldType): Promise<string[]> => {
      const rows = (await migrationClient.execute(
        `SELECT value FROM field_options WHERE (municipality_id IS NULL OR municipality_id=${muniId}) AND field_type='${ft}'`
      )).rows as { value: string }[];
      return rows.map(r => r.value);
    };

    // Helper: ensure a custom option exists
    const ensureCustom = async (muniId: number, ft: FieldType, value: string) => {
      const lowVal = value.toLowerCase().trim();
      await migrationClient.execute(
        `INSERT OR IGNORE INTO field_options (municipality_id, field_type, value, is_system)
         SELECT ${muniId}, '${ft}', '${value.replace(/'/g, "''")}', 0
         WHERE NOT EXISTS (
           SELECT 1 FROM field_options
           WHERE (municipality_id IS NULL OR municipality_id=${muniId})
             AND field_type='${ft}'
             AND LOWER(TRIM(value))='${lowVal.replace(/'/g, "''")}'
         )`
      );
    };

    for (const { id: muniId } of munis) {
      // ── Department budgets: normalize department and dept_category
      const deptRows = (await migrationClient.execute(
        `SELECT id, department, category FROM department_budgets WHERE municipality_id=${muniId}`
      )).rows as { id: number; department: string; category: string }[];

      for (const row of deptRows) {
        const deptAllowed = await getAllowed(muniId, "department");
        const catAllowed  = await getAllowed(muniId, "dept_category");

        const { matched: dept, isNew: deptNew } = matchToAllowed(row.department, deptAllowed, "department");
        const { matched: cat,  isNew: catNew  } = matchToAllowed(row.category,   catAllowed,  "dept_category");

        if (deptNew) await ensureCustom(muniId, "department",    dept);
        if (catNew)  await ensureCustom(muniId, "dept_category", cat);

        if (dept !== row.department || cat !== row.category) {
          await migrationClient.execute(
            `UPDATE department_budgets SET department='${dept.replace(/'/g, "''")}', category='${cat.replace(/'/g, "''")}' WHERE id=${row.id}`
          );
        }
      }

      // ── Revenue sources: normalize source and rev_category
      const revRows = (await migrationClient.execute(
        `SELECT id, source, category FROM revenue_sources WHERE municipality_id=${muniId}`
      )).rows as { id: number; source: string; category: string }[];

      for (const row of revRows) {
        const srcAllowed = await getAllowed(muniId, "source");
        const catAllowed = await getAllowed(muniId, "rev_category");

        const { matched: src, isNew: srcNew } = matchToAllowed(row.source,   srcAllowed, "source");
        const { matched: cat, isNew: catNew } = matchToAllowed(row.category, catAllowed, "rev_category");

        if (srcNew) await ensureCustom(muniId, "source",       src);
        if (catNew) await ensureCustom(muniId, "rev_category", cat);

        if (src !== row.source || cat !== row.category) {
          await migrationClient.execute(
            `UPDATE revenue_sources SET source='${src.replace(/'/g, "''")}', category='${cat.replace(/'/g, "''")}' WHERE id=${row.id}`
          );
        }
      }
    }
    console.log("[migrate] Historical data retrofit complete");
  } catch (e: any) {
    console.warn("[migrate] Retrofit warning:", e.message);
  }

  // ── One-time data fix: strip FY prefix from year columns (idempotent) ──────
  // Converts "FY2026" → "2026", "FY2025" → "2025", etc. in all data tables.
  // Safe to run repeatedly: SUBSTR(year, 3) on "2026" produces "26" which
  // does NOT start with "FY", so the WHERE clause never matches again.
  const stripFyUpdates = [
    `UPDATE department_budgets SET year = SUBSTR(year, 3) WHERE year LIKE 'FY%'`,
    `UPDATE revenue_sources    SET year = SUBSTR(year, 3) WHERE year LIKE 'FY%'`,
    `UPDATE upload_history     SET year = SUBSTR(year, 3) WHERE year LIKE 'FY%'`,
    `UPDATE budget_documents   SET year = SUBSTR(year, 3) WHERE year LIKE 'FY%'`,
    `UPDATE municipalities     SET fiscal_year = SUBSTR(fiscal_year, 3) WHERE fiscal_year LIKE 'FY%'`,
  ];
  for (const sql of stripFyUpdates) {
    try {
      await migrationClient.execute(sql);
    } catch (e: any) {
      console.warn("[migrate] FY-strip warning:", e.message);
    }
  }
  // ── Seed population_figures from existing municipalities.population (one-time) ──
  try {
    const munis = (await migrationClient.execute(
      `SELECT id, population, fiscal_year FROM municipalities WHERE population > 0`
    )).rows as { id: number; population: number; fiscal_year: string }[];
    for (const m of munis) {
      const yr = m.fiscal_year || "2026";
      await migrationClient.execute(
        `INSERT OR IGNORE INTO population_figures (municipality_id, year, population)
         SELECT ${m.id}, '${yr}', ${m.population}
         WHERE NOT EXISTS (
           SELECT 1 FROM population_figures WHERE municipality_id=${m.id} AND year='${yr}'
         )`
      );
    }
    console.log("[migrate] Population figures seeded from municipalities table");
  } catch (e: any) {
    console.warn("[migrate] population seed warning:", e.message);
  }

  console.log("[migrate] Tables verified/created");
}
