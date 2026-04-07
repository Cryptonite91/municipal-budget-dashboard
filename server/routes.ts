import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { seedDatabase } from "./seed";
import { runMigrations } from "./migrate";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";
import type { Municipality } from "@shared/schema";
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join, extname } from "path";
import pdfParse from "pdf-parse";
import { normalizeYear } from "./year-utils";
import { matchToAllowed } from "./field-options";

// ─── Auth: per-tenant token sessions ─────────────────────────────────────────
// Map: token → municipalityId
interface SessionInfo {
  municipalityId: number | null; // null for platform admins
  role: "municipal" | "platform";
  email: string;
}
const activeSessions = new Map<string, SessionInfo>();

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ─── Tenant middleware ────────────────────────────────────────────────────────
// Resolves municipality from ?tenant=slug query param (or X-Tenant header)
// Attaches muni to res.locals.muni
async function resolveTenant(req: Request, res: Response, next: NextFunction) {
  const slug =
    (req.query.tenant as string) ||
    (req.headers["x-tenant"] as string) ||
    "maplewood-vt"; // fallback for backwards-compat demo

  const muni = await storage.getMunicipalityBySlug(slug);
  if (!muni) return res.status(404).json({ error: `Municipality '${slug}' not found` });
  res.locals.muni = muni as Municipality;
  next();
}

// Auth guard — token must be for the correct muni OR a platform admin
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  const session = activeSessions.get(token);
  const muni = res.locals.muni as Municipality;
  if (!session) return res.status(401).json({ error: "Authentication required" });
  // Platform admins have universal access
  if (session.role === "platform") { res.locals.session = session; return next(); }
  // Municipal admins must match the tenant
  if (session.municipalityId !== muni.id) return res.status(401).json({ error: "Authentication required" });
  res.locals.session = session;
  next();
}

// Platform-admin-only guard
function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  const session = activeSessions.get(token);
  if (!session || session.role !== "platform") return res.status(403).json({ error: "Platform admin access required" });
  res.locals.session = session;
  next();
}

