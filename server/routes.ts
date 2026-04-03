import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { seedDatabase } from "./seed";
import crypto from "crypto";

// Admin password — in production this would come from env vars
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "maplewood";

// In-memory session tokens (simple approach for demo)
const activeSessions = new Set<string>();

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed database with demo data
  seedDatabase();

  // --- Auth routes ---
  app.post("/api/auth/login", (req, res) => {
    const { password } = req.body;
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Invalid password" });
    }
    const token = generateToken();
    activeSessions.add(token);
    res.json({ token });
  });

  app.post("/api/auth/verify", (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace("Bearer ", "");
    if (!token || !activeSessions.has(token)) {
      return res.status(401).json({ authenticated: false });
    }
    res.json({ authenticated: true });
  });

  app.post("/api/auth/logout", (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace("Bearer ", "");
    if (token) activeSessions.delete(token);
    res.json({ success: true });
  });

  // Auth middleware helper
  function requireAuth(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace("Bearer ", "");
    if (!token || !activeSessions.has(token)) {
      return res.status(401).json({ error: "Authentication required" });
    }
    next();
  }

  // Municipality info
  app.get("/api/municipality", async (_req, res) => {
    const muni = await storage.getMunicipality();
    res.json(muni || null);
  });

  // Available years
  app.get("/api/years", async (_req, res) => {
    const years = await storage.getAvailableYears();
    res.json(years);
  });

  // Revenue sources by year
  app.get("/api/revenue/:year", async (req, res) => {
    const sources = await storage.getRevenueSources(req.params.year);
    res.json(sources);
  });

  // All revenue sources
  app.get("/api/revenue", async (_req, res) => {
    const sources = await storage.getAllRevenueSources();
    res.json(sources);
  });

  // Department budgets by year
  app.get("/api/departments/:year", async (req, res) => {
    const budgets = await storage.getDepartmentBudgets(req.params.year);
    res.json(budgets);
  });

  // All department budgets
  app.get("/api/departments", async (_req, res) => {
    const budgets = await storage.getAllDepartmentBudgets();
    res.json(budgets);
  });

  // Capital projects
  app.get("/api/projects", async (_req, res) => {
    const projects = await storage.getCapitalProjects();
    res.json(projects);
  });

  // Upload history
  app.get("/api/uploads", async (_req, res) => {
    const history = await storage.getUploadHistory();
    res.json(history);
  });

  // Dashboard summary for a given year
  app.get("/api/summary/:year", async (req, res) => {
    const year = req.params.year;
    const [deptBudgets, revSources, muni, years] = await Promise.all([
      storage.getDepartmentBudgets(year),
      storage.getRevenueSources(year),
      storage.getMunicipality(),
      storage.getAvailableYears(),
    ]);

    const totalBudgeted = deptBudgets.reduce((s, d) => s + d.budgetedAmount, 0);
    const totalSpent = deptBudgets.reduce((s, d) => s + d.spentAmount, 0);
    const totalRevenueBudgeted = revSources.reduce((s, r) => s + r.budgetedAmount, 0);
    const totalRevenueCollected = revSources.reduce((s, r) => s + r.collectedAmount, 0);

    // Get prior year for YoY
    const yearIndex = years.indexOf(year);
    let priorYearTotal = 0;
    if (yearIndex < years.length - 1) {
      const priorBudgets = await storage.getDepartmentBudgets(years[yearIndex + 1]);
      priorYearTotal = priorBudgets.reduce((s, d) => s + d.budgetedAmount, 0);
    }

    // Group by department
    const byDept: Record<string, { budgeted: number; spent: number }> = {};
    for (const d of deptBudgets) {
      if (!byDept[d.department]) byDept[d.department] = { budgeted: 0, spent: 0 };
      byDept[d.department].budgeted += d.budgetedAmount;
      byDept[d.department].spent += d.spentAmount;
    }

    const departments = Object.entries(byDept)
      .map(([name, vals]) => ({ name, ...vals }))
      .sort((a, b) => b.budgeted - a.budgeted);

    const top3 = departments.slice(0, 3).map(d => d.name);

    res.json({
      totalBudget: totalBudgeted,
      totalSpent,
      totalRevenueBudgeted,
      totalRevenueCollected,
      yoyChange: priorYearTotal > 0 ? ((totalBudgeted - priorYearTotal) / priorYearTotal) * 100 : 0,
      percentSpent: totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0,
      budgetReserve: totalBudgeted > 0 ? ((totalBudgeted - totalSpent) / totalBudgeted) * 100 : 0,
      costPerResident: muni ? totalBudgeted / muni.population : 0,
      revenueEfficiency: totalRevenueBudgeted > 0 ? (totalRevenueCollected / totalRevenueBudgeted) * 100 : 0,
      topDepartments: top3,
      departments,
      population: muni?.population || 0,
      municipalityName: muni?.name || "Municipality",
    });
  });

  // CSV upload endpoint (protected - requires admin auth)
  app.post("/api/upload", requireAuth, async (req, res) => {
    try {
      const { data, type, year } = req.body;
      if (!data || !type || !year) {
        return res.status(400).json({ error: "Missing data, type, or year" });
      }

      const lines = data.split("\n").filter((l: string) => l.trim());
      const headers = lines[0].split(",").map((h: string) => h.trim().toLowerCase());
      let recordCount = 0;

      if (type === "departments") {
        await storage.clearDepartmentBudgetsByYear(year);
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c: string) => c.trim());
          if (cols.length >= 4) {
            await storage.createDepartmentBudget({
              year,
              department: cols[0],
              category: cols[1],
              budgetedAmount: parseFloat(cols[2]) || 0,
              spentAmount: parseFloat(cols[3]) || 0,
            });
            recordCount++;
          }
        }
      } else if (type === "revenue") {
        await storage.clearRevenueSourcesByYear(year);
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c: string) => c.trim());
          if (cols.length >= 4) {
            await storage.createRevenueSource({
              year,
              source: cols[0],
              category: cols[1],
              budgetedAmount: parseFloat(cols[2]) || 0,
              collectedAmount: parseFloat(cols[3]) || 0,
            });
            recordCount++;
          }
        }
      }

      await storage.createUploadHistory({
        filename: `${type}_${year}.csv`,
        uploadedAt: new Date().toISOString(),
        recordCount,
        status: "success",
        notes: `Uploaded ${recordCount} ${type} records for ${year}`,
      });

      res.json({ success: true, recordCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
