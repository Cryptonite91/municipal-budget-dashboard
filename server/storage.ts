import {
  type Municipality, type InsertMunicipality, municipalities,
  type RevenueSource, type InsertRevenueSource, revenueSources,
  type DepartmentBudget, type InsertDepartmentBudget, departmentBudgets,
  type CapitalProject, type InsertCapitalProject, capitalProjects,
  type UploadHistory, type InsertUploadHistory, uploadHistory,
  type CitizenComment, type InsertCitizenComment, citizenComments,
  type EmailSubscriber, type InsertEmailSubscriber, emailSubscribers,
  type BudgetDocument, type InsertBudgetDocument, budgetDocuments,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq, and } from "drizzle-orm";

import { mkdirSync } from "fs";
import { dirname, resolve } from "path";

const dbPath = process.env.DATABASE_PATH || "data.db";
// Ensure the directory exists (important for Railway volume mounts like /data/data.db)
const dbDir = dirname(dbPath);
if (dbDir && dbDir !== ".") {
  try { mkdirSync(dbDir, { recursive: true }); } catch {}
}
// libsql uses file: URLs for local SQLite — zero native deps, works everywhere
const absPath = dbPath.startsWith("/") ? dbPath : resolve(process.cwd(), dbPath);
const client = createClient({ url: `file:${absPath}` });
export const db = drizzle(client);

