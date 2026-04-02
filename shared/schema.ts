import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Municipality configuration
export const municipality = sqliteTable("municipality", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  state: text("state").notNull(),
  population: integer("population").notNull(),
  fiscalYear: text("fiscal_year").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  website: text("website"),
  lastUpdated: text("last_updated").notNull(),
});

export const insertMunicipalitySchema = createInsertSchema(municipality).omit({ id: true });
export type InsertMunicipality = z.infer<typeof insertMunicipalitySchema>;
export type Municipality = typeof municipality.$inferSelect;

// Revenue sources
export const revenueSources = sqliteTable("revenue_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  year: text("year").notNull(),
  source: text("source").notNull(),
  category: text("category").notNull(), // Property Taxes, State Aid, Fees, Grants, Other
  budgetedAmount: real("budgeted_amount").notNull(),
  collectedAmount: real("collected_amount").notNull(),
});

export const insertRevenueSourceSchema = createInsertSchema(revenueSources).omit({ id: true });
export type InsertRevenueSource = z.infer<typeof insertRevenueSourceSchema>;
export type RevenueSource = typeof revenueSources.$inferSelect;

// Department budgets
export const departmentBudgets = sqliteTable("department_budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  year: text("year").notNull(),
  department: text("department").notNull(),
  category: text("category").notNull(), // sub-category within department
  budgetedAmount: real("budgeted_amount").notNull(),
  spentAmount: real("spent_amount").notNull(),
});

export const insertDepartmentBudgetSchema = createInsertSchema(departmentBudgets).omit({ id: true });
export type InsertDepartmentBudget = z.infer<typeof insertDepartmentBudgetSchema>;
export type DepartmentBudget = typeof departmentBudgets.$inferSelect;

// Capital projects
export const capitalProjects = sqliteTable("capital_projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  department: text("department").notNull(),
  totalBudget: real("total_budget").notNull(),
  spentToDate: real("spent_to_date").notNull(),
  percentComplete: integer("percent_complete").notNull(),
  startDate: text("start_date").notNull(),
  expectedEnd: text("expected_end").notNull(),
  status: text("status").notNull(), // on-track, at-risk, behind
  description: text("description"),
});

export const insertCapitalProjectSchema = createInsertSchema(capitalProjects).omit({ id: true });
export type InsertCapitalProject = z.infer<typeof insertCapitalProjectSchema>;
export type CapitalProject = typeof capitalProjects.$inferSelect;

// Upload history
export const uploadHistory = sqliteTable("upload_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
  recordCount: integer("record_count").notNull(),
  status: text("status").notNull(), // success, error
  notes: text("notes"),
});

export const insertUploadHistorySchema = createInsertSchema(uploadHistory).omit({ id: true });
export type InsertUploadHistory = z.infer<typeof insertUploadHistorySchema>;
export type UploadHistory = typeof uploadHistory.$inferSelect;
