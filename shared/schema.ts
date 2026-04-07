import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Municipalities (one row per tenant) ─────────────────────────────────────
export const municipalities = sqliteTable("municipalities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),          // URL identifier: "maplewood-vt"
  name: text("name").notNull(),
  state: text("state").notNull(),
  population: integer("population").notNull(),
  fiscalYear: text("fiscal_year").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  website: text("website"),
  lastUpdated: text("last_updated").notNull(),
  adminPasswordHash: text("admin_password_hash").notNull(), // bcrypt hash
  // Publish flags — controls what citizens can see
  revenuePublished: integer("revenue_published", { mode: "boolean" }).notNull().default(false),
  departmentsPublished: integer("departments_published", { mode: "boolean" }).notNull().default(false),
  projectsPublished: integer("projects_published", { mode: "boolean" }).notNull().default(false),
  // Onboarding
  onboardingComplete: integer("onboarding_complete", { mode: "boolean" }).notNull().default(false),
  // Directory listing — when false, municipality is hidden from explorer AND public URL shows placeholder
  listed: integer("listed", { mode: "boolean" }).notNull().default(false),
  // Approval status: pending | approved | rejected  (approved = live)
  approvalStatus: text("approval_status").notNull().default("approved"),
});

export const insertMunicipalitySchema = createInsertSchema(municipalities).omit({ id: true });
export type InsertMunicipality = z.infer<typeof insertMunicipalitySchema>;
export type Municipality = typeof municipalities.$inferSelect;

// ─── Admin users (municipal or platform role) ────────────────────────────────
export const adminUsers = sqliteTable("admin_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // role: "municipal" = scoped to one municipality; "platform" = super-admin
  role: text("role").notNull().default("municipal"), // "municipal" | "platform"
  municipalityId: integer("municipality_id"),         // null for platform admins
  createdAt: text("created_at").notNull(),
});

export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({ id: true });
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type AdminUser = typeof adminUsers.$inferSelect;

// ─── Revenue sources ──────────────────────────────────────────────────────────
export const revenueSources = sqliteTable("revenue_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  municipalityId: integer("municipality_id").notNull(),
  year: text("year").notNull(),
  source: text("source").notNull(),
  category: text("category").notNull(),
  budgetedAmount: real("budgeted_amount").notNull(),
  collectedAmount: real("collected_amount").notNull(),
});

export const insertRevenueSourceSchema = createInsertSchema(revenueSources).omit({ id: true });
export type InsertRevenueSource = z.infer<typeof insertRevenueSourceSchema>;
export type RevenueSource = typeof revenueSources.$inferSelect;

// ─── Department budgets ───────────────────────────────────────────────────────
export const departmentBudgets = sqliteTable("department_budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  municipalityId: integer("municipality_id").notNull(),
  year: text("year").notNull(),
  department: text("department").notNull(),
  category: text("category").notNull(),
  budgetedAmount: real("budgeted_amount").notNull(),
  spentAmount: real("spent_amount").notNull(),
});

export const insertDepartmentBudgetSchema = createInsertSchema(departmentBudgets).omit({ id: true });
export type InsertDepartmentBudget = z.infer<typeof insertDepartmentBudgetSchema>;
export type DepartmentBudget = typeof departmentBudgets.$inferSelect;

// ─── Capital projects ─────────────────────────────────────────────────────────
export const capitalProjects = sqliteTable("capital_projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  municipalityId: integer("municipality_id").notNull(),
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

// ─── Upload history ───────────────────────────────────────────────────────────
export const uploadHistory = sqliteTable("upload_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  municipalityId: integer("municipality_id").notNull(),
  filename: text("filename").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
  recordCount: integer("record_count").notNull(),
  status: text("status").notNull(), // success, error
  notes: text("notes"),
  // Added: makes year-management and history detail possible
  dataType: text("data_type"),  // "departments" | "revenue" | "projects"
  year: text("year"),           // plain 4-digit year, e.g. "2026"
});

export const insertUploadHistorySchema = createInsertSchema(uploadHistory).omit({ id: true });
export type InsertUploadHistory = z.infer<typeof insertUploadHistorySchema>;
export type UploadHistory = typeof uploadHistory.$inferSelect;

