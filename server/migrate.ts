/**
 * Auto-migration: creates all tables if they don't exist.
 * Runs on every server start — safe to call multiple times (IF NOT EXISTS).
 * This replaces the need to run `drizzle-kit push` manually on Railway.
 */
import { db } from "./storage";
import { sql } from "drizzle-orm";

export function runMigrations() {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS municipalities (
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
      onboarding_complete INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS revenue_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      municipality_id INTEGER NOT NULL,
      year TEXT NOT NULL,
      source TEXT NOT NULL,
      category TEXT NOT NULL,
      budgeted_amount REAL NOT NULL,
      collected_amount REAL NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS department_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      municipality_id INTEGER NOT NULL,
      year TEXT NOT NULL,
      department TEXT NOT NULL,
      category TEXT NOT NULL,
      budgeted_amount REAL NOT NULL,
      spent_amount REAL NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS capital_projects (
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
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS upload_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      municipality_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      record_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      notes TEXT
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS citizen_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      municipality_id INTEGER NOT NULL,
      section TEXT NOT NULL,
      name TEXT,
      email TEXT,
      message TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      approved INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS email_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      municipality_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      subscribed_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )
  `);

  console.log("[migrate] Tables verified/created");
}
