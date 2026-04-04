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

// ─── Auth: per-tenant token sessions ─────────────────────────────────────────
// Map: token → municipalityId
const activeSessions = new Map<string, number>();

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

// Auth guard — token must match the muni's session
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  const tokenMuniId = activeSessions.get(token);
  const muni = res.locals.muni as Municipality;
  if (!tokenMuniId || tokenMuniId !== muni.id) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await runMigrations();
  await seedDatabase();

  // ── Health check (used by Railway and load balancers) ─────────────────────
  app.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post("/api/auth/login", resolveTenant, async (req, res) => {
    const { password } = req.body;
    const muni = res.locals.muni as Municipality;
    if (!password) return res.status(400).json({ error: "Password required" });
    const valid = bcrypt.compareSync(password, muni.adminPasswordHash);
    if (!valid) return res.status(401).json({ error: "Invalid password" });
    const token = generateToken();
    activeSessions.set(token, muni.id);
    res.json({ token, municipalityId: muni.id, slug: muni.slug, name: muni.name });
  });

  app.post("/api/auth/logout", resolveTenant, (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) activeSessions.delete(token);
    res.json({ success: true });
  });

  // ── Onboarding: register a new municipality ───────────────────────────────
  app.post("/api/onboard", async (req, res) => {
    try {
      const { name, state, population, fiscalYear, contactEmail, contactPhone, website, password } = req.body;
      if (!name || !state || !population || !password) {
        return res.status(400).json({ error: "Name, state, population, and password are required" });
      }
      // Generate slug
      let baseSlug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${state.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      // Ensure uniqueness
      let slug = baseSlug;
      let counter = 1;
      while (await storage.getMunicipalityBySlug(slug)) {
        slug = `${baseSlug}-${counter++}`;
      }
      const adminPasswordHash = bcrypt.hashSync(password, 10);
      const muni = await storage.createMunicipality({
        slug,
        name,
        state,
        population: parseInt(population),
        fiscalYear: fiscalYear || "FY2026",
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        website: website || null,
        lastUpdated: new Date().toISOString(),
        adminPasswordHash,
        revenuePublished: false,
        departmentsPublished: false,
        projectsPublished: false,
        onboardingComplete: false,
      });
      // Auto-login
      const token = generateToken();
      activeSessions.set(token, muni.id);
      res.json({ token, municipality: muni });
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

  // ── Revenue ───────────────────────────────────────────────────────────────
  app.get("/api/revenue/:year", resolveTenant, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const sources = await storage.getRevenueSources(muni.id, req.params.year as string);
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
    const budgets = await storage.getDepartmentBudgets(muni.id, req.params.year as string);
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

  // ── Upload history ────────────────────────────────────────────────────────
  app.get("/api/uploads", resolveTenant, requireAuth, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const history = await storage.getUploadHistory(muni.id);
    res.json(history);
  });

  // ── Dashboard summary ─────────────────────────────────────────────────────
  app.get("/api/summary/:year", resolveTenant, async (req, res) => {
    const muni = res.locals.muni as Municipality;
    const year = req.params.year as string;
    const [deptBudgets, revSources, years] = await Promise.all([
      storage.getDepartmentBudgets(muni.id, year),
      storage.getRevenueSources(muni.id, year),
      storage.getAvailableYears(muni.id),
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
      costPerResident: muni.population > 0 ? totalBudgeted / muni.population : 0,
      revenueEfficiency: totalRevenueBudgeted > 0 ? (totalRevenueCollected / totalRevenueBudgeted) * 100 : 0,
      departments,
      topDepartments: departments.slice(0, 3).map(d => d.name),
      population: muni.population,
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
      const { data, type, year, format = "csv", columnMap } = req.body;
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
        // CSV text
        const lines = data.split("\n").filter((l: string) => l.trim());
        const headers = lines[0].split(",").map((h: string) => h.trim());
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c: string) => c.trim());
          if (cols.length >= 2) {
            const row: Record<string, string> = {};
            headers.forEach((h: string, idx: number) => { row[h] = cols[idx] || ""; });
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

      if (type === "departments") {
        await storage.clearDepartmentBudgetsByYear(muni.id, year);
        for (const row of rows) {
          const department = col(row, "department", ["department", "dept"]);
          const category = col(row, "category", ["category", "sub-category", "subcategory", "line item"]);
          const budgetedAmount = parseFloat(col(row, "budgetedAmount", ["budgeted amount", "budgeted", "budget"])) || 0;
          const spentAmount = parseFloat(col(row, "spentAmount", ["spent amount", "spent", "actual", "expenditure"])) || 0;
          if (department) {
            await storage.createDepartmentBudget({ municipalityId: muni.id, year, department, category: category || department, budgetedAmount, spentAmount });
            recordCount++;
          }
        }
      } else if (type === "revenue") {
        await storage.clearRevenueSourcesByYear(muni.id, year);
        for (const row of rows) {
          const source = col(row, "source", ["source", "revenue source", "name"]);
          const category = col(row, "category", ["category", "type", "revenue type"]);
          const budgetedAmount = parseFloat(col(row, "budgetedAmount", ["budgeted amount", "budgeted", "budget"])) || 0;
          const collectedAmount = parseFloat(col(row, "collectedAmount", ["collected amount", "collected", "actual", "received"])) || 0;
          if (source) {
            await storage.createRevenueSource({ municipalityId: muni.id, year, source, category: category || source, budgetedAmount, collectedAmount });
            recordCount++;
          }
        }
      } else if (type === "projects") {
        await storage.clearCapitalProjects(muni.id);
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
            recordCount++;
          }
        }
      }

      await storage.createUploadHistory({
        municipalityId: muni.id,
        filename: `${type}_${year}.${format}`,
        uploadedAt: new Date().toISOString(),
        recordCount,
        status: "success",
        notes: `Imported ${recordCount} ${type} records for ${year}`,
      });

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
        const lines = data.split("\n").filter((l: string) => l.trim());
        headers = lines[0].split(",").map((h: string) => h.trim());
        for (let i = 1; i < Math.min(lines.length, 6); i++) {
          const cols = lines[i].split(",").map((c: string) => c.trim());
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => { row[h] = cols[idx] || ""; });
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
        const tokenMuniId = token ? activeSessions.get(token) : undefined;
        if (!tokenMuniId || tokenMuniId !== parseInt(muniId)) {
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
      const tokenMuniId = token ? activeSessions.get(token) : undefined;
      const isAdmin = !!(tokenMuniId && tokenMuniId === muni.id);
      const docs = await storage.getBudgetDocuments(muni.id, !isAdmin);
      res.json(docs);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Upload a document (base64-encoded in JSON body)
  app.post("/api/documents", resolveTenant, requireAuth, async (req, res) => {
    try {
      const muni = res.locals.muni as Municipality;
      const { data, originalName, mimeType, description, year } = req.body;
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
