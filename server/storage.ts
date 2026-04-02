import {
  type Municipality, type InsertMunicipality, municipality,
  type RevenueSource, type InsertRevenueSource, revenueSources,
  type DepartmentBudget, type InsertDepartmentBudget, departmentBudgets,
  type CapitalProject, type InsertCapitalProject, capitalProjects,
  type UploadHistory, type InsertUploadHistory, uploadHistory,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export interface IStorage {
  getMunicipality(): Promise<Municipality | undefined>;
  upsertMunicipality(data: InsertMunicipality): Promise<Municipality>;

  getRevenueSources(year: string): Promise<RevenueSource[]>;
  getAllRevenueSources(): Promise<RevenueSource[]>;
  createRevenueSource(data: InsertRevenueSource): Promise<RevenueSource>;
  clearRevenueSourcesByYear(year: string): Promise<void>;

  getDepartmentBudgets(year: string): Promise<DepartmentBudget[]>;
  getAllDepartmentBudgets(): Promise<DepartmentBudget[]>;
  createDepartmentBudget(data: InsertDepartmentBudget): Promise<DepartmentBudget>;
  clearDepartmentBudgetsByYear(year: string): Promise<void>;

  getCapitalProjects(): Promise<CapitalProject[]>;
  createCapitalProject(data: InsertCapitalProject): Promise<CapitalProject>;
  clearCapitalProjects(): Promise<void>;

  getUploadHistory(): Promise<UploadHistory[]>;
  createUploadHistory(data: InsertUploadHistory): Promise<UploadHistory>;

  getAvailableYears(): Promise<string[]>;
}

export class DatabaseStorage implements IStorage {
  async getMunicipality(): Promise<Municipality | undefined> {
    return db.select().from(municipality).get();
  }

  async upsertMunicipality(data: InsertMunicipality): Promise<Municipality> {
    const existing = await this.getMunicipality();
    if (existing) {
      db.update(municipality).set(data).where(eq(municipality.id, existing.id)).run();
      return { ...existing, ...data };
    }
    return db.insert(municipality).values(data).returning().get();
  }

  async getRevenueSources(year: string): Promise<RevenueSource[]> {
    return db.select().from(revenueSources).where(eq(revenueSources.year, year)).all();
  }

  async getAllRevenueSources(): Promise<RevenueSource[]> {
    return db.select().from(revenueSources).all();
  }

  async createRevenueSource(data: InsertRevenueSource): Promise<RevenueSource> {
    return db.insert(revenueSources).values(data).returning().get();
  }

  async clearRevenueSourcesByYear(year: string): Promise<void> {
    db.delete(revenueSources).where(eq(revenueSources.year, year)).run();
  }

  async getDepartmentBudgets(year: string): Promise<DepartmentBudget[]> {
    return db.select().from(departmentBudgets).where(eq(departmentBudgets.year, year)).all();
  }

  async getAllDepartmentBudgets(): Promise<DepartmentBudget[]> {
    return db.select().from(departmentBudgets).all();
  }

  async createDepartmentBudget(data: InsertDepartmentBudget): Promise<DepartmentBudget> {
    return db.insert(departmentBudgets).values(data).returning().get();
  }

  async clearDepartmentBudgetsByYear(year: string): Promise<void> {
    db.delete(departmentBudgets).where(eq(departmentBudgets.year, year)).run();
  }

  async getCapitalProjects(): Promise<CapitalProject[]> {
    return db.select().from(capitalProjects).all();
  }

  async createCapitalProject(data: InsertCapitalProject): Promise<CapitalProject> {
    return db.insert(capitalProjects).values(data).returning().get();
  }

  async clearCapitalProjects(): Promise<void> {
    db.delete(capitalProjects).run();
  }

  async getUploadHistory(): Promise<UploadHistory[]> {
    return db.select().from(uploadHistory).all();
  }

  async createUploadHistory(data: InsertUploadHistory): Promise<UploadHistory> {
    return db.insert(uploadHistory).values(data).returning().get();
  }

  async getAvailableYears(): Promise<string[]> {
    const deptYears = db.select({ year: departmentBudgets.year }).from(departmentBudgets).all();
    const revYears = db.select({ year: revenueSources.year }).from(revenueSources).all();
    const allYears = new Set([...deptYears.map(r => r.year), ...revYears.map(r => r.year)]);
    return Array.from(allYears).sort().reverse();
  }
}

export const storage = new DatabaseStorage();