/**
 * RFC-4180-aware CSV line splitter. Handles quoted fields, commas inside
 * quotes, and escaped double-quotes. Returns trimmed, unquoted strings.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
        else inQuote = false;                           // end of quoted field
      } else { cur += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { fields.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
  }
  fields.push(cur.trim());
  return fields;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await runMigrations();
  await seedDatabase();

  // ── Health check (used by Railway and load balancers) ─────────────────────
  app.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));

  // ── Auth ──────────────────────────────────────────────────────────────────
  // ── Municipal admin login (email + password, scoped to one tenant) ────────
  app.post("/api/auth/login", resolveTenant, async (req, res) => {
    const { email, password } = req.body;
    const muni = res.locals.muni as Municipality;
    if (!password) return res.status(400).json({ error: "Password required" });

    // New path: email + password via admin_users table
    if (email) {
      const user = await storage.getAdminUserByEmail(email.trim().toLowerCase());
      if (!user) return res.status(401).json({ error: "Invalid email or password" });
      if (user.role !== "municipal" || user.municipalityId !== muni.id) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const valid = bcrypt.compareSync(password, user.passwordHash);
      if (!valid) return res.status(401).json({ error: "Invalid email or password" });
      const token = generateToken();
      activeSessions.set(token, { municipalityId: muni.id, role: "municipal", email: user.email });
      return res.json({ token, municipalityId: muni.id, slug: muni.slug, name: muni.name, role: "municipal", email: user.email });
    }

    // Legacy path: password-only (backwards compat for existing muni admins)
    const valid = bcrypt.compareSync(password, muni.adminPasswordHash);
    if (!valid) return res.status(401).json({ error: "Invalid password" });
    const token = generateToken();
    activeSessions.set(token, { municipalityId: muni.id, role: "municipal", email: "" });
    res.json({ token, municipalityId: muni.id, slug: muni.slug, name: muni.name, role: "municipal", email: "" });
  });

  // ── Platform admin login (email + password, universal access) ────────────
  app.post("/api/auth/platform-login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const user = await storage.getAdminUserByEmail(email.trim().toLowerCase());
    if (!user || user.role !== "platform") return res.status(401).json({ error: "Invalid email or password" });
    const valid = bcrypt.compareSync(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid email or password" });
    const token = generateToken();
    activeSessions.set(token, { municipalityId: null, role: "platform", email: user.email });
    res.json({ token, role: "platform", email: user.email });
  });

  // ── Session info (so frontend can query current role/email) ──────────────
  app.get("/api/auth/session", (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.json({ authenticated: false });
    const session = activeSessions.get(token);
    if (!session) return res.json({ authenticated: false });
    res.json({ authenticated: true, role: session.role, email: session.email, municipalityId: session.municipalityId });
  });

  app.post("/api/auth/logout", resolveTenant, (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) activeSessions.delete(token);
    res.json({ success: true });
  });

  // ── Onboarding: register a new municipality (creates pending request) ──────
  app.post("/api/onboard", async (req, res) => {
    try {
      const { name, state, population, fiscalYear, contactEmail, contactPhone, website, password, adminEmail } = req.body;
      if (!name || !state || !population || !password) {
        return res.status(400).json({ error: "Name, state, population, and password are required" });
      }
      if (!adminEmail || !adminEmail.includes("@")) {
        return res.status(400).json({ error: "A valid admin email address is required" });
      }
      // Generate slug
      let baseSlug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${state.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      let slug = baseSlug;
      let counter = 1;
      while (await storage.getMunicipalityBySlug(slug)) {
        slug = `${baseSlug}-${counter++}`;
      }
      const adminPasswordHash = bcrypt.hashSync(password, 10);
      // Create municipality with approval_status = "pending" and listed = false
      const muni = await storage.createMunicipality({
        slug,
        name,
        state,
        population: parseInt(population),
        fiscalYear: normalizeYear(fiscalYear) || "2026",
        contactEmail: contactEmail || adminEmail,
        contactPhone: contactPhone || null,
        website: website || null,
        lastUpdated: new Date().toISOString(),
        adminPasswordHash,
        revenuePublished: false,
        departmentsPublished: false,
        projectsPublished: false,
        onboardingComplete: false,
        listed: false,
        approvalStatus: "pending",
      } as any);
      // Create the admin user record
      await storage.createAdminUser({
        email: adminEmail.trim().toLowerCase(),
        passwordHash: adminPasswordHash,
        role: "municipal",
        municipalityId: muni.id,
        createdAt: new Date().toISOString(),
      });
      // No auto-login for pending municipalities — they must wait for approval
      res.json({ pending: true, municipality: { id: muni.id, name: muni.name, slug: muni.slug, approvalStatus: "pending" } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Platform admin: list pending municipalities ────────────────────────────
  app.get("/api/admin/pending-municipalities", requirePlatformAdmin, async (_req, res) => {
    try {
      const pending = await storage.getPendingMunicipalities();
      res.json(pending);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Platform admin: approve or reject a municipality ─────────────────────
  app.post("/api/admin/municipalities/:id/approval", requirePlatformAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body; // "approved" | "rejected"
      if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "status must be approved or rejected" });
      await storage.approveMunicipality(id, status);
      res.json({ success: true, status });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Platform admin: list all municipalities ───────────────────────────────
  app.get("/api/admin/municipalities", requirePlatformAdmin, async (_req, res) => {
    try {
      const all = await storage.getAllMunicipalities();
      res.json(all);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/municipalities/:id/admins", requirePlatformAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const users = await storage.getAdminUsersByMunicipality(id);
      // Strip password hashes before returning
      res.json(users.map(({ passwordHash: _h, ...u }) => u));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Public municipality directory ─────────────────────────────────────────
  app.get("/api/municipalities", async (req, res) => {
    const listed = await storage.getListedMunicipalities();
    const stateFilter = (req.query.state as string)?.toLowerCase();
    const filtered = stateFilter
      ? listed.filter(m => m.state.toLowerCase() === stateFilter)
      : listed;
    const safe = filtered.map(({ adminPasswordHash, ...m }) => m);
    res.json(safe);
  });

  app.get("/api/municipalities/states", async (_req, res) => {
    const listed = await storage.getListedMunicipalities();
    const states = [...new Set(listed.map(m => m.state))].sort();
    res.json(states);
  });

  // ── Municipality info ─────────────────────────────────────────────────────
  app.get("/api/municipality", resolveTenant, (req, res) => {
    const muni = res.locals.muni as Municipality;
    // Strip password hash before sending to client
    const { adminPasswordHash, ...safe } = muni;
    res.json(safe);
  });

  app.patch("/api/municipality", resolveTenant, requireAuth, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const { adminPasswordHash, ...allowed } = req.body; // never let client overwrite hash directly
    if (req.body.password) {
      allowed.adminPasswordHash = bcrypt.hashSync(req.body.password, 10);
    }
    allowed.lastUpdated = new Date().toISOString();
    const updated = await storage.updateMunicipality(muni.id, allowed);
    const { adminPasswordHash: _h, ...safe } = updated;
    res.json(safe);
  });

  // ── Population figures (year-tagged) ──────────────────────────────────────
  app.get("/api/population", resolveTenant, requireAuth, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const figures = await storage.getPopulationFigures(muni.id);
    res.json(figures);
  });

  app.post("/api/population", resolveTenant, requireAuth, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const { year, population } = req.body;
      if (!year || !population || isNaN(parseInt(population))) {
        return res.status(400).json({ error: "year and population (number) required" });
      }
      const fig = await storage.upsertPopulationFigure(muni.id, normalizeYear(year), parseInt(population));
      // Keep the legacy municipalities.population in sync with the latest figure
      const figures = await storage.getPopulationFigures(muni.id);
      if (figures.length > 0) {
        await storage.updateMunicipality(muni.id, { population: figures[0].population });
      }
      res.json(fig);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/population/:id", resolveTenant, requireAuth, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "invalid id" });
      await storage.deletePopulationFigure(id, muni.id);
      // Sync legacy field
      const figures = await storage.getPopulationFigures(muni.id);
      await storage.updateMunicipality(muni.id, { population: figures.length > 0 ? figures[0].population : 0 });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Publish toggles ───────────────────────────────────────────────────────
  app.post("/api/publish", resolveTenant, requireAuth, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const { section, published } = req.body; // section: "revenue" | "departments" | "projects"
    const fieldMap: Record<string, keyof typeof muni> = {
      revenue: "revenuePublished",
      departments: "departmentsPublished",
      projects: "projectsPublished",
    };
    const field = fieldMap[section];
    if (!field) return res.status(400).json({ error: "Invalid section" });
    await storage.updateMunicipality(muni.id, { [field]: published });
    res.json({ success: true, section, published });
  });

  // ── Directory listing toggle ──────────────────────────────────────────
  app.post("/api/listing", resolveTenant, requireAuth, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const { listed } = req.body;
    if (typeof listed !== "boolean") return res.status(400).json({ error: "listed must be a boolean" });
    await storage.updateMunicipality(muni.id, { listed });
    res.json({ success: true, listed });
  });

  // ── Available years ───────────────────────────────────────────────────────
  app.get("/api/years", resolveTenant, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const years = await storage.getAvailableYears(muni.id);
    res.json(years);
  });

  app.delete("/api/years/:year", resolveTenant, requireAuth, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const year = normalizeYear(req.params.year);
    if (!/^\d{4}$/.test(year)) return res.status(400).json({ error: "Invalid year" });
    try {
      const result = await storage.deleteDataByYear(muni.id, year);
      res.json({ success: true, year, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/uploads/:id/records", resolveTenant, requireAuth, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const batchId = Number(req.params.id);
    if (isNaN(batchId)) return res.status(400).json({ error: "Invalid batch id" });
    try {
      const records = await storage.getImportBatchRecords(batchId, muni.id);
      res.json(records.map(r => ({ id: r.id, data: JSON.parse(r.recordJson) })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Revenue ───────────────────────────────────────────────────────────────
  app.get("/api/revenue/:year", resolveTenant, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const sources = await storage.getRevenueSources(muni.id, normalizeYear(req.params.year));
    res.json(sources);
  });

  app.get("/api/revenue", resolveTenant, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const sources = await storage.getAllRevenueSources(muni.id);
    res.json(sources);
  });

  // ── Departments ───────────────────────────────────────────────────────────
  app.get("/api/departments/:year", resolveTenant, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const budgets = await storage.getDepartmentBudgets(muni.id, normalizeYear(req.params.year));
    res.json(budgets);
  });

  app.get("/api/departments", resolveTenant, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const budgets = await storage.getAllDepartmentBudgets(muni.id);
    res.json(budgets);
  });

  // ── Projects ──────────────────────────────────────────────────────────────
  app.get("/api/projects", resolveTenant, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const projects = await storage.getCapitalProjects(muni.id);
    res.json(projects);
  });

  // ── Row-level PATCH / DELETE for revenue, departments, projects ──────────
  app.patch("/api/revenue/:id", resolveTenant, requireAuth, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const id = parseInt(req.params.id as string);
    const { source, category, budgetedAmount, collectedAmount } = req.body;
    const data: any = {};
    if (source !== undefined) data.source = source;
    if (category !== undefined) data.category = category;
    if (budgetedAmount !== undefined) data.budgetedAmount = parseFloat(budgetedAmount);
    if (collectedAmount !== undefined) data.collectedAmount = parseFloat(collectedAmount);
    const updated = await storage.updateRevenueSource(id, muni.id, data);
    res.json(updated);
  });

  app.delete("/api/revenue/:id", resolveTenant, requireAuth, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    await storage.deleteRevenueSource(parseInt(req.params.id as string), muni.id);
    res.json({ success: true });
  });

  app.patch("/api/departments/:id", resolveTenant, requireAuth, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const id = parseInt(req.params.id as string);
    const { department, category, budgetedAmount, spentAmount } = req.body;
    const data: any = {};
    if (department !== undefined) data.department = department;
    if (category !== undefined) data.category = category;
    if (budgetedAmount !== undefined) data.budgetedAmount = parseFloat(budgetedAmount);
    if (spentAmount !== undefined) data.spentAmount = parseFloat(spentAmount);
    const updated = await storage.updateDepartmentBudget(id, muni.id, data);
    res.json(updated);
  });

  app.delete("/api/departments/:id", resolveTenant, requireAuth, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    await storage.deleteDepartmentBudget(parseInt(req.params.id as string), muni.id);
    res.json({ success: true });
  });

  app.patch("/api/projects/:id", resolveTenant, requireAuth, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const id = parseInt(req.params.id as string);
    const { name, department, totalBudget, spentToDate, percentComplete, startDate, expectedEnd, status, description } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (department !== undefined) data.department = department;
    if (totalBudget !== undefined) data.totalBudget = parseFloat(totalBudget);
    if (spentToDate !== undefined) data.spentToDate = parseFloat(spentToDate);
    if (percentComplete !== undefined) data.percentComplete = parseInt(percentComplete);
    if (startDate !== undefined) data.startDate = startDate;
    if (expectedEnd !== undefined) data.expectedEnd = expectedEnd;
    if (status !== undefined) data.status = status;
    if (description !== undefined) data.description = description;
    const updated = await storage.updateCapitalProject(id, muni.id, data);
    res.json(updated);
  });

  app.delete("/api/projects/:id", resolveTenant, requireAuth, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    await storage.deleteCapitalProject(parseInt(req.params.id as string), muni.id);
    res.json({ success: true });
  });

  // ── Create new records ──────────────────────────────────────────────────────
  app.post("/api/revenue", resolveTenant, requireAuth, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const { source, category, budgetedAmount, collectedAmount, year } = req.body;
      if (!source || !category || !year) return res.status(400).json({ error: "source, category, and year are required" });
      const row = await storage.createRevenueSource({
        municipalityId: muni.id,
        year: String(year),
        source: String(source),
        category: String(category),
        budgetedAmount: Number(budgetedAmount) || 0,
        collectedAmount: Number(collectedAmount) || 0,
      });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/departments", resolveTenant, requireAuth, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const { department, category, budgetedAmount, spentAmount, year } = req.body;
      if (!department || !category || !year) return res.status(400).json({ error: "department, category, and year are required" });
      const row = await storage.createDepartmentBudget({
        municipalityId: muni.id,
        year: String(year),
        department: String(department),
        category: String(category),
        budgetedAmount: Number(budgetedAmount) || 0,
        spentAmount: Number(spentAmount) || 0,
      });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/projects", resolveTenant, requireAuth, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const { name, department, totalBudget, spentToDate, percentComplete, startDate, expectedEnd, status, description } = req.body;
      if (!name || !department) return res.status(400).json({ error: "name and department are required" });
      const row = await storage.createCapitalProject({
        municipalityId: muni.id,
        name: String(name),
        department: String(department),
        totalBudget: Number(totalBudget) || 0,
        spentToDate: Number(spentToDate) || 0,
        percentComplete: Math.min(100, Math.max(0, parseInt(percentComplete) || 0)),
        startDate: String(startDate || new Date().toISOString().slice(0, 10)),
        expectedEnd: String(expectedEnd || new Date().toISOString().slice(0, 10)),
        status: String(status || "planned"),
        description: description ? String(description) : null,
      });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Bulk commit (apply many row-level changes at once) ────────────────────
  app.post("/api/bulk-edit", resolveTenant, requireAuth, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const { changes } = req.body;
      if (!Array.isArray(changes)) return res.status(400).json({ error: "changes must be an array" });
      const results: any[] = [];
      for (const change of changes) {
        const { type, id, action, data } = change;
        if (action === "update") {
          if (type === "revenue") {
            const d: any = {};
            if (data.source !== undefined) d.source = data.source;
            if (data.category !== undefined) d.category = data.category;
            if (data.budgetedAmount !== undefined) d.budgetedAmount = parseFloat(data.budgetedAmount);
            if (data.collectedAmount !== undefined) d.collectedAmount = parseFloat(data.collectedAmount);
            results.push(await storage.updateRevenueSource(id, muni.id, d));
          } else if (type === "department") {
            const d: any = {};
            if (data.department !== undefined) d.department = data.department;
            if (data.category !== undefined) d.category = data.category;
            if (data.budgetedAmount !== undefined) d.budgetedAmount = parseFloat(data.budgetedAmount);
            if (data.spentAmount !== undefined) d.spentAmount = parseFloat(data.spentAmount);
            results.push(await storage.updateDepartmentBudget(id, muni.id, d));
          } else if (type === "project") {
            const d: any = {};
            if (data.name !== undefined) d.name = data.name;
            if (data.department !== undefined) d.department = data.department;
            if (data.totalBudget !== undefined) d.totalBudget = parseFloat(data.totalBudget);
            if (data.spentToDate !== undefined) d.spentToDate = parseFloat(data.spentToDate);
            if (data.percentComplete !== undefined) d.percentComplete = parseInt(data.percentComplete);
            if (data.startDate !== undefined) d.startDate = data.startDate;
            if (data.expectedEnd !== undefined) d.expectedEnd = data.expectedEnd;
            if (data.status !== undefined) d.status = data.status;
            if (data.description !== undefined) d.description = data.description;
            results.push(await storage.updateCapitalProject(id, muni.id, d));
          }
        } else if (action === "delete") {
          if (type === "revenue") await storage.deleteRevenueSource(id, muni.id);
          else if (type === "department") await storage.deleteDepartmentBudget(id, muni.id);
          else if (type === "project") await storage.deleteCapitalProject(id, muni.id);
          results.push({ deleted: id, type });
        }
      }
      res.json({ success: true, applied: results.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Field options (controlled vocabulary) ───────────────────────────────
  app.get("/api/field-options", resolveTenant, requireAuth, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const fieldType = req.query.type as string | undefined;
      const options = await storage.getFieldOptions(muni.id, fieldType);
      res.json(options);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/field-options", resolveTenant, requireAuth, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const { fieldType, value } = req.body;
      if (!fieldType || !value) return res.status(400).json({ error: "fieldType and value required" });
      const trimmed = value.trim();
      if (!trimmed) return res.status(400).json({ error: "value must not be empty" });
      const created = await storage.createFieldOption({ municipalityId: muni.id, fieldType, value: trimmed, isSystem: false });
      res.json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/field-options/:id", resolveTenant, requireAuth, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "invalid id" });
      await storage.deleteFieldOption(id, muni.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Upload history ────────────────────────────────────────────────────────
  app.get("/api/uploads", resolveTenant, requireAuth, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const history = await storage.getUploadHistory(muni.id);
    res.json(history);
  });

  // ── Dashboard summary ─────────────────────────────────────────────────────
  app.get("/api/summary/:year", resolveTenant, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const year = normalizeYear(req.params.year);
    const [deptBudgets, revSources, years, yearPopulation] = await Promise.all([
      storage.getDepartmentBudgets(muni.id, year),
      storage.getRevenueSources(muni.id, year),
      storage.getAvailableYears(muni.id),
      storage.getPopulationForYear(muni.id, year),
    ]);

    const totalBudgeted = deptBudgets.reduce((s, d) => s + d.budgetedAmount, 0);
    const totalSpent = deptBudgets.reduce((s, d) => s + d.spentAmount, 0);
    const totalRevenueBudgeted = revSources.reduce((s, r) => s + r.budgetedAmount, 0);
    const totalRevenueCollected = revSources.reduce((s, r) => s + r.collectedAmount, 0);

    const yearIndex = years.indexOf(year);
    let priorYearTotal = 0;
    if (yearIndex < years.length - 1) {
      const priorBudgets = await storage.getDepartmentBudgets(muni.id, years[yearIndex + 1]);
      priorYearTotal = priorBudgets.reduce((s, d) => s + d.budgetedAmount, 0);
    }

    const byDept: Record<string, { budgeted: number; spent: number }> = {};
    for (const d of deptBudgets) {
      if (!byDept[d.department]) byDept[d.department] = { budgeted: 0, spent: 0 };
      byDept[d.department].budgeted += d.budgetedAmount;
      byDept[d.department].spent += d.spentAmount;
    }
    const departments = Object.entries(byDept)
      .map(([name, vals]) => ({ name, ...vals }))
      .sort((a, b) => b.budgeted - a.budgeted);

    res.json({
      totalBudget: totalBudgeted,
      totalSpent,
      totalRevenueBudgeted,
      totalRevenueCollected,
      yoyChange: priorYearTotal > 0 ? ((totalBudgeted - priorYearTotal) / priorYearTotal) * 100 : 0,
      percentSpent: totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0,
      budgetReserve: totalBudgeted > 0 ? ((totalBudgeted - totalSpent) / totalBudgeted) * 100 : 0,
      costPerResident: yearPopulation > 0 ? totalBudgeted / yearPopulation : 0,
      revenueEfficiency: totalRevenueBudgeted > 0 ? (totalRevenueCollected / totalRevenueBudgeted) * 100 : 0,
      departments,
      topDepartments: departments.slice(0, 3).map(d => d.name),
      population: yearPopulation,
      municipalityName: muni.name,
      publishStatus: {
        revenue: muni.revenuePublished,
        departments: muni.departmentsPublished,
        projects: muni.projectsPublished,
      },
    });
  });

  // ── Data upload (CSV or Excel) ────────────────────────────────────────────
  app.post("/api/upload", resolveTenant, requireAuth, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const { data, type, format = "csv", columnMap, aiReviewLog } = req.body;
      const importMode: "append" | "overwrite" = req.body.importMode === "overwrite" ? "overwrite" : "append";
      const year: string = normalizeYear(req.body.year ?? "");
      if (!data || !type || !year) {
        return res.status(400).json({ error: "Missing data, type, or year" });
      }

      let rows: Record<string, string>[] = [];

      if (format === "xlsx" || format === "xls") {
        // data is base64-encoded file
        const buf = Buffer.from(data, "base64");
        const wb = XLSX.read(buf, { type: "buffer" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
      } else {
        // CSV text — use proper RFC-4180 splitter to handle quoted fields
        const lines = data.split("\n").filter((l: string) => l.trim());
        const headers = splitCsvLine(lines[0]);
        for (let i = 1; i < lines.length; i++) {
          const cols = splitCsvLine(lines[i]);
          if (cols.length >= 2) {
            const row: Record<string, string> = {};
            headers.forEach((h: string, idx: number) => { row[h] = cols[idx] ?? ""; });
            rows.push(row);
          }
        }
      }

      // Column mapping (user-defined or defaults)
      const cm = columnMap || {};
      const col = (row: Record<string, string>, key: string, defaultKeys: string[]): string => {
        if (cm[key]) return row[cm[key]] || "";
        for (const k of defaultKeys) {
          const found = Object.keys(row).find(h => h.toLowerCase() === k.toLowerCase());
          if (found) return row[found] || "";
        }
        return "";
      };

      let recordCount = 0;
      // Snapshot of imported records for history detail view
      const batchSnapshot: Record<string, unknown>[] = [];

      // Load controlled vocabulary for this municipality (system + custom)
      const foMap = await storage.getFieldOptionsMap(muni.id);

      if (type === "departments") {
        if (importMode === "overwrite") await storage.clearDepartmentBudgetsByYear(muni.id, year);
        for (const row of rows) {
          const rawDept = col(row, "department", ["department", "dept"]);
          const rawCat = col(row, "category", ["category", "sub-category", "subcategory", "line item"]);
          const budgetedAmount = parseFloat(col(row, "budgetedAmount", ["budgeted amount", "budgeted", "budget"])) || 0;
          const spentAmount = parseFloat(col(row, "spentAmount", ["spent amount", "spent", "actual", "expenditure"])) || 0;
          if (rawDept) {
            const deptResult = matchToAllowed(rawDept, foMap.department, "department");
            const catResult = matchToAllowed(rawCat || rawDept, foMap.dept_category, "dept_category");
            if (deptResult.isNew) await storage.ensureCustomFieldOption(muni.id, "department", deptResult.matched);
            if (catResult.isNew) await storage.ensureCustomFieldOption(muni.id, "dept_category", catResult.matched);
            const department = deptResult.matched;
            const category = catResult.matched;
            await storage.createDepartmentBudget({ municipalityId: muni.id, year, department, category, budgetedAmount, spentAmount });
            batchSnapshot.push({ Department: department, Category: category, "Budgeted Amount": budgetedAmount, "Spent Amount": spentAmount, Year: year });
            recordCount++;
          }
        }
      } else if (type === "revenue") {
        if (importMode === "overwrite") await storage.clearRevenueSourcesByYear(muni.id, year);
        for (const row of rows) {
          const rawSource = col(row, "source", ["source", "revenue source", "name"]);
          const rawCat = col(row, "category", ["category", "type", "revenue type"]);
          const budgetedAmount = parseFloat(col(row, "budgetedAmount", ["budgeted amount", "budgeted", "budget"])) || 0;
          const collectedAmount = parseFloat(col(row, "collectedAmount", ["collected amount", "collected", "actual", "received"])) || 0;
          if (rawSource) {
            const sourceResult = matchToAllowed(rawSource, foMap.source, "source");
            const catResult = matchToAllowed(rawCat || rawSource, foMap.rev_category, "rev_category");
            if (sourceResult.isNew) await storage.ensureCustomFieldOption(muni.id, "source", sourceResult.matched);
            if (catResult.isNew) await storage.ensureCustomFieldOption(muni.id, "rev_category", catResult.matched);
            const source = sourceResult.matched;
            const category = catResult.matched;
            await storage.createRevenueSource({ municipalityId: muni.id, year, source, category, budgetedAmount, collectedAmount });
            batchSnapshot.push({ Source: source, Category: category, "Budgeted Amount": budgetedAmount, "Collected Amount": collectedAmount, Year: year });
            recordCount++;
          }
        }
      } else if (type === "projects") {
        if (importMode === "overwrite") await storage.clearCapitalProjects(muni.id);
        for (const row of rows) {
          const name = col(row, "name", ["name", "project", "project name"]);
          const department = col(row, "department", ["department", "dept"]);
          const totalBudget = parseFloat(col(row, "totalBudget", ["total budget", "budget"])) || 0;
          const spentToDate = parseFloat(col(row, "spentToDate", ["spent to date", "spent", "actual"])) || 0;
          const percentComplete = parseInt(col(row, "percentComplete", ["percent complete", "% complete", "progress"])) || 0;
          const startDate = col(row, "startDate", ["start date", "start"]);
          const expectedEnd = col(row, "expectedEnd", ["expected end", "end date", "completion"]);
          const status = col(row, "status", ["status"]) || "on-track";
          const description = col(row, "description", ["description", "notes"]);
          if (name) {
            await storage.createCapitalProject({ municipalityId: muni.id, name, department: department || "General", totalBudget, spentToDate, percentComplete, startDate: startDate || new Date().toISOString().split("T")[0], expectedEnd: expectedEnd || new Date().toISOString().split("T")[0], status, description: description || null });
            batchSnapshot.push({ Name: name, Department: department || "General", "Total Budget": totalBudget, "Spent To Date": spentToDate, "Percent Complete": percentComplete, Status: status, Year: year });
            recordCount++;
          }
        }
      }

      const session = res.locals.session as SessionInfo | undefined;
      const historyEntry = await storage.createUploadHistory({
        municipalityId: muni.id,
        filename: `${type}_${year}.${format}`,
        uploadedAt: new Date().toISOString(),
        recordCount,
        status: "success",
        notes: `${importMode === "overwrite" ? "Replaced" : "Appended"} ${recordCount} ${type} records for ${year}${aiReviewLog ? " [AI-assisted]" : ""}`,
        dataType: type,
        year,
        uploadedBy: session?.email || "admin",
      });
      // Persist per-record snapshot for import history detail
      for (const rec of batchSnapshot) {
        await storage.createImportBatchRecord({ batchId: historyEntry.id, municipalityId: muni.id, recordJson: JSON.stringify(rec) });
      }

      // Mark onboarding complete if all sections have data
      const [hasRevenue, hasDepts] = await Promise.all([
        storage.getAllRevenueSources(muni.id),
        storage.getAllDepartmentBudgets(muni.id),
      ]);
      if (hasRevenue.length > 0 && hasDepts.length > 0 && !muni.onboardingComplete) {
        await storage.updateMunicipality(muni.id, { onboardingComplete: true });
      }

      res.json({ success: true, recordCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Preview upload (parse without saving) ─────────────────────────────────
  app.post("/api/upload/preview", resolveTenant, requireAuth, async (req, res) => {
    try {
      const { data, format = "csv" } = req.body;
      if (!data) return res.status(400).json({ error: "No data provided" });

      let rows: Record<string, string>[] = [];
      let headers: string[] = [];

      if (format === "xlsx" || format === "xls") {
        const buf = Buffer.from(data, "base64");
        const wb = XLSX.read(buf, { type: "buffer" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
        if (rows.length > 0) headers = Object.keys(rows[0]);
      } else {
        // Parse ALL rows (no artificial cap) using a proper CSV splitter that
        // handles quoted fields containing commas or embedded quotes.
        const lines = data.split("\n").filter((l: string) => l.trim());
        headers = splitCsvLine(lines[0]);
        for (let i = 1; i < lines.length; i++) {
          const cols = splitCsvLine(lines[i]);
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => { row[h] = cols[idx] ?? ""; });
          rows.push(row);
        }
      }

      res.json({ headers, preview: rows.slice(0, 5), totalRows: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Citizen Comments ──────────────────────────────────────────────────────
  app.get("/api/comments", resolveTenant, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    // Public: only approved comments
    const approved = await storage.getComments(muni.id, true);
    res.json(approved);
  });

  app.get("/api/comments/all", resolveTenant, requireAuth, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const all = await storage.getComments(muni.id);
    res.json(all);
  });

  app.post("/api/comments", resolveTenant, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const { section, name, email, message } = req.body;
      if (!message || !section) return res.status(400).json({ error: "Section and message are required" });
      const comment = await storage.createComment({
        municipalityId: muni.id,
        section,
        name: name || null,
        email: email || null,
        message,
        submittedAt: new Date().toISOString(),
        approved: false,
      });
      res.json({ success: true, id: comment.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/comments/:id/approve", resolveTenant, requireAuth, async (req, res) => {
    await storage.approveComment(parseInt(req.params.id as string));
    res.json({ success: true });
  });

  app.delete("/api/comments/:id", resolveTenant, requireAuth, async (req, res) => {
    await storage.deleteComment(parseInt(req.params.id as string));
    res.json({ success: true });
  });

  // ── Email subscribers ─────────────────────────────────────────────────────
  app.post("/api/subscribe", resolveTenant, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const { email } = req.body;
      if (!email || !email.includes("@")) return res.status(400).json({ error: "Valid email required" });
      const already = await storage.isSubscribed(muni.id, email);
      if (already) return res.json({ success: true, message: "Already subscribed" });
      await storage.createSubscriber({ municipalityId: muni.id, email, subscribedAt: new Date().toISOString(), active: true });
      res.json({ success: true, message: "Subscribed successfully" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/subscribers", resolveTenant, requireAuth, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const subscribers = await storage.getSubscribers(muni.id);
    res.json(subscribers);
  });

  // ── Budget documents ───────────────────────────────────────────────────────────────

  // ── AI document analysis ──────────────────────────────────────────────────
  //
  // 2-step pipeline:
  //   Step 1 — pdf-parse: extract raw text from the PDF buffer
  //   Step 2 — normalize: use heuristics to pull summary tables, detail rows,
  //            fiscal-year headers, totals, and currency/percent fields, then
  //            pass the structured excerpt + raw snippet to the AI for
  //            classification and gap-filling.
  //
  // Returns the richer proposal shape; never hard-fails (always returns skip
  // or partial on error).

  /**
   * Lightweight heuristic normalizer for municipal budget PDFs.
   * Handles Essex Junction-style layout: repeated column headers, NNN.NNN-Title
   * account codes, 210-XX-XX department codes, 8-column numeric tables.
   */
  function normalizePdfText(raw: string): {
    fiscalYears: string[];
    documentTitle: string;
    summaryTables: Array<{ header: string; rows: string[][] }>;
    detailRows: string[][];
    departmentHeaders: string[];
    candidateCategories: string[];
    excerpt: string;
  } {
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const fiscalYears: string[] = [];
    const summaryTables: Array<{ header: string; rows: string[][] }> = [];
    const detailRows: string[][] = [];
    const departmentHeaders: string[] = [];
    const candidateCategories: string[] = [];
    let documentTitle = "";

    // ── Deterministic patterns for Essex Junction / standard muni PDFs ────────

    // Column-header line guard: skip lines that ARE the repeated column header
    // e.g. "2023 Budget  2023  Actual  2024 Budget  2024  Actual  2025 Budget  2026 Budget  $ Change % Change"
    const COLUMN_HEADER_RE = /^(?:(?:20\d{2}\s*(?:Budget|Actual|Adopted|Proposed)|\$\s*Change|%\s*Change)[\s\t]+){3,}/i;

    // Account code pattern: NNN.NNN[A-Z]?-Title  (e.g. 010.000-Property Taxes, 800.10X-Essex Police)
    const ACCOUNT_CODE_RE = /^\d{3}\.\d{3}[A-Za-z]?[-–]/;

    // Department/fund section header: 210-XX-XX - Name  (e.g. 210-10-10 - Administration)
    const DEPT_HEADER_RE = /^\d{3}-\d{2}-\d{2}\s*[-–]\s*/;

    // Fiscal year patterns: FY26, FY2026, FY 2026, Fiscal Year 2026, 2025-2026
    const FY_RE = /\bFY\s*\d{2,4}\b|\b(?:Fiscal\s+Year\s+)?20\d{2}(?:[\s\-\/]20?\d{2})?\b/gi;

    // Section label patterns (mixed-case, standalone lines)
    const SECTION_LABEL_RE = /^(?:Revenues?|Expenditures?|Total\s+Revenues?|Total\s+Expenditures?|Net\s+(?:Revenue|Income|Change)|Fund\s+Balance|Surplus|Deficit)$/i;

    // Currency / numeric helpers
    const CURRENCY_RE = /\$[\d,]+(?:\.\d{1,2})?|\(\d[\d,]*(?:\.\d{1,2})?\)|\b[\d,]{4,}(?:\.\d{1,2})?\b/;
    const PCT_RE = /\b\d{1,3}\.?\d*\s*%|n\/a/i;

    // Title line: look for "FY26 General Fund Budget Summary/Detail" style
    const TITLE_RE = /^FY\s*\d{2,4}\s+.{5,60}$/i;

    // ── Pass 1: collect fiscal years, document title ──────────────────────────
    for (const l of lines) {
      // Document title (first matching line)
      if (!documentTitle && TITLE_RE.test(l)) {
        documentTitle = l;
      }
      // Fiscal years
      const m = l.match(FY_RE);
      if (m) {
        for (const hit of m) {
          const norm = normalizeYear(hit);
          if (norm && !fiscalYears.includes(norm)) fiscalYears.push(norm);
        }
      }
    }

    // ── Pass 2: parse rows ────────────────────────────────────────────────────
    let currentHeader = "";
    let currentBatch: string[][] = [];

    const flushBatch = () => {
      if (currentBatch.length === 0) return;
      if (currentBatch.length <= 5) {
        summaryTables.push({ header: currentHeader, rows: currentBatch });
      } else {
        for (const r of currentBatch) detailRows.push(r);
      }
      currentBatch = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];

      // ── Skip repeated column-header lines ─────────────────────────────────
      if (COLUMN_HEADER_RE.test(l)) continue;
      // Also skip if the line is nothing but year-words and whitespace
      if (/^(?:[\s\d%$BudgetActualAdoptedProposedChange]*){10,}$/.test(l) && !/[a-z]/i.test(l.replace(/budget|actual|adopted|proposed|change/gi, ""))) continue;

      // ── Department/fund section headers (210-XX-XX - Name) ────────────────
      if (DEPT_HEADER_RE.test(l)) {
        flushBatch();
        currentHeader = l;
        const name = l.replace(DEPT_HEADER_RE, "").trim();
        if (name && !departmentHeaders.includes(name)) departmentHeaders.push(name);
        continue;
      }

      // ── Section label lines (Revenues, Expenditures, Total …) ─────────────
      if (SECTION_LABEL_RE.test(l)) {
        flushBatch();
        currentHeader = l;
        continue;
      }

      // ── All-caps section headers ───────────────────────────────────────────
      if (/^[A-Z][A-Z \-&]{3,}$/.test(l) && !CURRENCY_RE.test(l)) {
        flushBatch();
        currentHeader = l;
        continue;
      }

      const nums = l.match(/[\d,.()/]+/g) || [];
      const hasCurrency = CURRENCY_RE.test(l);
      const hasPct = PCT_RE.test(l);
      const numCount = nums.filter(n => /^[\d,]+(\.\d+)?$/.test(n.replace(/[(),]/g, ""))).length;

      // ── Account code rows: NNN.NNN-Title …numbers ────────────────────────
      if (ACCOUNT_CODE_RE.test(l)) {
        const cells = l.split(/\s{2,}|\t/).map(c => c.trim()).filter(Boolean);
        if (cells.length >= 2) {
          currentBatch.push(cells);
          // Account title is the label portion before first large number
          const label = l.replace(ACCOUNT_CODE_RE, "").split(/\s{2,}|\t/)[0]?.trim();
          if (label && label.length > 1 && label.length < 80 && !candidateCategories.includes(label)) {
            candidateCategories.push(label);
          }
        }
        continue;
      }

      // ── Generic numeric row: 3+ currency-like numbers ─────────────────────
      if (numCount >= 3 && (hasCurrency || hasPct || numCount >= 4)) {
        // Skip if this looks like a bare totals-only row with no label text
        // (those are captured but not added to candidateCategories)
        const cells = l.split(/\s{2,}|\t|\|/).map(c => c.trim()).filter(Boolean);
        if (cells.length >= 2) {
          currentBatch.push(cells);
          const textCell = cells.find(c => /[A-Za-z]/.test(c) && !/^(FY|20)/.test(c));
          if (textCell && textCell.length > 2 && textCell.length < 80 && !candidateCategories.includes(textCell)) {
            candidateCategories.push(textCell);
          }
        }
      }
    }
    flushBatch();

    // ── Build excerpt: skip the first column-header blob, use first data rows ─
    // Find the first non-header content line and take up to 3000 chars from there
    let excerptStart = 0;
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      if (!COLUMN_HEADER_RE.test(lines[i]) && lines[i].length > 5) {
        excerptStart = raw.indexOf(lines[i]);
        break;
      }
    }
    // Include document title + first data section (up to 3000 chars)
    const excerptRaw = (documentTitle ? documentTitle + "\n" : "") + raw.slice(excerptStart);
    const excerpt = excerptRaw.slice(0, 3000).trim();

    return {
      fiscalYears: fiscalYears.slice(0, 5),
      documentTitle,
      summaryTables: summaryTables.slice(0, 8),
      detailRows: detailRows.slice(0, 40),
      departmentHeaders: departmentHeaders.slice(0, 20),
      candidateCategories: candidateCategories.slice(0, 25),
      excerpt,
    };
  }


  // ── AI Budget Chatbot ─────────────────────────────────────────────────────────
  //
  // POST /api/chat — unified chatbot endpoint for Import Budget Data.
  // Accepts a conversation history + optional base64 PDF attachment.
  // Returns one of three modes:
  //   import_proposal  — structured rows matching the 5-column importer schema
  //   needs_clarification — follow-up questions before proposing rows
  //   answer           — plain-text answer to a general app question
  //
  app.post("/api/chat", resolveTenant, requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) return res.status(503).json({ error: "AI not configured" });

      const { messages = [], fileData, fileName, mimeType } = req.body as {
        messages: Array<{ role: "user" | "assistant"; content: string }>;
        fileData?: string;   // base64
        fileName?: string;
        mimeType?: string;
      };

      // ── Extract PDF text if a file is attached ──────────────────────────────
      let pdfContext = "";
      if (fileData && mimeType === "application/pdf") {
        try {
          const buf = Buffer.from(fileData, "base64");
          const parsed = await pdfParse(buf);
          const rawText = (parsed.text || "").slice(0, 24000).trim();
          console.log(`[chat] pdf-parse: ${parsed.numpages} pages, ${rawText.length} chars`);
          if (rawText) {
            const norm = normalizePdfText(rawText);
            pdfContext = [
              norm.documentTitle ? `Document: ${norm.documentTitle}` : `File: ${fileName || "attached PDF"}`,
              norm.fiscalYears.length ? `Years detected: ${norm.fiscalYears.join(", ")}` : "",
              norm.departmentHeaders.length ? `Departments/funds: ${norm.departmentHeaders.slice(0, 12).join(", ")}` : "",
              norm.candidateCategories.length ? `Line items: ${norm.candidateCategories.slice(0, 16).join(", ")}` : "",
              `\n--- RAW TEXT EXCERPT (first 4000 chars, column headers stripped) ---\n${norm.excerpt.slice(0, 4000)}`,
            ].filter(Boolean).join("\n");
          }
        } catch (pdfErr: any) {
          console.error("[chat] pdf-parse error:", pdfErr?.message);
          pdfContext = `(PDF attached: ${fileName || "file"} — text extraction failed, may be scanned)`;
        }
      } else if (fileData && mimeType && !mimeType.includes("pdf")) {
        pdfContext = `(Non-PDF file attached: ${fileName || "file"}, type: ${mimeType} — text not extracted)`;
      }

      // ── System prompt ────────────────────────────────────────────────────────
      const muni = res.locals.muni as Municipality;
      // Inject municipality's current allowed values so AI uses them
      const foMapChat = await storage.getFieldOptionsMap(muni.id);
      const allowedDepts = foMapChat.department.join(", ");
      const allowedSources = foMapChat.source.join(", ");
      const allowedDeptCats = foMapChat.dept_category.join(", ");
      const allowedRevCats = foMapChat.rev_category.join(", ");

      const SYSTEM = `You are a budget import assistant for a municipal budget transparency dashboard.
You help administrators analyze financial data and prepare it for import.

The importer supports three data types. Detect the correct type from the data provided:

TYPE: "departments" — department expenditure budgets
  Columns: Department | Category | Budgeted Amount | Spent Amount | Year
  - Department = high-level dept. PREFER one of these allowed values: ${allowedDepts}. Use the closest match; only use a different value if none fit.
  - Category = subcategory/line item. PREFER one of these allowed values: ${allowedDeptCats}. Use the closest match; only use a different value if none fit.
  - Budgeted Amount = approved budget, plain number, no $ or commas
  - Spent Amount = actual/YTD spent if available, else null
  - Year = plain numeric year ONLY (e.g. 2026). Strip any prefix: "FY2026" → 2026, "Fiscal Year 2026" → 2026.

TYPE: "revenue" — revenue sources / incoming funds
  Columns: Source | Category | Budgeted Amount | Collected Amount | Year
  - Source = revenue source name. PREFER one of these allowed values: ${allowedSources}. Use the closest match; only use a different value if none fit.
  - Category = revenue category. PREFER one of these allowed values: ${allowedRevCats}. Use the closest match; only use a different value if none fit.
  - Budgeted Amount = projected revenue, plain number
  - Collected Amount = actual revenue collected if available, else null
  - Year = plain numeric year ONLY (e.g. 2026). Strip any prefix.

TYPE: "projects" — capital projects
  Columns: Name | Department | Total Budget | Spent To Date | Percent Complete | Status | Year
  - Name = project name
  - Department = owning department
  - Total Budget = total project budget, plain number
  - Spent To Date = amount spent so far, plain number
  - Percent Complete = integer 0-100
  - Status = one of: on-track | at-risk | behind
  - Year = plain numeric year ONLY (e.g. 2026)

Detection rules:
- If the data is labelled "Revenues", "Revenue Sources", "Incoming", use type "revenue"
- If the data is labelled "Expenditures", "Appropriations", "Expenses", "Spending", use type "departments"
- If rows describe multi-year projects with completion %, use type "projects"
- If the data contains BOTH revenue and expenditure sections, propose the larger section first and note the other exists
- YEAR RULE: Always output Year as a plain 4-digit number (e.g. 2026). Never output "FY2026", "FY 2026", "Fiscal Year 2026", or any prefixed form. If you cannot confidently determine the year, set Year to null and include a clarifying question in the questions array.

When the admin provides financial data, analyze it and either:
1. Return proposed import rows (if you have enough data), OR
2. Ask ONE concise clarifying question (e.g. "This data has both revenue and expenditure sections. Which would you like to import first?")

CRITICAL — after clarification:
If earlier in this conversation the admin provided data AND asked a clarifying question, and the user has now answered that question (e.g. selected a data type, year, or fund), you MUST immediately return an import_proposal with rows — NEVER reply with "Done.", "OK", or any plain text acknowledgement. Go back to the data in the conversation history and produce the rows right now.

If no data is provided anywhere in the conversation, answer general app questions concisely (1-4 sentences).

RESPONSE FORMAT — valid JSON only, no markdown, no prose:

For import proposal:
{"mode":"import_proposal","dataType":"departments","confidence":0.0,"questions":[],"rows":[...],"notes":[]}

dataType must be exactly one of: "departments" | "revenue" | "projects"

For departments rows use: {"Department":"","Category":"","Budgeted Amount":null,"Spent Amount":null,"Year":""}
For revenue rows use:     {"Source":"","Category":"","Budgeted Amount":null,"Collected Amount":null,"Year":""}
For projects rows use:    {"Name":"","Department":"","Total Budget":null,"Spent To Date":null,"Percent Complete":null,"Status":"on-track","Year":""}

For clarification needed:
{"mode":"needs_clarification","dataType":null,"confidence":0.0,"questions":["..."],"rows":[],"notes":[]}

For general answers:
{"mode":"answer","text":"...","rows":[],"notes":[]}

Do NOT search the web. Use only the text provided.
AGGREGATION RULE: Each combination of grouping fields must appear as exactly ONE row. For revenue: group by Source + Category + Year, SUM the Budgeted Amount and Collected Amount. For departments: group by Department + Category + Year, SUM the amounts. NEVER output multiple rows with the same Source/Department + Category + Year — always merge them into one row with summed totals.
Never auto-import. Return rows for admin review only.`;

      // ── Build message list for API ───────────────────────────────────────────
      // The last user message might need the PDF context appended
      const apiMessages: Array<{ role: string; content: string }> = [];
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (i === messages.length - 1 && m.role === "user" && pdfContext) {
          apiMessages.push({
            role: "user",
            content: m.content
              ? `${m.content}\n\nATTACHED DOCUMENT CONTEXT:\n${pdfContext}`
              : `Please analyze this budget document and propose import rows.\n\nATTACHED DOCUMENT CONTEXT:\n${pdfContext}`,
          });
        } else {
          apiMessages.push({ role: m.role, content: m.content });
        }
      }

      // If only a file was provided with no messages, seed the first message
      if (apiMessages.length === 0 && pdfContext) {
        apiMessages.push({
          role: "user",
          content: `Please analyze this budget document and propose import rows.\n\nATTACHED DOCUMENT CONTEXT:\n${pdfContext}`,
        });
      }

      // ── Call Perplexity ──────────────────────────────────────────────────────
      // Use sonar-reasoning-pro: chain-of-thought reasoning, replaces deprecated r1-1776.
      // System prompt goes in the messages array (role: "system") per Perplexity API spec.
      const aiRes = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar-reasoning-pro",
          messages: [{ role: "system", content: SYSTEM }, ...apiMessages],
          max_tokens: 4096,
          temperature: 0,
        }),
      });

      if (!aiRes.ok) {
        const errBody = await aiRes.text();
        console.error("[chat] Perplexity error:", aiRes.status, errBody);
        return res.status(502).json({ error: "AI service error" });
      }

      const aiJson = await aiRes.json();
      const rawContent: string = aiJson.choices?.[0]?.message?.content ?? "";

      // ── Parse JSON response ──────────────────────────────────────────────────
      // sonar-reasoning-pro wraps its chain-of-thought in <think>...</think> before the JSON.
      // Strip that block first so the JSON regex doesn't match { inside the reasoning chain.
      let contentAfterThink = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

      // Strip markdown code fences (```json ... ```) that some models wrap around JSON
      contentAfterThink = contentAfterThink.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

      const jsonMatch = contentAfterThink.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // AI returned plain text — wrap it as an answer
        return res.json({ mode: "answer", text: contentAfterThink || rawContent.trim(), rows: [], notes: [] });
      }

      let parsed: any;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // ── JSON repair: attempt to fix truncated responses ─────────────────
        let repaired = jsonMatch[0];
        // Remove trailing truncated string value (ends mid-word without closing quote)
        repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*"[^"]*$/, "");
        repaired = repaired.replace(/,\s*"[^"]*$/, "");
        // Count and close unclosed brackets/braces
        const opens = (s: string, ch: string) => (s.match(new RegExp(ch === "[" ? "\\[" : "\\{", "g")) || []).length;
        const closes = (s: string, ch: string) => (s.match(new RegExp(ch === "]" ? "\\]" : "\\}", "g")) || []).length;
        const missingBrackets = opens(repaired, "[") - closes(repaired, "]");
        const missingBraces = opens(repaired, "{") - closes(repaired, "}");
        for (let i = 0; i < missingBrackets; i++) repaired += "]";
        for (let i = 0; i < missingBraces; i++) repaired += "}";
        try {
          parsed = JSON.parse(repaired);
          console.log("[chat] JSON repair succeeded");
        } catch {
          console.error("[chat] JSON repair failed, returning as answer text");
          return res.json({ mode: "answer", text: contentAfterThink || rawContent.trim(), rows: [], notes: [] });
        }
      }

      // ── Validate + coerce ────────────────────────────────────────────────────
      const mode = ["import_proposal", "needs_clarification", "answer"].includes(parsed.mode)
        ? parsed.mode : "answer";

      if (mode === "import_proposal") {
        if (!Array.isArray(parsed.rows)) parsed.rows = [];
        // Coerce each row to the correct schema based on detected dataType
        const dt = parsed.dataType;
        const numField = (r: any, ...keys: string[]) => {
          for (const k of keys) {
            if (r[k] != null && r[k] !== "") return Number(String(r[k]).replace(/[^\d.-]/g, "")) || null;
          }
          return null;
        };
        const strField = (r: any, ...keys: string[]) => {
          for (const k of keys) {
            if (r[k] != null && String(r[k]).trim() !== "") return String(r[k]).trim();
          }
          return "";
        };
        if (dt === "revenue") {
          parsed.rows = parsed.rows.map((r: any) => ({
            "Source":           strField(r, "Source", "source", "Name", "name"),
            "Category":         strField(r, "Category", "category"),
            "Budgeted Amount":  numField(r, "Budgeted Amount", "budgeted_amount", "budget"),
            "Collected Amount": numField(r, "Collected Amount", "collected_amount", "actual", "collected"),
            "Year":             strField(r, "Year", "year"),
          }));
        } else if (dt === "projects") {
          parsed.rows = parsed.rows.map((r: any) => ({
            "Name":             strField(r, "Name", "name"),
            "Department":       strField(r, "Department", "department"),
            "Total Budget":     numField(r, "Total Budget", "total_budget", "budget"),
            "Spent To Date":    numField(r, "Spent To Date", "spent_to_date", "spent"),
            "Percent Complete": numField(r, "Percent Complete", "percent_complete", "progress"),
            "Status":           strField(r, "Status", "status") || "on-track",
            "Year":             strField(r, "Year", "year"),
          }));
        } else {
          // departments (default)
          parsed.rows = parsed.rows.map((r: any) => ({
            "Department":      strField(r, "Department", "department"),
            "Category":        strField(r, "Category", "category"),
            "Budgeted Amount": numField(r, "Budgeted Amount", "budgeted_amount", "budget"),
            "Spent Amount":    numField(r, "Spent Amount", "spent_amount", "actual", "spent"),
            "Year":            strField(r, "Year", "year"),
          }));
        }
        // ── Aggregate duplicate rows ──────────────────────────────────────────
        // AI sometimes returns individual line items instead of aggregated totals.
        // Merge rows that share the same grouping key, summing numeric amounts.
        if (dt === "revenue" || dt === "departments" || !dt) {
          const keyFields = dt === "revenue"
            ? ["Source", "Category", "Year"]
            : ["Department", "Category", "Year"];
          const sumFields = dt === "revenue"
            ? ["Budgeted Amount", "Collected Amount"]
            : ["Budgeted Amount", "Spent Amount"];
          const grouped = new Map<string, any>();
          for (const row of parsed.rows) {
            const key = keyFields.map(k => String(row[k] ?? "").toLowerCase().trim()).join("|");
            if (grouped.has(key)) {
              const existing = grouped.get(key);
              for (const sf of sumFields) {
                const a = typeof existing[sf] === "number" ? existing[sf] : 0;
                const b = typeof row[sf] === "number" ? row[sf] : 0;
                existing[sf] = a + b || null;
              }
            } else {
              grouped.set(key, { ...row });
            }
          }
          parsed.rows = Array.from(grouped.values());
        }

        parsed.confidence = typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.7;
        parsed.questions = Array.isArray(parsed.questions) ? parsed.questions : [];
        parsed.notes = Array.isArray(parsed.notes) ? parsed.notes : [];
      } else if (mode === "needs_clarification") {
        parsed.rows = [];
        parsed.questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 2) : [];
        parsed.notes = Array.isArray(parsed.notes) ? parsed.notes : [];
      } else {
        // answer mode
        parsed.text = parsed.text ?? rawContent.trim();
        parsed.rows = [];
        parsed.notes = Array.isArray(parsed.notes) ? parsed.notes : [];
      }

      parsed.mode = mode;
      return res.json(parsed);
    } catch (e: any) {
      console.error("[chat] error:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/documents/analyze", resolveTenant, requireAuth, async (req, res) => {
    try {
      const { data, mimeType } = req.body;
      if (!data || !mimeType) return res.status(400).json({ error: "data and mimeType are required" });

      // Only analyze PDFs — other types skip straight to manual entry
      if (mimeType !== "application/pdf") {
        return res.json({ skip: true });
      }

      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        return res.json({ skip: true, reason: "PERPLEXITY_API_KEY not configured" });
      }

      // ── Step 1: extract text ────────────────────────────────────────────────
      const buf = Buffer.from(data, "base64");
      let rawText = "";
      let pageCount = 0;
      try {
        const parsed = await pdfParse(buf);
        pageCount = parsed.numpages || 0;
        rawText = (parsed.text || "").slice(0, 24000).trim();
        console.log(`[analyze] pdf-parse: ${pageCount} pages, ${rawText.length} chars extracted`);
      } catch (pdfErr: any) {
        console.error("[analyze] pdf-parse failed:", pdfErr?.message);
        rawText = "";
      }

      // ── Step 2: normalize heuristically ────────────────────────────────────
      // Guard: if pdf-parse returned nothing, surface a useful low-confidence proposal
      // instead of sending an empty prompt to the AI (which caused the original failure).
      if (!rawText) {
        return res.json({
          proposal: {
            document_type: "other",
            fiscal_year: null,
            fund_name: null,
            report_section: null,
            extraction_quality: "low",
            summary_tables: [],
            detail_rows: [],
            candidate_categories: [],
            suggested_upload_type: "documents",
            suggested_destination: "documents",
            missing_fields: ["all"],
            admin_questions: [
              "Text could not be extracted from this PDF. Is it a scanned image? If so, please enter data manually.",
            ],
            confidence: 0,
            rationale: "pdf-parse returned no text. The file may be a scanned image PDF or may be encrypted.",
            docType: "other",
            destination: "documents",
            metadata: { year: null, fiscalYear: null, description: "PDF text extraction failed" },
            missingFields: ["all"],
          },
        });
      }

      const normalized = normalizePdfText(rawText);

      // Build a compact structured context for the AI
      const structuredContext = [
        normalized.documentTitle ? `Document title: ${normalized.documentTitle}` : "",
        `Pages extracted: ${pageCount || "unknown"}, raw text length: ${rawText.length} chars`,
        normalized.fiscalYears.length ? `Detected years: ${normalized.fiscalYears.join(", ")}` : "",
        normalized.departmentHeaders.length
          ? `Department/fund sections detected (${normalized.departmentHeaders.length}): ${normalized.departmentHeaders.slice(0, 8).join(" | ")}`
          : "",
        normalized.summaryTables.length
          ? `Summary tables (${normalized.summaryTables.length}): ${normalized.summaryTables.map(t => t.header || "(unlabeled)").join(" | ")}`
          : "",
        normalized.detailRows.length
          ? `Detail account rows found: ${normalized.detailRows.length} (showing first 5 below in excerpt)`
          : "",
        normalized.candidateCategories.length
          ? `Candidate account titles: ${normalized.candidateCategories.slice(0, 12).join(", ")}`
          : "",
      ].filter(Boolean).join("\n");

      // Build an annotated sample: first 3 detail rows formatted as a mini-table
      const sampleRows = normalized.detailRows.slice(0, 5).map(r => r.join(" | ")).join("\n");

      const prompt = `You are a municipal budget document analyst. Analyze ONLY the text provided below — do NOT search the web.
Return ONLY a valid JSON object — no markdown fences, no prose.

Allowed document_type: budget-summary, budget-detail, annual-report-support, financial-statement, revenue-report, capital-plan, meeting-minutes, other
Allowed suggested_destination: revenue, departments, projects, documents

Column layout for this PDF (Essex Junction, VT — 8 columns):
  account_code | account_title | 2023 Budget | 2023 Actual | 2024 Budget | 2024 Actual | 2025 Budget | 2026 Budget | $ Change | % Change

Return this exact JSON shape (no extra keys):
{
  "document_type": "",
  "fiscal_year": "",
  "fund_name": "",
  "report_section": "",
  "extraction_quality": "high|medium|low",
  "summary_tables": [
    { "label": "", "totals": {} }
  ],
  "detail_rows": [
    { "account_code": "", "account_title": "", "budget": null, "actual": null, "change": null, "pct_change": null, "flag": "revenue|expenditure|unknown" }
  ],
  "candidate_categories": [],
  "suggested_upload_type": "departments|revenue|projects|documents",
  "suggested_destination": "departments|revenue|projects|documents",
  "missing_fields": [],
  "admin_questions": [],
  "confidence": 0.0,
  "rationale": ""
}

Rules:
- extraction_quality = "high" when: fiscal year identified + destination clear + 3+ data rows found.
- extraction_quality = "medium" when: some data found but fiscal year or destination unclear.
- extraction_quality = "low" only when almost nothing is extractable from the text.
- admin_questions must be SHORT and specific, e.g. "Which fund does this cover?" or "Is this a summary or line-item detail report?"
- Use only the text below. Never invent dollar amounts. Set numeric fields to null if not found.
- For detail_rows, "budget" = the proposed/current year budget (2026 Budget column); "actual" = most recent actual (2024 Actual).

HEURISTIC PRE-PARSE RESULTS:
${structuredContext || "(no structured data detected)"}

SAMPLE DATA ROWS (heuristic):
${sampleRows || "(none detected)"}

RAW TEXT EXCERPT (first ~3000 chars, column headers stripped):
${normalized.excerpt || "(no text could be extracted)"}`;

      const aiRes = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1536,
          temperature: 0,
        }),
      });

      if (!aiRes.ok) {
        const errBody = await aiRes.text();
        console.error("Perplexity API error:", aiRes.status, errBody);
        return res.json({ skip: true, reason: "AI service unavailable" });
      }

      const aiJson = await aiRes.json();
      const raw = aiJson.choices?.[0]?.message?.content ?? "";

      // Strip markdown fences if present, extract JSON
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.json({ skip: true, reason: "Could not parse AI response" });
      }

      let proposal: any;
      try {
        proposal = JSON.parse(jsonMatch[0]);
      } catch {
        return res.json({ skip: true, reason: "Invalid JSON from AI" });
      }

      // ── Coerce + validate ──────────────────────────────────────────────────
      const ALLOWED_DOC_TYPES = ["budget-summary", "budget-detail", "annual-report-support", "financial-statement", "revenue-report", "capital-plan", "meeting-minutes", "other"];
      const ALLOWED_DESTINATIONS = ["revenue", "departments", "projects", "documents"];
      const ALLOWED_QUALITY = ["high", "medium", "low"];

      if (!ALLOWED_DOC_TYPES.includes(proposal.document_type)) proposal.document_type = "other";
      if (!ALLOWED_DESTINATIONS.includes(proposal.suggested_destination)) proposal.suggested_destination = "documents";
      if (!ALLOWED_DESTINATIONS.includes(proposal.suggested_upload_type)) proposal.suggested_upload_type = proposal.suggested_destination;
      if (!ALLOWED_QUALITY.includes(proposal.extraction_quality)) proposal.extraction_quality = "low";
      if (typeof proposal.confidence !== "number" || proposal.confidence < 0 || proposal.confidence > 1) proposal.confidence = 0.5;
      if (!Array.isArray(proposal.missing_fields)) proposal.missing_fields = [];
      if (!Array.isArray(proposal.admin_questions)) proposal.admin_questions = [];
      if (!Array.isArray(proposal.summary_tables)) proposal.summary_tables = [];
      if (!Array.isArray(proposal.detail_rows)) proposal.detail_rows = [];
      if (!Array.isArray(proposal.candidate_categories)) proposal.candidate_categories = normalized.candidateCategories;
      if (!proposal.rationale) proposal.rationale = "";
      if (!proposal.fiscal_year) proposal.fiscal_year = normalized.fiscalYears[0] || null;

      // Merge heuristic candidate categories if AI left them empty
      if (proposal.candidate_categories.length === 0 && normalized.candidateCategories.length > 0) {
        proposal.candidate_categories = normalized.candidateCategories.slice(0, 15);
      }

      // Also expose legacy fields so the existing UploadWizard still works
      proposal.docType = proposal.document_type;
      proposal.destination = proposal.suggested_destination;
      proposal.metadata = {
        year: proposal.fiscal_year,
        fiscalYear: proposal.fiscal_year,
        description: proposal.rationale,
      };
      proposal.missingFields = proposal.missing_fields;

      return res.json({ proposal });
    } catch (e: any) {
      console.error("analyze route error:", e);
      return res.json({ skip: true, reason: e.message });
    }
  });

  // Determine where to store uploaded files (Railway volume or local fallback)
  const UPLOADS_BASE = process.env.DATABASE_PATH
    ? join(process.env.DATABASE_PATH.replace(/\/[^/]+$/, ""), "uploads")
    : join(process.cwd(), "uploads");

  // Serve uploaded files statically at /uploads/:muniId/:filename
  // We do this manually so we can control per-file access.
  app.get("/uploads/:muniId/:filename", async (req, res) => {
    try {
      const { muniId, filename } = req.params;
      const filePath = join(UPLOADS_BASE, muniId, filename);
      if (!existsSync(filePath)) return res.status(404).json({ error: "File not found" });

      // Check if the document is public OR the requester is an authenticated admin for this muni
      const docs = await storage.getBudgetDocuments(parseInt(muniId));
      const doc = docs.find(d => d.filename === filename);
      if (!doc) return res.status(404).json({ error: "Document not found" });

      if (!doc.isPublic) {
        // Allow if authenticated admin for this muni
        const token = req.headers.authorization?.replace("Bearer ", "") ||
          (req.query.token as string);
        const sess = token ? activeSessions.get(token) : undefined;
        const tokenMuniId = sess?.municipalityId ?? null;
        const isPlatform = sess?.role === "platform";
        if (!isPlatform && (!tokenMuniId || tokenMuniId !== parseInt(muniId))) {
          return res.status(403).json({ error: "Document is not public" });
        }
      }

      res.setHeader("Content-Disposition", `inline; filename="${doc.originalName}"`);
      res.setHeader("Content-Type", doc.mimeType);
      res.sendFile(filePath);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // List documents (admin: all; public endpoint: public only)
  app.get("/api/documents", resolveTenant, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const token = req.headers.authorization?.replace("Bearer ", "");
      const sess2 = token ? activeSessions.get(token) : undefined;
      const tokenMuniId2 = sess2?.municipalityId ?? null;
      const isAdmin = !!(sess2 && (sess2.role === "platform" || tokenMuniId2 === muni.id));
      const docs = await storage.getBudgetDocuments(muni.id, !isAdmin);
      res.json(docs);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Upload a document (base64-encoded in JSON body)
  app.post("/api/documents", resolveTenant, requireAuth, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const { data, originalName, mimeType, description, year, aiReviewLog } = req.body;
      if (!data || !originalName || !mimeType)
        return res.status(400).json({ error: "data, originalName, and mimeType are required" });

      // Decode base64
      const buf = Buffer.from(data, "base64");
      if (buf.length > 50 * 1024 * 1024) // 50 MB limit
        return res.status(413).json({ error: "File too large (max 50 MB)" });

      // Create directory for this muni
      const muniDir = join(UPLOADS_BASE, String(muni.id));
      mkdirSync(muniDir, { recursive: true });

      // Generate unique filename preserving extension
      const ext = extname(originalName) || ".bin";
      const storedFilename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
      const filePath = join(muniDir, storedFilename);
      writeFileSync(filePath, buf);

      const doc = await storage.createBudgetDocument({
        municipalityId: muni.id,
        filename: storedFilename,
        originalName,
        mimeType,
        size: buf.length,
        isPublic: false,
        uploadedAt: new Date().toISOString(),
        description: description || null,
        year: year || null,
        aiReviewLog: aiReviewLog ? String(aiReviewLog) : null,
      });

      res.json(doc);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Toggle public visibility of a document
  app.patch("/api/documents/:id/visibility", resolveTenant, requireAuth, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const { isPublic } = req.body;
      const doc = await storage.updateBudgetDocument(
        parseInt(req.params.id), muni.id, { isPublic: !!isPublic }
      );
      res.json(doc);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Update document metadata (name, description, year)
  app.patch("/api/documents/:id", resolveTenant, requireAuth, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const { originalName, description, year } = req.body;
      const doc = await storage.updateBudgetDocument(
        parseInt(req.params.id), muni.id,
        { ...(originalName && { originalName }), ...(description !== undefined && { description }), ...(year !== undefined && { year }) }
      );
      res.json(doc);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Delete a document
  app.delete("/api/documents/:id", resolveTenant, requireAuth, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const docs = await storage.getBudgetDocuments(muni.id);
      const doc = docs.find(d => d.id === parseInt(req.params.id));
      if (!doc) return res.status(404).json({ error: "Document not found" });

      // Delete the physical file
      const filePath = join(UPLOADS_BASE, String(muni.id), doc.filename);
      if (existsSync(filePath)) {
        try { unlinkSync(filePath); } catch {}
      }

      await storage.deleteBudgetDocument(doc.id, muni.id);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  return httpServer;
}
