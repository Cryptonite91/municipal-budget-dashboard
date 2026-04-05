/**
 * Auto-migration: creates all tables if they don't exist.
 * Uses the raw libsql client so it can run synchronously on startup.
 * Safe to call multiple times (IF NOT EXISTS).
 */
import { createClient } from "@libsql/client";
import { mkdirSync } from "fs";
import { dirname, resolve } from "path";

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

// ALTER TABLE migrations for columns added after initial schema
const alterations = [
  `ALTER TABLE municipalities ADD COLUMN listed INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE budget_documents ADD COLUMN ai_review_log TEXT`,
  `ALTER TABLE municipalities ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved'`,
];

export async function runMigrations() {
  for (const sql of tables) {
    await migrationClient.execute(sql);
  }
  // Create admin_users table
  await migrationClient.execute(adminUsersTable);
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
  console.log("[migrate] Tables verified/created");
}