export interface IStorage {
  getMunicipalityBySlug(slug: string): Promise<Municipality | undefined>;
  getMunicipalityById(id: number): Promise<Municipality | undefined>;
  getAllMunicipalities(): Promise<Municipality[]>;
  getListedMunicipalities(): Promise<Municipality[]>;
  createMunicipality(data: InsertMunicipality): Promise<Municipality>;
  updateMunicipality(id: number, data: Partial<InsertMunicipality>): Promise<Municipality>;
  getRevenueSources(muniId: number, year: string): Promise<RevenueSource[]>;
  getAllRevenueSources(muniId: number): Promise<RevenueSource[]>;
  createRevenueSource(data: InsertRevenueSource): Promise<RevenueSource>;
  clearRevenueSourcesByYear(muniId: number, year: string): Promise<void>;
  getDepartmentBudgets(muniId: number, year: string): Promise<DepartmentBudget[]>;
  getAllDepartmentBudgets(muniId: number): Promise<DepartmentBudget[]>;
  createDepartmentBudget(data: InsertDepartmentBudget): Promise<DepartmentBudget>;
  clearDepartmentBudgetsByYear(muniId: number, year: string): Promise<void>;
  getCapitalProjects(muniId: number): Promise<CapitalProject[]>;
  createCapitalProject(data: InsertCapitalProject): Promise<CapitalProject>;
  clearCapitalProjects(muniId: number): Promise<void>;
  getUploadHistory(muniId: number): Promise<UploadHistory[]>;
  createUploadHistory(data: InsertUploadHistory): Promise<UploadHistory>;
  getAvailableYears(muniId: number): Promise<string[]>;
  updateRevenueSource(id: number, muniId: number, data: Partial<InsertRevenueSource>): Promise<RevenueSource>;
  deleteRevenueSource(id: number, muniId: number): Promise<void>;
  updateDepartmentBudget(id: number, muniId: number, data: Partial<InsertDepartmentBudget>): Promise<DepartmentBudget>;
  deleteDepartmentBudget(id: number, muniId: number): Promise<void>;
  updateCapitalProject(id: number, muniId: number, data: Partial<InsertCapitalProject>): Promise<CapitalProject>;
  deleteCapitalProject(id: number, muniId: number): Promise<void>;
  getComments(muniId: number, approved?: boolean): Promise<CitizenComment[]>;
  createComment(data: InsertCitizenComment): Promise<CitizenComment>;
  approveComment(id: number): Promise<void>;
  deleteComment(id: number): Promise<void>;
  createSubscriber(data: InsertEmailSubscriber): Promise<EmailSubscriber>;
  getSubscribers(muniId: number): Promise<EmailSubscriber[]>;
  isSubscribed(muniId: number, email: string): Promise<boolean>;
  // Budget documents
  getBudgetDocuments(muniId: number, publicOnly?: boolean): Promise<BudgetDocument[]>;
  createBudgetDocument(data: InsertBudgetDocument): Promise<BudgetDocument>;
  updateBudgetDocument(id: number, muniId: number, data: Partial<InsertBudgetDocument>): Promise<BudgetDocument>;
  deleteBudgetDocument(id: number, muniId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // ── Municipalities ──────────────────────────────────────────────────────────
  async getMunicipalityBySlug(slug: string): Promise<Municipality | undefined> {
    const rows = await db.select().from(municipalities).where(eq(municipalities.slug, slug));
    return rows[0];
  }

  async getMunicipalityById(id: number): Promise<Municipality | undefined> {
    const rows = await db.select().from(municipalities).where(eq(municipalities.id, id));
    return rows[0];
  }

  async getAllMunicipalities(): Promise<Municipality[]> {
    return db.select().from(municipalities);
  }

  async getListedMunicipalities(): Promise<Municipality[]> {
    return db.select().from(municipalities).where(eq(municipalities.listed, true));
  }

  async createMunicipality(data: InsertMunicipality): Promise<Municipality> {
    const rows = await db.insert(municipalities).values(data).returning();
    return rows[0];
  }

  async updateMunicipality(id: number, data: Partial<InsertMunicipality>): Promise<Municipality> {
    await db.update(municipalities).set(data).where(eq(municipalities.id, id));
    const rows = await db.select().from(municipalities).where(eq(municipalities.id, id));
    return rows[0];
  }

  // ── Revenue ─────────────────────────────────────────────────────────────────
  async getRevenueSources(muniId: number, year: string): Promise<RevenueSource[]> {
    return db.select().from(revenueSources)
      .where(and(eq(revenueSources.municipalityId, muniId), eq(revenueSources.year, year)));
  }

  async getAllRevenueSources(muniId: number): Promise<RevenueSource[]> {
    return db.select().from(revenueSources).where(eq(revenueSources.municipalityId, muniId));
  }

  async createRevenueSource(data: InsertRevenueSource): Promise<RevenueSource> {
    const rows = await db.insert(revenueSources).values(data).returning();
    return rows[0];
  }

  async clearRevenueSourcesByYear(muniId: number, year: string): Promise<void> {
    await db.delete(revenueSources)
      .where(and(eq(revenueSources.municipalityId, muniId), eq(revenueSources.year, year)));
  }

  // ── Departments ─────────────────────────────────────────────────────────────
  async getDepartmentBudgets(muniId: number, year: string): Promise<DepartmentBudget[]> {
    return db.select().from(departmentBudgets)
      .where(and(eq(departmentBudgets.municipalityId, muniId), eq(departmentBudgets.year, year)));
  }

  async getAllDepartmentBudgets(muniId: number): Promise<DepartmentBudget[]> {
    return db.select().from(departmentBudgets).where(eq(departmentBudgets.municipalityId, muniId));
  }

  async createDepartmentBudget(data: InsertDepartmentBudget): Promise<DepartmentBudget> {
    const rows = await db.insert(departmentBudgets).values(data).returning();
    return rows[0];
  }

  async clearDepartmentBudgetsByYear(muniId: number, year: string): Promise<void> {
    await db.delete(departmentBudgets)
      .where(and(eq(departmentBudgets.municipalityId, muniId), eq(departmentBudgets.year, year)));
  }

  // ── Projects ────────────────────────────────────────────────────────────────
  async getCapitalProjects(muniId: number): Promise<CapitalProject[]> {
    return db.select().from(capitalProjects).where(eq(capitalProjects.municipalityId, muniId));
  }

  async createCapitalProject(data: InsertCapitalProject): Promise<CapitalProject> {
    const rows = await db.insert(capitalProjects).values(data).returning();
    return rows[0];
  }

  async clearCapitalProjects(muniId: number): Promise<void> {
    await db.delete(capitalProjects).where(eq(capitalProjects.municipalityId, muniId));
  }

  // ── Upload history ───────────────────────────────────────────────────────────
  async getUploadHistory(muniId: number): Promise<UploadHistory[]> {
    return db.select().from(uploadHistory).where(eq(uploadHistory.municipalityId, muniId));
  }

  async createUploadHistory(data: InsertUploadHistory): Promise<UploadHistory> {
    const rows = await db.insert(uploadHistory).values(data).returning();
    return rows[0];
  }

  // ── Available years ─────────────────────────────────────────────────────────
  async getAvailableYears(muniId: number): Promise<string[]> {
    const [deptYears, revYears] = await Promise.all([
      db.select({ year: departmentBudgets.year }).from(departmentBudgets)
        .where(eq(departmentBudgets.municipalityId, muniId)),
      db.select({ year: revenueSources.year }).from(revenueSources)
        .where(eq(revenueSources.municipalityId, muniId)),
    ]);
    const allYears = new Set([...deptYears.map(r => r.year), ...revYears.map(r => r.year)]);
    return Array.from(allYears).sort().reverse();
  }

  // ── Row-level edits ────────────────────────────────────────────────────────
  async updateRevenueSource(id: number, muniId: number, data: Partial<InsertRevenueSource>): Promise<RevenueSource> {
    await db.update(revenueSources).set(data).where(and(eq(revenueSources.id, id), eq(revenueSources.municipalityId, muniId)));
    const rows = await db.select().from(revenueSources).where(eq(revenueSources.id, id));
    return rows[0];
  }

  async deleteRevenueSource(id: number, muniId: number): Promise<void> {
    await db.delete(revenueSources).where(and(eq(revenueSources.id, id), eq(revenueSources.municipalityId, muniId)));
  }

  async updateDepartmentBudget(id: number, muniId: number, data: Partial<InsertDepartmentBudget>): Promise<DepartmentBudget> {
    await db.update(departmentBudgets).set(data).where(and(eq(departmentBudgets.id, id), eq(departmentBudgets.municipalityId, muniId)));
    const rows = await db.select().from(departmentBudgets).where(eq(departmentBudgets.id, id));
    return rows[0];
  }

  async deleteDepartmentBudget(id: number, muniId: number): Promise<void> {
    await db.delete(departmentBudgets).where(and(eq(departmentBudgets.id, id), eq(departmentBudgets.municipalityId, muniId)));
  }

  async updateCapitalProject(id: number, muniId: number, data: Partial<InsertCapitalProject>): Promise<CapitalProject> {
    await db.update(capitalProjects).set(data).where(and(eq(capitalProjects.id, id), eq(capitalProjects.municipalityId, muniId)));
    const rows = await db.select().from(capitalProjects).where(eq(capitalProjects.id, id));
    return rows[0];
  }

  async deleteCapitalProject(id: number, muniId: number): Promise<void> {
    await db.delete(capitalProjects).where(and(eq(capitalProjects.id, id), eq(capitalProjects.municipalityId, muniId)));
  }

  // ── Comments ────────────────────────────────────────────────────────────────
  async getComments(muniId: number, approved?: boolean): Promise<CitizenComment[]> {
    if (approved !== undefined) {
      return db.select().from(citizenComments)
        .where(and(
          eq(citizenComments.municipalityId, muniId),
          eq(citizenComments.approved, approved),
        ));
    }
    return db.select().from(citizenComments).where(eq(citizenComments.municipalityId, muniId));
  }

  async createComment(data: InsertCitizenComment): Promise<CitizenComment> {
    const rows = await db.insert(citizenComments).values(data).returning();
    return rows[0];
  }

  async approveComment(id: number): Promise<void> {
    await db.update(citizenComments).set({ approved: true }).where(eq(citizenComments.id, id));
  }

  async deleteComment(id: number): Promise<void> {
    await db.delete(citizenComments).where(eq(citizenComments.id, id));
  }

  // ── Subscribers ─────────────────────────────────────────────────────────────
  async createSubscriber(data: InsertEmailSubscriber): Promise<EmailSubscriber> {
    const rows = await db.insert(emailSubscribers).values(data).returning();
    return rows[0];
  }

  async getSubscribers(muniId: number): Promise<EmailSubscriber[]> {
    return db.select().from(emailSubscribers)
      .where(and(eq(emailSubscribers.municipalityId, muniId), eq(emailSubscribers.active, true)));
  }

  async isSubscribed(muniId: number, email: string): Promise<boolean> {
    const rows = await db.select().from(emailSubscribers)
      .where(and(
        eq(emailSubscribers.municipalityId, muniId),
        eq(emailSubscribers.email, email),
        eq(emailSubscribers.active, true),
      ));
    return rows.length > 0;
  }

  // ── Budget documents ─────────────────────────────────────────────────────
  async getBudgetDocuments(muniId: number, publicOnly = false): Promise<BudgetDocument[]> {
    const conditions = publicOnly
      ? and(eq(budgetDocuments.municipalityId, muniId), eq(budgetDocuments.isPublic, true))
      : eq(budgetDocuments.municipalityId, muniId);
    return db.select().from(budgetDocuments).where(conditions)
      .orderBy(budgetDocuments.uploadedAt);
  }

  async createBudgetDocument(data: InsertBudgetDocument): Promise<BudgetDocument> {
    const rows = await db.insert(budgetDocuments).values(data).returning();
    return rows[0];
  }

  async updateBudgetDocument(id: number, muniId: number, data: Partial<InsertBudgetDocument>): Promise<BudgetDocument> {
    const rows = await db.update(budgetDocuments)
      .set(data)
      .where(and(eq(budgetDocuments.id, id), eq(budgetDocuments.municipalityId, muniId)))
      .returning();
    if (!rows[0]) throw new Error("Document not found");
    return rows[0];
  }

  async deleteBudgetDocument(id: number, muniId: number): Promise<void> {
    await db.delete(budgetDocuments)
      .where(and(eq(budgetDocuments.id, id), eq(budgetDocuments.municipalityId, muniId)));
  }
}

export const storage = new DatabaseStorage();