// ─── Import batch records (lightweight snapshot for history detail) ───────────
export const importBatchRecords = sqliteTable("import_batch_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchId: integer("batch_id").notNull(),          // FK → upload_history.id
  municipalityId: integer("municipality_id").notNull(),
  recordJson: text("record_json").notNull(),        // JSON-stringified row
});

export const insertImportBatchRecordSchema = createInsertSchema(importBatchRecords).omit({ id: true });
export type InsertImportBatchRecord = z.infer<typeof insertImportBatchRecordSchema>;
export type ImportBatchRecord = typeof importBatchRecords.$inferSelect;

// ─── Citizen comments ─────────────────────────────────────────────────────────
export const citizenComments = sqliteTable("citizen_comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  municipalityId: integer("municipality_id").notNull(),
  section: text("section").notNull(),   // "revenue" | "departments" | "projects" | "general"
  name: text("name"),                    // optional
  email: text("email"),                  // optional
  message: text("message").notNull(),
  submittedAt: text("submitted_at").notNull(),
  approved: integer("approved", { mode: "boolean" }).notNull().default(false),
});

export const insertCitizenCommentSchema = createInsertSchema(citizenComments).omit({ id: true });
export type InsertCitizenComment = z.infer<typeof insertCitizenCommentSchema>;
export type CitizenComment = typeof citizenComments.$inferSelect;

// ─── Email subscribers ────────────────────────────────────────────────────────
export const emailSubscribers = sqliteTable("email_subscribers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  municipalityId: integer("municipality_id").notNull(),
  email: text("email").notNull(),
  subscribedAt: text("subscribed_at").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const insertEmailSubscriberSchema = createInsertSchema(emailSubscribers).omit({ id: true });
export type InsertEmailSubscriber = z.infer<typeof insertEmailSubscriberSchema>;
export type EmailSubscriber = typeof emailSubscribers.$inferSelect;

// ─── Field options (controlled vocabulary for dept/source/category) ─────────
// System defaults have municipality_id = null, isSystem = true.
// Municipality-specific custom values have municipality_id = <id>, isSystem = false.
// fieldType: "department" | "source" | "dept_category" | "rev_category"
export const fieldOptions = sqliteTable("field_options", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  municipalityId: integer("municipality_id"),  // null = system default
  fieldType: text("field_type").notNull(),      // "department" | "source" | "dept_category" | "rev_category"
  value: text("value").notNull(),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
});

export const insertFieldOptionSchema = createInsertSchema(fieldOptions).omit({ id: true });
export type InsertFieldOption = z.infer<typeof insertFieldOptionSchema>;
export type FieldOption = typeof fieldOptions.$inferSelect;

// ─── Population figures (one per year per municipality) ─────────────────────────
export const populationFigures = sqliteTable("population_figures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  municipalityId: integer("municipality_id").notNull(),
  year: text("year").notNull(),          // plain 4-digit year
  population: integer("population").notNull(),
});

export const insertPopulationFigureSchema = createInsertSchema(populationFigures).omit({ id: true });
export type InsertPopulationFigure = z.infer<typeof insertPopulationFigureSchema>;
export type PopulationFigure = typeof populationFigures.$inferSelect;

// ─── Budget documents ───────────────────────────────────────────────────────────────
export const budgetDocuments = sqliteTable("budget_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  municipalityId: integer("municipality_id").notNull(),
  filename: text("filename").notNull(),      // stored filename on disk
  originalName: text("original_name").notNull(), // user-facing display name
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),           // bytes
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  uploadedAt: text("uploaded_at").notNull(),
  description: text("description"),          // optional admin note
  year: text("year"),                        // optional fiscal year tag
  aiReviewLog: text("ai_review_log"),        // JSON: AI proposal + admin decision (audit log)
});

export const insertBudgetDocumentSchema = createInsertSchema(budgetDocuments).omit({ id: true });
export type InsertBudgetDocument = z.infer<typeof insertBudgetDocumentSchema>;
export type BudgetDocument = typeof budgetDocuments.$inferSelect;
