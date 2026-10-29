import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  index,
} from "drizzle-orm/mysql-core";

/**
 * OllCLin - Banco de dados (Schema Drizzle)
 * Arquitetura MVC - Camada Model
 *
 * Entidades centrais baseadas na análise do Ti.Clinic v2.0
 * e no Relatório de Estratégia OllCLin.
 */

/* -------------------------------------------------------------------------- */
/*  1. ORGANIZAÇÃO / TENANT                                                   */
/* -------------------------------------------------------------------------- */
export const organizations = mysqlTable(
  "organizations",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    tradeName: varchar("trade_name", { length: 255 }),
    cnpj: varchar("cnpj", { length: 18 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 20 }),
    address: text("address"),
    city: varchar("city", { length: 100 }),
    state: varchar("state", { length: 2 }),
    zipCode: varchar("zip_code", { length: 10 }),
    timezone: varchar("timezone", { length: 64 }).default("America/Sao_Paulo").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    cnpjIdx: index("org_cnpj_idx").on(table.cnpj),
  }),
);

/* -------------------------------------------------------------------------- */
/*  2. ESTABELECIMENTO                                                        */
/* -------------------------------------------------------------------------- */
export const establishments = mysqlTable(
  "establishments",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    address: text("address"),
    city: varchar("city", { length: 100 }),
    state: varchar("state", { length: 2 }),
    zipCode: varchar("zip_code", { length: 10 }),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 320 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgIdx: index("est_org_idx").on(table.organizationId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  3. LOCAL DE ATENDIMENTO                                                   */
/* -------------------------------------------------------------------------- */
export const locations = mysqlTable(
  "locations",
  {
    id: int("id").autoincrement().primaryKey(),
    establishmentId: int("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    estIdx: index("loc_est_idx").on(table.establishmentId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  4. SALA                                                                   */
/* -------------------------------------------------------------------------- */
export const rooms = mysqlTable(
  "rooms",
  {
    id: int("id").autoincrement().primaryKey(),
    locationId: int("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    capacity: int("capacity").default(1).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    locIdx: index("room_loc_idx").on(table.locationId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  5. USUÁRIOS (estende o schema existente)                                  */
/* -------------------------------------------------------------------------- */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  role: mysqlEnum("role", ["admin", "user"]).default("user").notNull(),
  organizationId: int("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});

/* -------------------------------------------------------------------------- */
/*  6. PAPÉIS (ROLES)                                                         */
/* -------------------------------------------------------------------------- */
export const roles = mysqlTable("roles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* -------------------------------------------------------------------------- */
/*  7. USUÁRIO PAPEL (N:N)                                                    */
/* -------------------------------------------------------------------------- */
export const userRoles = mysqlTable(
  "user_roles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: int("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    organizationId: int("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("ur_user_idx").on(table.userId),
    roleIdx: index("ur_role_idx").on(table.roleId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  8. PROFISSIONAIS DE SAÚDE                                                 */
/* -------------------------------------------------------------------------- */
export const professionals = mysqlTable(
  "professionals",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
    organizationId: int("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    cpf: varchar("cpf", { length: 14 }),
    council: varchar("council", { length: 50 }), // CRM, CRO, etc.
    councilNumber: varchar("council_number", { length: 50 }),
    specialty: varchar("specialty", { length: 100 }),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 320 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgIdx: index("prof_org_idx").on(table.organizationId),
    userIdx: index("prof_user_idx").on(table.userId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  9. PROCEDIMENTOS                                                          */
/* -------------------------------------------------------------------------- */
export const procedures = mysqlTable(
  "procedures",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    durationMinutes: int("duration_minutes").default(30).notNull(),
    price: decimal("price", { precision: 10, scale: 2 }).default("0.00").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgIdx: index("proc_org_idx").on(table.organizationId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  10. PACIENTES                                                             */
/* -------------------------------------------------------------------------- */
export const patients = mysqlTable(
  "patients",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    socialName: varchar("social_name", { length: 255 }),
    cpf: varchar("cpf", { length: 14 }),
    rg: varchar("rg", { length: 20 }),
    birthDate: timestamp("birth_date"),
    gender: mysqlEnum("gender", ["M", "F", "O"]),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 320 }),
    address: text("address"),
    city: varchar("city", { length: 100 }),
    state: varchar("state", { length: 2 }),
    zipCode: varchar("zip_code", { length: 10 }),
    emergencyContact: varchar("emergency_contact", { length: 255 }),
    emergencyPhone: varchar("emergency_phone", { length: 20 }),
    consentDataSharing: boolean("consent_data_sharing").default(false).notNull(),
    consentMarketing: boolean("consent_marketing").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgIdx: index("pat_org_idx").on(table.organizationId),
    cpfIdx: index("pat_cpf_idx").on(table.cpf),
  }),
);

/* -------------------------------------------------------------------------- */
/*  11. AGENDAMENTOS                                                          */
/* -------------------------------------------------------------------------- */
export const appointments = mysqlTable(
  "appointments",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    patientId: int("patient_id").notNull().references(() => patients.id, { onDelete: "restrict" }),
    professionalId: int("professional_id").notNull().references(() => professionals.id, { onDelete: "restrict" }),
    procedureId: int("procedure_id").notNull().references(() => procedures.id, { onDelete: "restrict" }),
    establishmentId: int("establishment_id").references(() => establishments.id, { onDelete: "set null" }),
    locationId: int("location_id").references(() => locations.id, { onDelete: "set null" }),
    roomId: int("room_id").references(() => rooms.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    status: mysqlEnum("status", [
      "solicitado",
      "confirmado",
      "em_espera",
      "em_atendimento",
      "atendido",
      "faltou",
      "desmarcado",
    ]).default("solicitado").notNull(),
    googleCalendarEventId: varchar("google_calendar_event_id", { length: 255 }),
    recurrenceRule: text("recurrence_rule"), // iCal RRULE
    isRecurrenceParent: boolean("is_recurrence_parent").default(false).notNull(),
    recurrenceParentId: int("recurrence_parent_id").references(() => appointments.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgIdx: index("apt_org_idx").on(table.organizationId),
    patientIdx: index("apt_patient_idx").on(table.patientId),
    professionalIdx: index("apt_prof_idx").on(table.professionalId),
    statusIdx: index("apt_status_idx").on(table.status),
    startsAtIdx: index("apt_starts_at_idx").on(table.startsAt),
  }),
);

/* -------------------------------------------------------------------------- */
/*  12. AGENDAMENTO STATUS HISTORY (Auditoria)                                */
/* -------------------------------------------------------------------------- */
export const appointmentStatusHistory = mysqlTable(
  "appointment_status_history",
  {
    id: int("id").autoincrement().primaryKey(),
    appointmentId: int("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
    fromStatus: mysqlEnum("from_status", [
      "solicitado", "confirmado", "em_espera", "em_atendimento",
      "atendido", "faltou", "desmarcado",
    ]),
    toStatus: mysqlEnum("to_status", [
      "solicitado", "confirmado", "em_espera", "em_atendimento",
      "atendido", "faltou", "desmarcado",
    ]).notNull(),
    changedBy: int("changed_by").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    aptIdx: index("ash_apt_idx").on(table.appointmentId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  13. ATENDIMENTOS                                                          */
/* -------------------------------------------------------------------------- */
export const attendances = mysqlTable(
  "attendances",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    patientId: int("patient_id").notNull().references(() => patients.id, { onDelete: "restrict" }),
    appointmentId: int("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
    professionalId: int("professional_id").notNull().references(() => professionals.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at"),
    status: mysqlEnum("status", ["rascunho", "finalizado", "cancelado", "invalido"]).default("rascunho").notNull(),
    chiefComplaint: text("chief_complaint"),
    clinicalNotes: text("clinical_notes"),
    diagnosis: text("diagnosis"),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgIdx: index("att_org_idx").on(table.organizationId),
    patientIdx: index("att_patient_idx").on(table.patientId),
    statusIdx: index("att_status_idx").on(table.status),
  }),
);

/* -------------------------------------------------------------------------- */
/*  14. PRONTUÁRIO (Fichas versionadas)                                       */
/* -------------------------------------------------------------------------- */
export const medicalRecords = mysqlTable(
  "medical_records",
  {
    id: int("id").autoincrement().primaryKey(),
    attendanceId: int("attendance_id").notNull().references(() => attendances.id, { onDelete: "cascade" }),
    version: int("version").notNull().default(1),
    title: varchar("title", { length: 255 }),
    content: text("content").notNull(),
    isFinal: boolean("is_final").default(false).notNull(),
    signedBy: int("signed_by").references(() => users.id, { onDelete: "set null" }),
    signedAt: timestamp("signed_at"),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    attIdx: index("mr_att_idx").on(table.attendanceId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  15. PRESCRIÇÕES                                                           */
/* -------------------------------------------------------------------------- */
export const prescriptions = mysqlTable(
  "prescriptions",
  {
    id: int("id").autoincrement().primaryKey(),
    attendanceId: int("attendance_id").notNull().references(() => attendances.id, { onDelete: "cascade" }),
    professionalId: int("professional_id").notNull().references(() => professionals.id, { onDelete: "restrict" }),
    medication: varchar("medication", { length: 255 }).notNull(),
    presentation: varchar("presentation", { length: 100 }),
    dose: varchar("dose", { length: 100 }),
    route: varchar("route", { length: 50 }),
    frequency: varchar("frequency", { length: 100 }),
    duration: varchar("duration", { length: 100 }),
    quantity: varchar("quantity", { length: 100 }),
    instructions: text("instructions"),
    isControlled: boolean("is_controlled").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    attIdx: index("pres_att_idx").on(table.attendanceId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  16. SOLICITAÇÕES DE EXAMES                                                */
/* -------------------------------------------------------------------------- */
export const examRequests = mysqlTable(
  "exam_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    attendanceId: int("attendance_id").notNull().references(() => attendances.id, { onDelete: "cascade" }),
    professionalId: int("professional_id").notNull().references(() => professionals.id, { onDelete: "restrict" }),
    laboratoryId: int("laboratory_id").references(() => establishments.id, { onDelete: "set null" }),
    status: mysqlEnum("status", ["rascunho", "solicitado", "coletado", "recebido", "liberado", "cancelado"]).default("rascunho").notNull(),
    deliveryDate: timestamp("delivery_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    attIdx: index("er_att_idx").on(table.attendanceId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  17. ITENS DE EXAME                                                        */
/* -------------------------------------------------------------------------- */
export const examItems = mysqlTable(
  "exam_items",
  {
    id: int("id").autoincrement().primaryKey(),
    examRequestId: int("exam_request_id").notNull().references(() => examRequests.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    result: text("result"),
    reportUrl: varchar("report_url", { length: 500 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    reqIdx: index("ei_req_idx").on(table.examRequestId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  18. AUDITORIA GERAL                                                       */
/* -------------------------------------------------------------------------- */
export const auditLog = mysqlTable(
  "audit_log",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),
    entity: varchar("entity", { length: 100 }).notNull(),
    entityId: int("entity_id"),
    oldValues: text("old_values"),
    newValues: text("new_values"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("audit_org_idx").on(table.organizationId),
    userIdx: index("audit_user_idx").on(table.userId),
    entityIdx: index("audit_entity_idx").on(table.entity, table.entityId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  TIPOS                                                                     */
/* -------------------------------------------------------------------------- */
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

export type Establishment = typeof establishments.$inferSelect;
export type InsertEstablishment = typeof establishments.$inferInsert;

export type Location = typeof locations.$inferSelect;
export type InsertLocation = typeof locations.$inferInsert;

export type Room = typeof rooms.$inferSelect;
export type InsertRoom = typeof rooms.$inferInsert;

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Role = typeof roles.$inferSelect;
export type InsertRole = typeof roles.$inferInsert;

export type UserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = typeof userRoles.$inferInsert;

export type Professional = typeof professionals.$inferSelect;
export type InsertProfessional = typeof professionals.$inferInsert;

export type Procedure = typeof procedures.$inferSelect;
export type InsertProcedure = typeof procedures.$inferInsert;

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;

export type AppointmentStatusHistory = typeof appointmentStatusHistory.$inferSelect;
export type InsertAppointmentStatusHistory = typeof appointmentStatusHistory.$inferInsert;

export type Attendance = typeof attendances.$inferSelect;
export type InsertAttendance = typeof attendances.$inferInsert;

export type MedicalRecord = typeof medicalRecords.$inferSelect;
export type InsertMedicalRecord = typeof medicalRecords.$inferInsert;

export type Prescription = typeof prescriptions.$inferSelect;
export type InsertPrescription = typeof prescriptions.$inferInsert;

export type ExamRequest = typeof examRequests.$inferSelect;
export type InsertExamRequest = typeof examRequests.$inferInsert;

export type ExamItem = typeof examItems.$inferSelect;
export type InsertExamItem = typeof examItems.$inferInsert;

export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = typeof auditLog.$inferInsert;