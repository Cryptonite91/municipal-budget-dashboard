import {
  type Municipality, type InsertMunicipality, municipalities,
  type RevenueSource, type InsertRevenueSource, revenueSources,
  type DepartmentBudget, type InsertDepartmentBudget, departmentBudgets,
  type CapitalProject, type InsertCapitalProject, capitalProjects,
  type UploadHistory, type InsertUploadHistory, uploadHistory,
  type ImportBatchRecord, type InsertImportBatchRecord, importBatchRecords,
  type CitizenComment, type InsertCitizenComment, citizenComments,
  type EmailSubscriber, type InsertEmailSubscriber, emailSubscribers,
  type BudgetDocument, type InsertBudgetDocument, budgetDocuments,
  type AdminUser, type InsertAdminUser, adminUsers,
  type FieldOption, type InsertFieldOption, fieldOptions,
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
  // Admin users
  getAdminUserByEmail(email: string): Promise<AdminUser | undefined>;
  createAdminUser(data: InsertAdminUser): Promise<AdminUser>;
  getAdminUsersByMunicipality(muniId: number): Promise<AdminUser[]>;
  getPendingMunicipalities(): Promise<Municipality[]>;
  approveMunicipality(id: number, status: string): Promise<void>;
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

  // ── Admin users ──────────────────────────────────────────────────────────────
  async getAdminUserByEmail(email: string): Promise<AdminUser | undefined> {
    const rows = await db.select().from(adminUsers).where(eq(adminUsers.email, email.toLowerCase()));
    return rows[0];
  }

  async createAdminUser(data: InsertAdminUser): Promise<AdminUser> {
    const rows = await db.insert(adminUsers).values({ ...data, email: data.email.toLowerCase() }).returning();
    return rows[0];
  }

  async getAdminUsersByMunicipality(muniId: number): Promise<AdminUser[]> {
    return db.select().from(adminUsers).where(eq(adminUsers.municipalityId, muniId));
  }

  async getPendingMunicipalities(): Promise<Municipality[]> {
    return db.select().from(municipalities).where(eq(municipalities.approvalStatus, "pending"));
  }

  async approveMunicipality(id: number, status: string): Promise<void> {
    await db.update(municipalities).set({ approvalStatus: status }).where(eq(municipalities.id, id));
    // When approved, also set listed = true
    if (status === "approved") {
      await db.update(municipalities).set({ listed: true }).where(eq(municipalities.id, id));
    }
  }

  // ── Year management ────────────────────────────────────────────────────────────
  /** Delete all imported records (departments + revenue) for a given year. */
  async deleteDataByYear(muniId: number, year: string): Promise<{ departments: number; revenue: number }> {
    const [depts, rev] = await Promise.all([
      db.delete(departmentBudgets)
        .where(and(eq(departmentBudgets.municipalityId, muniId), eq(departmentBudgets.year, year)))
        .run(),
      db.delete(revenueSources)
        .where(and(eq(revenueSources.municipalityId, muniId), eq(revenueSources.year, year)))
        .run(),
    ]);
    return { departments: depts.rowsAffected ?? 0, revenue: rev.rowsAffected ?? 0 };
  }

  // ── Import batch records ────────────────────────────────────────────────────────
  async createImportBatchRecord(data: InsertImportBatchRecord): Promise<void> {
    await db.insert(importBatchRecords).values(data).run();
  }

  async getImportBatchRecords(batchId: number, muniId: number): Promise<ImportBatchRecord[]> {
    return db.select().from(importBatchRecords)
      .where(and(eq(importBatchRecords.batchId, batchId), eq(importBatchRecords.municipalityId, muniId)))
      .all();
  }

  // ── Field options ───────────────────────────────────────────────────────────
  /** Returns system defaults + municipality-specific options for a given fieldType. */
  async getFieldOptions(muniId: number, fieldType?: string): Promise<FieldOption[]> {
    const rows = await db.select().from(fieldOptions).all();
    return rows.filter(r =>
      (r.municipalityId === null || r.municipalityId === muniId) &&
      (fieldType === undefined || r.fieldType === fieldType)
    );
  }

  /** Returns all system+custom values for a muni as a map: fieldType -> string[] */
  async getFieldOptionsMap(muniId: number): Promise<Record<string, string[]>> {
    const rows = await this.getFieldOptions(muniId);
    const map: Record<string, string[]> = {};
    for (const r of rows) {
      if (!map[r.fieldType]) map[r.fieldType] = [];
      if (!map[r.fieldType].includes(r.value)) map[r.fieldType].push(r.value);
    }
    return map;
  }

  async createFieldOption(data: InsertFieldOption): Promise<FieldOption> {
    return db.insert(fieldOptions).values(data).returning().get();
  }

  async deleteFieldOption(id: number, muniId: number): Promise<void> {
    // Only allow deleting municipality-specific options (not system defaults)
    await db.delete(fieldOptions)
      .where(and(eq(fieldOptions.id, id), eq(fieldOptions.municipalityId, muniId)))
      .run();
  }

  /** Ensure a custom option exists; no-op if already present (case-insensitive). */
  async ensureCustomFieldOption(muniId: number, fieldType: string, value: string): Promise<void> {
    const existing = await this.getFieldOptions(muniId, fieldType);
    const lowVal = value.toLowerCase().trim();
    const alreadyExists = existing.some(o => o.value.toLowerCase().trim() === lowVal);
    if (!alreadyExists) {
      await this.createFieldOption({ municipalityId: muniId, fieldType, value, isSystem: false });
    }
  }
}

export const storage = new DatabaseStorage();
