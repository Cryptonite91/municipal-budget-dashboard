import {
  type Municipality, type InsertMunicipality, municipalities,
  type RevenueSource, type InsertRevenueSource, revenueSources,
  type DepartmentBudget, type InsertDepartmentBudget, departmentBudgets,
  type CapitalProject, type InsertCapitalProject, capitalProjects,
  type UploadHistory, type InsertUploadHistory, uploadHistory,
  type CitizenComment, type InsertCitizenComment, citizenComments,
  type EmailSubscriber, type InsertEmailSubscriber, emailSubscribers,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and } from "drizzle-orm";

import { mkdirSync } from "fs";
import { dirname } from "path";

const dbPath = process.env.DATABASE_PATH || "data.db";
// Ensure the directory exists (important for Railway volume mounts like /data/data.db)
const dbDir = dirname(dbPath);
if (dbDir && dbDir !== ".") {
  try { mkdirSync(dbDir, { recursive: true }); } catch {}
}
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export interface IStorage {
  // Municipality (tenant)
  getMunicipalityBySlug(slug: string): Promise<Municipality | undefined>;
  getMunicipalityById(id: number): Promise<Municipality | undefined>;
  getAllMunicipalities(): Promise<Municipality[]>;
  createMunicipality(data: InsertMunicipality): Promise<Municipality>;
  updateMunicipality(id: number, data: Partial<InsertMunicipality>): Promise<Municipality>;

  // Revenue (tenant-scoped)
  getRevenueSources(muniId: number, year: string): Promise<RevenueSource[]>;
  getAllRevenueSources(muniId: number): Promise<RevenueSource[]>;
  createRevenueSource(data: InsertRevenueSource): Promise<RevenueSource>;
  clearRevenueSourcesByYear(muniId: number, year: string): Promise<void>;

  // Departments (tenant-scoped)
  getDepartmentBudgets(muniId: number, year: string): Promise<DepartmentBudget[]>;
  getAllDepartmentBudgets(muniId: number): Promise<DepartmentBudget[]>;
  createDepartmentBudget(data: InsertDepartmentBudget): Promise<DepartmentBudget>;
  clearDepartmentBudgetsByYear(muniId: number, year: string): Promise<void>;

  // Projects (tenant-scoped)
  getCapitalProjects(muniId: number): Promise<CapitalProject[]>;
  createCapitalProject(data: InsertCapitalProject): Promise<CapitalProject>;
  clearCapitalProjects(muniId: number): Promise<void>;

  // Upload history (tenant-scoped)
  getUploadHistory(muniId: number): Promise<UploadHistory[]>;
  createUploadHistory(data: InsertUploadHistory): Promise<UploadHistory>;

  // Available years (tenant-scoped)
  getAvailableYears(muniId: number): Promise<string[]>;

  // Comments (tenant-scoped)
  getComments(muniId: number, approved?: boolean): Promise<CitizenComment[]>;
  createComment(data: InsertCitizenComment): Promise<CitizenComment>;
  approveComment(id: number): Promise<void>;
  deleteComment(id: number): Promise<void>;

  // Subscribers (tenant-scoped)
  createSubscriber(data: InsertEmailSubscriber): Promise<EmailSubscriber>;
  getSubscribers(muniId: number): Promise<EmailSubscriber[]>;
  isSubscribed(muniId: number, email: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // ── Municipalities ──────────────────────────────────────────────────────────
  async getMunicipalityBySlug(slug: string): Promise<Municipality | undefined> {
    return db.select().from(municipalities).where(eq(municipalities.slug, slug)).get();
  }

  async getMunicipalityById(id: number): Promise<Municipality | undefined> {
    return db.select().from(municipalities).where(eq(municipalities.id, id)).get();
  }

  async getAllMunicipalities(): Promise<Municipality[]> {
    return db.select().from(municipalities).all();
  }

  async createMunicipality(data: InsertMunicipality): Promise<Municipality> {
    return db.insert(municipalities).values(data).returning().get();
  }

  async updateMunicipality(id: number, data: Partial<InsertMunicipality>): Promise<Municipality> {
    db.update(municipalities).set(data).where(eq(municipalities.id, id)).run();
    return db.select().from(municipalities).where(eq(municipalities.id, id)).get()!;
  }

  // ── Revenue ─────────────────────────────────────────────────────────────────
  async getRevenueSources(muniId: number, year: string): Promise<RevenueSource[]> {
    return db.select().from(revenueSources)
      .where(and(eq(revenueSources.municipalityId, muniId), eq(revenueSources.year, year))).all();
  }

  async getAllRevenueSources(muniId: number): Promise<RevenueSource[]> {
    return db.select().from(revenueSources).where(eq(revenueSources.municipalityId, muniId)).all();
  }

  async createRevenueSource(data: InsertRevenueSource): Promise<RevenueSource> {
    return db.insert(revenueSources).values(data).returning().get();
  }

  async clearRevenueSourcesByYear(muniId: number, year: string): Promise<void> {
    db.delete(revenueSources)
      .where(and(eq(revenueSources.municipalityId, muniId), eq(revenueSources.year, year))).run();
  }

  // ── Departments ─────────────────────────────────────────────────────────────
  async getDepartmentBudgets(muniId: number, year: string): Promise<DepartmentBudget[]> {
    return db.select().from(departmentBudgets)
      .where(and(eq(departmentBudgets.municipalityId, muniId), eq(departmentBudgets.year, year))).all();
  }

  async getAllDepartmentBudgets(muniId: number): Promise<DepartmentBudget[]> {
    return db.select().from(departmentBudgets).where(eq(departmentBudgets.municipalityId, muniId)).all();
  }

  async createDepartmentBudget(data: InsertDepartmentBudget): Promise<DepartmentBudget> {
    return db.insert(departmentBudgets).values(data).returning().get();
  }

  async clearDepartmentBudgetsByYear(muniId: number, year: string): Promise<void> {
    db.delete(departmentBudgets)
      .where(and(eq(departmentBudgets.municipalityId, muniId), eq(departmentBudgets.year, year))).run();
  }

  // ── Projects ────────────────────────────────────────────────────────────────
  async getCapitalProjects(muniId: number): Promise<CapitalProject[]> {
    return db.select().from(capitalProjects).where(eq(capitalProjects.municipalityId, muniId)).all();
  }

  async createCapitalProject(data: InsertCapitalProject): Promise<CapitalProject> {
    return db.insert(capitalProjects).values(data).returning().get();
  }

  async clearCapitalProjects(muniId: number): Promise<void> {
    db.delete(capitalProjects).where(eq(capitalProjects.municipalityId, muniId)).run();
  }

  // ── Upload history ───────────────────────────────────────────────────────────
  async getUploadHistory(muniId: number): Promise<UploadHistory[]> {
    return db.select().from(uploadHistory).where(eq(uploadHistory.municipalityId, muniId)).all();
  }

  async createUploadHistory(data: InsertUploadHistory): Promise<UploadHistory> {
    return db.insert(uploadHistory).values(data).returning().get();
  }

  // ── Available years ─────────────────────────────────────────────────────────
  async getAvailableYears(muniId: number): Promise<string[]> {
    const deptYears = db.select({ year: departmentBudgets.year }).from(departmentBudgets)
      .where(eq(departmentBudgets.municipalityId, muniId)).all();
    const revYears = db.select({ year: revenueSources.year }).from(revenueSources)
      .where(eq(revenueSources.municipalityId, muniId)).all();
    const allYears = new Set([...deptYears.map(r => r.year), ...revYears.map(r => r.year)]);
    return Array.from(allYears).sort().reverse();
  }

  // ── Comments ────────────────────────────────────────────────────────────────
  async getComments(muniId: number, approved?: boolean): Promise<CitizenComment[]> {
    if (approved !== undefined) {
      return db.select().from(citizenComments)
        .where(and(
          eq(citizenComments.municipalityId, muniId),
          eq(citizenComments.approved, approved),
        )).all();
    }
    return db.select().from(citizenComments).where(eq(citizenComments.municipalityId, muniId)).all();
  }

  async createComment(data: InsertCitizenComment): Promise<CitizenComment> {
    return db.insert(citizenComments).values(data).returning().get();
  }

  async approveComment(id: number): Promise<void> {
    db.update(citizenComments).set({ approved: true }).where(eq(citizenComments.id, id)).run();
  }

  async deleteComment(id: number): Promise<void> {
    db.delete(citizenComments).where(eq(citizenComments.id, id)).run();
  }

  // ── Subscribers ─────────────────────────────────────────────────────────────
  async createSubscriber(data: InsertEmailSubscriber): Promise<EmailSubscriber> {
    return db.insert(emailSubscribers).values(data).returning().get();
  }

  async getSubscribers(muniId: number): Promise<EmailSubscriber[]> {
    return db.select().from(emailSubscribers)
      .where(and(eq(emailSubscribers.municipalityId, muniId), eq(emailSubscribers.active, true))).all();
  }

  async isSubscribed(muniId: number, email: string): Promise<boolean> {
    const row = db.select().from(emailSubscribers)
      .where(and(
        eq(emailSubscribers.municipalityId, muniId),
        eq(emailSubscribers.email, email),
        eq(emailSubscribers.active, true),
      )).get();
    return !!row;
  }
}

export const storage = new DatabaseStorage();
