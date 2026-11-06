var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/_core/env.ts
var ENV;
var init_env = __esm({
  "server/_core/env.ts"() {
    "use strict";
    ENV = {
      get appId() {
        return process.env.MANUS_PROJECT_ID ?? "";
      },
      get cookieSecret() {
        return process.env.MANUS_JWT_SECRET ?? "";
      },
      get databaseUrl() {
        return process.env.DATABASE_URL ?? "";
      },
      get oAuthServerUrl() {
        return process.env.MANUS_OAUTH_API_URL ?? "";
      },
      // Preserve the legacy hint when supplied; otherwise roles remain application data.
      get ownerOpenId() {
        return process.env.OWNER_OPEN_ID ?? "";
      },
      get isProduction() {
        return process.env.NODE_ENV === "production";
      },
      get forgeApiUrl() {
        return process.env.MANUS_API_URL ?? "";
      },
      get forgeApiKey() {
        return process.env.MANUS_API_KEY ?? "";
      },
      // Supabase configuration
      get supabaseUrl() {
        return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
      },
      get supabaseAnonKey() {
        return process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
      },
      get supabaseServiceKey() {
        return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
      },
      get supabaseJwksUrl() {
        return process.env.SUPABASE_JWKS_URL ?? (ENV.supabaseUrl ? `${ENV.supabaseUrl}/auth/v1/.well-known/jwks.json` : "");
      }
    };
  }
});

// server/lib/supabase-server.ts
import { createClient } from "@supabase/supabase-js";
function getSupabaseAdmin() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceKey) {
    throw new Error(
      "Supabase n\xE3o configurado: defina SUPABASE_URL e SUPABASE_SECRET_KEY no .env"
    );
  }
  if (!adminClient) {
    adminClient = createClient(ENV.supabaseUrl, ENV.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return adminClient;
}
async function checkSupabaseConnection() {
  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase.from("organizations").select("id", { count: "exact", head: true });
    if (error) return { ok: false, message: error.message };
    return {
      ok: true,
      message: "Conex\xE3o com o Supabase estabelecida",
      organizations: count ?? 0
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Erro desconhecido"
    };
  }
}
var adminClient;
var init_supabase_server = __esm({
  "server/lib/supabase-server.ts"() {
    "use strict";
    init_env();
    adminClient = null;
  }
});

// server/models/provisioning.model.ts
var provisioning_model_exports = {};
__export(provisioning_model_exports, {
  createInvitation: () => createInvitation,
  createLocalUser: () => createLocalUser,
  createProvisionedOrganization: () => createProvisionedOrganization,
  findLocalUserIdByEmail: () => findLocalUserIdByEmail,
  findOrganizationByEmail: () => findOrganizationByEmail,
  findOrganizationByGatewayRef: () => findOrganizationByGatewayRef,
  findValidInvitationByHash: () => findValidInvitationByHash,
  generateToken: () => generateToken,
  hashToken: () => hashToken,
  listOrganizationMembersWithPermissions: () => listOrganizationMembersWithPermissions2,
  listPlans: () => listPlans,
  markInvitationUsed: () => markInvitationUsed,
  nextUserId: () => nextUserId,
  recordWebhookEventOnce: () => recordWebhookEventOnce,
  setOrganizationStatus: () => setOrganizationStatus,
  upsertMembership: () => upsertMembership
});
import { createHash as createHash2, randomBytes as randomBytes3 } from "node:crypto";
function hashToken(token) {
  return createHash2("sha256").update(token).digest("hex");
}
function generateToken() {
  return randomBytes3(32).toString("base64url");
}
async function listPlans() {
  const { data, error } = await getSupabaseAdmin().from("saas_plans").select("key, name, price_cents, max_users, features").eq("is_active", true).order("sort_order", { ascending: true });
  if (error) throw new Error(`saas_plans: ${error.message}`);
  return (data ?? []).map((row) => ({
    key: String(row.key),
    name: String(row.name),
    priceCents: Number(row.price_cents),
    maxUsers: Number(row.max_users),
    features: Array.isArray(row.features) ? row.features : []
  }));
}
async function findOrganizationByGatewayRef(gatewayCustomerId, subscriptionId) {
  if (!gatewayCustomerId && !subscriptionId) return null;
  const admin = getSupabaseAdmin();
  let query = admin.from("organizations").select("id, status, plan_key");
  if (subscriptionId) query = query.eq("gateway_subscription_id", subscriptionId);
  else query = query.eq("gateway_customer_id", gatewayCustomerId);
  const { data } = await query.limit(1).maybeSingle();
  return data ?? null;
}
async function createProvisionedOrganization(input) {
  const { data, error } = await getSupabaseAdmin().from("organizations").insert({
    name: input.name,
    email: input.email,
    is_active: true,
    status: "active",
    plan: "paid",
    plan_key: input.planKey,
    payment_provider: input.provider,
    gateway_customer_id: input.gatewayCustomerId,
    gateway_subscription_id: input.gatewaySubscriptionId
  }).select("id").single();
  if (error) throw new Error(`organizations: ${error.message}`);
  return Number(data.id);
}
async function setOrganizationStatus(organizationId, status) {
  const { error } = await getSupabaseAdmin().from("organizations").update({ status }).eq("id", organizationId);
  if (error) throw new Error(`organizations: ${error.message}`);
}
async function findOrganizationByEmail(email) {
  const { data } = await getSupabaseAdmin().from("organizations").select("id, name").ilike("email", email).limit(1).maybeSingle();
  return data ?? null;
}
async function findLocalUserIdByEmail(email) {
  const { data } = await getSupabaseAdmin().from("users").select("id").ilike("email", email).limit(1).maybeSingle();
  return data ? Number(data.id) : null;
}
async function nextUserId() {
  const { data } = await getSupabaseAdmin().from("users").select("id").order("id", { ascending: false }).limit(1);
  return Number(data?.[0]?.id ?? 0) + 1;
}
async function createLocalUser(input) {
  const id = await nextUserId();
  const { data, error } = await getSupabaseAdmin().from("users").insert({
    id,
    open_id: `supabase:${input.email.toLowerCase()}`,
    name: input.name,
    email: input.email.toLowerCase(),
    login_method: "supabase",
    role: input.role,
    organization_id: input.organizationId,
    is_owner: input.isOwner
  }).select("id").single();
  if (error) throw new Error(`users: ${error.message}`);
  return Number(data.id);
}
async function upsertMembership(input) {
  const { error } = await getSupabaseAdmin().from("organization_members").upsert(
    {
      organization_id: input.organizationId,
      user_id: input.userId,
      role: input.role,
      status: input.status,
      invited_by: input.invitedBy ?? null
    },
    { onConflict: "organization_id,user_id" }
  );
  if (error) throw new Error(`organization_members: ${error.message}`);
}
async function listOrganizationMembersWithPermissions2(organizationId) {
  const admin = getSupabaseAdmin();
  const { data: members, error } = await admin.from("organization_members").select("user_id, role, status").eq("organization_id", organizationId).order("created_at", { ascending: true });
  if (error) throw new Error(`organization_members: ${error.message}`);
  const rows = members ?? [];
  if (rows.length === 0) return [];
  const userIds = rows.map((row) => Number(row.user_id));
  const { data: users2, error: usersError } = await admin.from("users").select("id, name, email, is_owner").in("id", userIds);
  if (usersError) throw new Error(`users: ${usersError.message}`);
  const { data: permissions, error: permissionsError } = await admin.from("member_permissions").select("user_id, area_key, access_level").eq("organization_id", organizationId).in("user_id", userIds);
  if (permissionsError) throw new Error(`member_permissions: ${permissionsError.message}`);
  const usersById = /* @__PURE__ */ new Map();
  for (const user of users2 ?? []) usersById.set(Number(user.id), user);
  const permissionsByUser = /* @__PURE__ */ new Map();
  for (const permission of permissions ?? []) {
    const userId = Number(permission.user_id);
    const current = permissionsByUser.get(userId) ?? {};
    current[String(permission.area_key)] = String(permission.access_level);
    permissionsByUser.set(userId, current);
  }
  return rows.map((row) => {
    const userId = Number(row.user_id);
    const user = usersById.get(userId);
    return {
      userId,
      name: user?.name ? String(user.name) : null,
      email: user?.email ? String(user.email) : null,
      role: String(row.role),
      status: String(row.status),
      isOwner: user?.is_owner === true,
      permissions: permissionsByUser.get(userId) ?? {}
    };
  });
}
async function createInvitation(input) {
  const { data, error } = await getSupabaseAdmin().from("account_invitations").insert({
    organization_id: input.organizationId,
    email: input.email.toLowerCase(),
    role: input.role,
    type: input.type,
    token_hash: input.tokenHash,
    expires_at: input.expiresAt.toISOString(),
    invited_by: input.invitedBy
  }).select("id").single();
  if (error) throw new Error(`account_invitations: ${error.message}`);
  return Number(data.id);
}
async function findValidInvitationByHash(tokenHash) {
  const { data, error } = await getSupabaseAdmin().from("account_invitations").select("id, organization_id, email, role, type, expires_at, used_at, organizations!inner(name)").eq("token_hash", tokenHash).limit(1).maybeSingle();
  if (error || !data) return null;
  const invitation = {
    id: Number(data.id),
    organizationId: Number(data.organization_id),
    email: String(data.email),
    role: String(data.role),
    type: String(data.type),
    expiresAt: String(data.expires_at),
    usedAt: data.used_at ? String(data.used_at) : null,
    organizationName: String(data.organizations?.name ?? "")
  };
  if (invitation.usedAt) return null;
  if (new Date(invitation.expiresAt).getTime() < Date.now()) return null;
  return invitation;
}
async function markInvitationUsed(invitationId) {
  const { error } = await getSupabaseAdmin().from("account_invitations").update({ used_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", invitationId).is("used_at", null);
  if (error) throw new Error(`account_invitations: ${error.message}`);
}
async function recordWebhookEventOnce(input) {
  const { error } = await getSupabaseAdmin().from("payment_webhook_events").insert({
    organization_id: 0,
    // provisionamento: resolvido pelo payload
    provider_name: input.provider,
    event_id: input.eventId,
    payload: input.payload
  });
  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) return false;
    throw new Error(`payment_webhook_events: ${error.message}`);
  }
  return true;
}
var init_provisioning_model = __esm({
  "server/models/provisioning.model.ts"() {
    "use strict";
    init_supabase_server();
  }
});

// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "webdev_app_session";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  index
} from "drizzle-orm/mysql-core";
var organizations = mysqlTable(
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
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    cnpjIdx: index("org_cnpj_idx").on(table.cnpj)
  })
);
var establishments = mysqlTable(
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
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    orgIdx: index("est_org_idx").on(table.organizationId)
  })
);
var locations = mysqlTable(
  "locations",
  {
    id: int("id").autoincrement().primaryKey(),
    establishmentId: int("establishment_id").notNull().references(() => establishments.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    estIdx: index("loc_est_idx").on(table.establishmentId)
  })
);
var rooms = mysqlTable(
  "rooms",
  {
    id: int("id").autoincrement().primaryKey(),
    locationId: int("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    capacity: int("capacity").default(1).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    locIdx: index("room_loc_idx").on(table.locationId)
  })
);
var users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  role: varchar("role", { length: 64 }).default("user").notNull(),
  organizationId: int("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  /** SaaS: somente o primeiro cadastro da conta é titular (acesso master). */
  isOwner: boolean("is_owner").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull()
});
var roles = mysqlTable("roles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var userRoles = mysqlTable(
  "user_roles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: int("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    organizationId: int("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    userIdx: index("ur_user_idx").on(table.userId),
    roleIdx: index("ur_role_idx").on(table.roleId)
  })
);
var professionals = mysqlTable(
  "professionals",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
    organizationId: int("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    cpf: varchar("cpf", { length: 14 }),
    council: varchar("council", { length: 50 }),
    // CRM, CRO, etc.
    councilNumber: varchar("council_number", { length: 50 }),
    specialty: varchar("specialty", { length: 100 }),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 320 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    orgIdx: index("prof_org_idx").on(table.organizationId),
    userIdx: index("prof_user_idx").on(table.userId)
  })
);
var procedures = mysqlTable(
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
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    orgIdx: index("proc_org_idx").on(table.organizationId)
  })
);
var patients = mysqlTable(
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
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    orgIdx: index("pat_org_idx").on(table.organizationId),
    cpfIdx: index("pat_cpf_idx").on(table.cpf)
  })
);
var appointments = mysqlTable(
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
      "desmarcado"
    ]).default("solicitado").notNull(),
    googleCalendarEventId: varchar("google_calendar_event_id", { length: 255 }),
    recurrenceRule: text("recurrence_rule"),
    // iCal RRULE
    isRecurrenceParent: boolean("is_recurrence_parent").default(false).notNull(),
    recurrenceParentId: int("recurrence_parent_id").references(() => appointments.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    orgIdx: index("apt_org_idx").on(table.organizationId),
    patientIdx: index("apt_patient_idx").on(table.patientId),
    professionalIdx: index("apt_prof_idx").on(table.professionalId),
    statusIdx: index("apt_status_idx").on(table.status),
    startsAtIdx: index("apt_starts_at_idx").on(table.startsAt)
  })
);
var appointmentStatusHistory = mysqlTable(
  "appointment_status_history",
  {
    id: int("id").autoincrement().primaryKey(),
    appointmentId: int("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
    fromStatus: mysqlEnum("from_status", [
      "solicitado",
      "confirmado",
      "em_espera",
      "em_atendimento",
      "atendido",
      "faltou",
      "desmarcado"
    ]),
    toStatus: mysqlEnum("to_status", [
      "solicitado",
      "confirmado",
      "em_espera",
      "em_atendimento",
      "atendido",
      "faltou",
      "desmarcado"
    ]).notNull(),
    changedBy: int("changed_by").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    aptIdx: index("ash_apt_idx").on(table.appointmentId)
  })
);
var attendances = mysqlTable(
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
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    orgIdx: index("att_org_idx").on(table.organizationId),
    patientIdx: index("att_patient_idx").on(table.patientId),
    statusIdx: index("att_status_idx").on(table.status)
  })
);
var medicalRecords = mysqlTable(
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
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    attIdx: index("mr_att_idx").on(table.attendanceId)
  })
);
var prescriptions = mysqlTable(
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
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    attIdx: index("pres_att_idx").on(table.attendanceId)
  })
);
var examRequests = mysqlTable(
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
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    attIdx: index("er_att_idx").on(table.attendanceId)
  })
);
var examItems = mysqlTable(
  "exam_items",
  {
    id: int("id").autoincrement().primaryKey(),
    examRequestId: int("exam_request_id").notNull().references(() => examRequests.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    result: text("result"),
    reportUrl: varchar("report_url", { length: 500 }),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    reqIdx: index("ei_req_idx").on(table.examRequestId)
  })
);
var auditLog = mysqlTable(
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
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    orgIdx: index("audit_org_idx").on(table.organizationId),
    userIdx: index("audit_user_idx").on(table.userId),
    entityIdx: index("audit_entity_idx").on(table.entity, table.entityId)
  })
);

// server/db.ts
init_env();
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/cookies.ts
function getSessionCookieOptions(_req) {
  return { httpOnly: true, path: "/", sameSite: "none", secure: true };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
init_env();
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: MANUS_OAUTH_API_URL is not configured! Set MANUS_OAUTH_API_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    if (!secret) throw new Error("MANUS_JWT_SECRET is unavailable");
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || (!isNonEmptyString(appId) || appId !== ENV.appId) || typeof name !== "string") {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken && req.path.startsWith("/api/scheduled/")) {
      const ticket = cookies.get("app_session_id");
      const identity = await this.verifySession(ticket);
      if (identity?.openId.startsWith(CRON_OPEN_ID_PREFIX)) sessionToken = ticket;
    }
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key2) {
  const value = req.query[key2];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error instanceof Error ? error.message : "unknown error");
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/publicConfig.ts
function publicPlatformConfig(env = process.env) {
  return {
    projectId: env.MANUS_PROJECT_ID ?? "",
    oauthPortalUrl: env.MANUS_OAUTH_PORTAL_URL ?? "",
    apiUrl: env.MANUS_API_URL ?? "",
    apiBrowserKey: env.MANUS_API_BROWSER_KEY ?? ""
  };
}
function publicPlatformScript(env = process.env) {
  const json = JSON.stringify(publicPlatformConfig(env)).replaceAll("<", "\\u003c");
  return `window.__MANUS_CONFIG__=${json};`;
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
init_env();
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);
var ROLE_PERMISSIONS = {
  owner: ["*"],
  admin: ["*"],
  doctor: [
    "patients.read",
    "appointments.read",
    "appointments.write",
    "chat.use",
    "google_calendar.connect"
  ],
  receptionist: [
    "patients.read",
    "patients.write",
    "appointments.read",
    "appointments.write",
    "chat.use"
  ],
  financial: ["finance.read", "finance.write", "reports.export"],
  assistant: ["patients.read", "appointments.read", "appointments.write", "chat.use"],
  readonly: ["patients.read", "appointments.read"]
};
function permissionsForRole(role) {
  const key2 = (role ?? "").trim().toLowerCase();
  if (key2 === "owner" || key2 === "admin") return ["*"];
  return key2 ? ROLE_PERMISSIONS[key2] ?? [] : [];
}
var PERMISSION_AREA_MAP = {
  "patients": "pacientes",
  "appointments": "agenda",
  "professionals": "profissionais",
  "finance": "financeiro",
  "reports": "relatorios",
  "organization": "usuarios"
};
function areaForPermission(permission) {
  if (permission === "*") return null;
  const [domain] = permission.split(".");
  return PERMISSION_AREA_MAP[domain] ?? null;
}
var requirePermission = (permission) => t.middleware(async (opts) => {
  const { ctx, next } = opts;
  const user = ctx.user;
  if (!user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  if (ctx.isOwner) {
    return next({ ctx: { ...ctx, user } });
  }
  const permissions = permissionsForRole(user.role);
  const allowed = permissions.includes("*") || permissions.includes(permission);
  let areaGranted = null;
  if (ctx.areaPermissions) {
    const area = areaForPermission(permission);
    if (area && area in ctx.areaPermissions) {
      const level = ctx.areaPermissions[area];
      if (level === "full") areaGranted = true;
      else if (level === "partial") areaGranted = permission.endsWith(".read");
      else areaGranted = false;
    }
  }
  const finalAllowed = areaGranted !== null ? areaGranted : allowed;
  if (!finalAllowed) {
    throw new TRPCError2({
      code: "FORBIDDEN",
      message: `Permiss\xE3o negada: ${permission}`
    });
  }
  return next({ ctx: { ...ctx, user } });
});
var protectedWith = (permission) => t.procedure.use(requirePermission(permission));

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/controllers/patient.controller.ts
import { z as z2 } from "zod";
import { TRPCError as TRPCError3 } from "@trpc/server";

// server/models/patient.model.ts
init_supabase_server();
var PATIENT_COLUMNS = "id, organization_id, full_name, social_name, cpf, rg, birth_date, gender, phone, email, address, city, state, zip_code, emergency_contact, emergency_phone, consent_data_sharing, consent_marketing, is_minor, guardian_patient_id, guardian_name, guardian_document, consent_status, is_active, created_at, updated_at";
function toPatient(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    fullName: row.full_name,
    socialName: row.social_name,
    cpf: row.cpf,
    rg: row.rg,
    birthDate: row.birth_date,
    gender: row.gender,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    state: row.state,
    zipCode: row.zip_code,
    emergencyContact: row.emergency_contact,
    emergencyPhone: row.emergency_phone,
    consentDataSharing: row.consent_data_sharing ?? false,
    consentMarketing: row.consent_marketing ?? false,
    isMinor: row.is_minor ?? false,
    guardianPatientId: row.guardian_patient_id ?? null,
    guardianName: row.guardian_name ?? null,
    guardianDocument: row.guardian_document ?? null,
    consentStatus: row.consent_status ?? "pending",
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function toRow(data) {
  const row = {};
  if (data.organizationId !== void 0) row.organization_id = data.organizationId;
  if (data.fullName !== void 0) row.full_name = data.fullName;
  if (data.socialName !== void 0) row.social_name = data.socialName;
  if (data.cpf !== void 0) row.cpf = data.cpf;
  if (data.rg !== void 0) row.rg = data.rg;
  if (data.birthDate !== void 0) row.birth_date = data.birthDate || null;
  if (data.gender !== void 0) row.gender = data.gender;
  if (data.phone !== void 0) row.phone = data.phone;
  if (data.email !== void 0) row.email = data.email;
  if (data.address !== void 0) row.address = data.address;
  if (data.city !== void 0) row.city = data.city;
  if (data.state !== void 0) row.state = data.state;
  if (data.zipCode !== void 0) row.zip_code = data.zipCode;
  if (data.emergencyContact !== void 0)
    row.emergency_contact = data.emergencyContact;
  if (data.emergencyPhone !== void 0)
    row.emergency_phone = data.emergencyPhone;
  if (data.consentDataSharing !== void 0)
    row.consent_data_sharing = data.consentDataSharing;
  if (data.consentMarketing !== void 0)
    row.consent_marketing = data.consentMarketing;
  if (data.isMinor !== void 0) row.is_minor = data.isMinor;
  if (data.guardianPatientId !== void 0)
    row.guardian_patient_id = data.guardianPatientId ?? null;
  if (data.guardianName !== void 0) row.guardian_name = data.guardianName ?? null;
  if (data.guardianDocument !== void 0)
    row.guardian_document = data.guardianDocument ?? null;
  if (data.consentStatus !== void 0)
    row.consent_status = data.consentStatus;
  return row;
}
function fail(context, error) {
  throw new Error(`[patients] ${context}: ${error?.message ?? "erro desconhecido"}`);
}
var patientModel = {
  async create(data) {
    const { data: row, error } = await getSupabaseAdmin().from("patients").insert({ ...toRow(data), is_active: true }).select(PATIENT_COLUMNS).single();
    if (error || !row) fail("erro ao criar paciente", error);
    return toPatient(row);
  },
  async findById(id, organizationId) {
    const { data: row, error } = await getSupabaseAdmin().from("patients").select(PATIENT_COLUMNS).eq("id", id).eq("organization_id", organizationId).maybeSingle();
    if (error) fail("erro ao buscar paciente", error);
    return row ? toPatient(row) : null;
  },
  async findMany(filter) {
    const {
      organizationId,
      search,
      cpf,
      isActive,
      limit = 50,
      offset = 0
    } = filter;
    let query = getSupabaseAdmin().from("patients").select(PATIENT_COLUMNS).eq("organization_id", organizationId);
    if (isActive !== void 0) query = query.eq("is_active", isActive);
    if (cpf) query = query.eq("cpf", cpf);
    if (search) {
      const term = search.replace(/[%,()]/g, "").trim();
      if (term) {
        query = query.or(
          `full_name.ilike.%${term}%,cpf.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`
        );
      }
    }
    const { data, error } = await query.order("full_name", { ascending: true }).range(offset, offset + limit - 1);
    if (error) fail("erro ao listar pacientes", error);
    return (data ?? []).map((row) => toPatient(row));
  },
  async update(id, organizationId, data) {
    const { id: _ignored, ...rest } = data;
    const { data: row, error } = await getSupabaseAdmin().from("patients").update({ ...toRow(rest), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("organization_id", organizationId).select(PATIENT_COLUMNS).maybeSingle();
    if (error) fail("erro ao atualizar paciente", error);
    return row ? toPatient(row) : null;
  },
  /** Exclusão lógica (LGPD: preserva histórico, evita perda de dados) */
  async delete(id, organizationId) {
    const { data: row, error } = await getSupabaseAdmin().from("patients").update({ is_active: false, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("organization_id", organizationId).select(PATIENT_COLUMNS).maybeSingle();
    if (error) fail("erro ao desativar paciente", error);
    return row ? toPatient(row) : null;
  },
  async existsByCpf(cpf, organizationId, excludeId) {
    let query = getSupabaseAdmin().from("patients").select("id").eq("organization_id", organizationId).eq("cpf", cpf);
    if (excludeId) query = query.neq("id", excludeId);
    const { data, error } = await query.limit(1);
    if (error) fail("erro ao verificar CPF", error);
    return (data ?? []).length > 0;
  }
};

// server/lib/audit.ts
init_supabase_server();
async function writeAuditLog(entry) {
  try {
    const forwarded = entry.request?.headers["x-forwarded-for"];
    const ipAddress = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ?? entry.request?.ip ?? null;
    const { error } = await getSupabaseAdmin().from("audit_log").insert({
      organization_id: entry.organizationId ?? null,
      user_id: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      old_values: entry.oldValues ? JSON.stringify(entry.oldValues) : null,
      new_values: entry.newValues ? JSON.stringify(entry.newValues) : null,
      ip_address: ipAddress,
      user_agent: entry.request?.headers["user-agent"] ?? null
    });
    if (error) {
      console.error("[Audit] Falha ao registrar auditoria:", error.message);
    }
  } catch (error) {
    console.error(
      "[Audit] Falha ao registrar auditoria:",
      error instanceof Error ? error.message : error
    );
  }
}

// server/lib/patient-requirements.ts
init_supabase_server();
var PATIENT_FIELD_LABELS = {
  fullName: "Nome completo",
  cpf: "CPF",
  rg: "RG",
  birthDate: "Data de nascimento",
  gender: "G\xEAnero",
  phone: "Telefone",
  email: "E-mail",
  address: "Endere\xE7o",
  emergencyContact: "Contato de emerg\xEAncia"
};
var ALWAYS_REQUIRED_FIELDS = ["fullName"];
var DEFAULT_PATIENT_FIELDS = {
  fullName: true,
  cpf: false,
  rg: false,
  birthDate: false,
  gender: false,
  phone: false,
  email: false,
  address: false,
  emergencyContact: false
};
async function getRequiredPatientFields(organizationId) {
  const { data, error } = await getSupabaseAdmin().from("org_settings").select("required_patient_fields").eq("organization_id", organizationId).maybeSingle();
  if (error) {
    throw new Error(`Falha ao consultar campos obrigat\xF3rios: ${error.message}`);
  }
  const stored = data?.required_patient_fields ?? {};
  const merged = { ...DEFAULT_PATIENT_FIELDS };
  for (const key2 of Object.keys(merged)) {
    if (key2 in stored) merged[key2] = stored[key2];
  }
  for (const always of ALWAYS_REQUIRED_FIELDS) merged[always] = true;
  return merged;
}
function isBlank(value) {
  if (value === null || value === void 0) return true;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}
function missingRequiredPatientFields(required, data) {
  const missing = [];
  for (const [field, label] of Object.entries(PATIENT_FIELD_LABELS)) {
    if (!required[field]) continue;
    if (isBlank(data[field])) missing.push(label);
  }
  return missing;
}
function requiredFieldsMessage(missing) {
  if (missing.length === 0) return "";
  const list = missing.join(", ");
  return missing.length === 1 ? `O campo ${list} \xE9 obrigat\xF3rio` : `Preencha os campos obrigat\xF3rios: ${list}`;
}

// server/controllers/patient.controller.ts
var genderSchema = z2.enum(["M", "F", "O"]);
var createPatientSchema = z2.object({
  organizationId: z2.number().int().positive(),
  fullName: z2.string().min(2, "Nome completo \xE9 obrigat\xF3rio"),
  socialName: z2.string().optional(),
  cpf: z2.string().optional(),
  rg: z2.string().optional(),
  birthDate: z2.string().optional(),
  gender: genderSchema.optional(),
  phone: z2.string().optional(),
  email: z2.string().email().optional(),
  address: z2.string().optional(),
  city: z2.string().optional(),
  state: z2.string().optional(),
  zipCode: z2.string().optional(),
  emergencyContact: z2.string().optional(),
  emergencyPhone: z2.string().optional(),
  consentDataSharing: z2.boolean().default(false),
  consentMarketing: z2.boolean().default(false)
});
var updatePatientSchema = z2.object({
  id: z2.number().int().positive(),
  organizationId: z2.number().int().positive(),
  fullName: z2.string().min(2).optional(),
  socialName: z2.string().optional(),
  cpf: z2.string().optional(),
  rg: z2.string().optional(),
  birthDate: z2.string().optional(),
  gender: genderSchema.optional(),
  phone: z2.string().optional(),
  email: z2.string().email().optional(),
  address: z2.string().optional(),
  city: z2.string().optional(),
  state: z2.string().optional(),
  zipCode: z2.string().optional(),
  emergencyContact: z2.string().optional(),
  emergencyPhone: z2.string().optional(),
  consentDataSharing: z2.boolean().optional(),
  consentMarketing: z2.boolean().optional(),
  isActive: z2.boolean().optional()
});
var patientFilterSchema = z2.object({
  organizationId: z2.number().int().positive(),
  search: z2.string().optional(),
  cpf: z2.string().optional(),
  isActive: z2.boolean().optional(),
  limit: z2.number().int().min(1).max(200).default(50),
  offset: z2.number().int().min(0).default(0)
});
var patientRouter = router({
  list: protectedProcedure.input(patientFilterSchema).query(async ({ input }) => {
    return patientModel.findMany(input);
  }),
  /**
   * Campos obrigatórios configurados pela clínica (REQ-05-015..019).
   * Usado pelo formulário para marcar dinamicamente o que é obrigatório.
   */
  requiredFields: protectedProcedure.input(z2.object({ organizationId: z2.number().int().positive() })).query(({ input }) => getRequiredPatientFields(input.organizationId)),
  getById: protectedProcedure.input(z2.object({ id: z2.number().int(), organizationId: z2.number().int() })).query(async ({ input }) => {
    const patient = await patientModel.findById(input.id, input.organizationId);
    if (!patient) {
      throw new TRPCError3({
        code: "NOT_FOUND",
        message: "Paciente n\xE3o encontrado"
      });
    }
    return patient;
  }),
  create: protectedProcedure.input(createPatientSchema).mutation(async ({ ctx, input }) => {
    const required = await getRequiredPatientFields(input.organizationId);
    const missing = missingRequiredPatientFields(required, input);
    if (missing.length > 0) {
      throw new TRPCError3({
        code: "BAD_REQUEST",
        message: requiredFieldsMessage(missing)
      });
    }
    if (input.cpf) {
      const exists = await patientModel.existsByCpf(
        input.cpf,
        input.organizationId
      );
      if (exists) {
        throw new TRPCError3({
          code: "CONFLICT",
          message: "J\xE1 existe um paciente com este CPF"
        });
      }
    }
    const patient = await patientModel.create(input);
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "CREATE",
      entity: "patient",
      entityId: patient.id,
      newValues: { fullName: input.fullName, cpf: input.cpf },
      request: ctx.req
    });
    return patient;
  }),
  update: protectedProcedure.input(updatePatientSchema).mutation(async ({ ctx, input }) => {
    const { id, organizationId, ...data } = input;
    const existing = await patientModel.findById(id, organizationId);
    if (!existing) {
      throw new TRPCError3({
        code: "NOT_FOUND",
        message: "Paciente n\xE3o encontrado"
      });
    }
    const required = await getRequiredPatientFields(organizationId);
    const missing = missingRequiredPatientFields(required, {
      ...existing,
      ...data
    });
    if (missing.length > 0) {
      throw new TRPCError3({
        code: "BAD_REQUEST",
        message: requiredFieldsMessage(missing)
      });
    }
    if (data.cpf && data.cpf !== existing.cpf) {
      const exists = await patientModel.existsByCpf(data.cpf, organizationId, id);
      if (exists) {
        throw new TRPCError3({
          code: "CONFLICT",
          message: "J\xE1 existe um paciente com este CPF"
        });
      }
    }
    const patient = await patientModel.update(id, organizationId, { id, ...data });
    await writeAuditLog({
      organizationId,
      userId: ctx.user.id,
      action: "UPDATE",
      entity: "patient",
      entityId: id,
      oldValues: {
        fullName: existing.fullName,
        cpf: existing.cpf,
        phone: existing.phone,
        email: existing.email
      },
      newValues: data,
      request: ctx.req
    });
    return patient;
  }),
  delete: protectedProcedure.input(z2.object({ id: z2.number().int(), organizationId: z2.number().int() })).mutation(async ({ ctx, input }) => {
    const patient = await patientModel.delete(input.id, input.organizationId);
    if (!patient) {
      throw new TRPCError3({
        code: "NOT_FOUND",
        message: "Paciente n\xE3o encontrado"
      });
    }
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "DELETE",
      entity: "patient",
      entityId: input.id,
      newValues: { isActive: false },
      request: ctx.req
    });
    return { success: true };
  })
});

// server/controllers/appointment.controller.ts
import { z as z3 } from "zod";
import { TRPCError as TRPCError4 } from "@trpc/server";

// server/models/appointment.model.ts
init_supabase_server();

// server/lib/datetime.ts
function pad(value) {
  return String(value).padStart(2, "0");
}
function toDbTimestamp(value) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data inv\xE1lida: ${String(value)}`);
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// server/models/appointment.model.ts
var APPOINTMENT_COLUMNS = "id, organization_id, patient_id, professional_id, procedure_id, establishment_id, location_id, room_id, starts_at, ends_at, status, google_calendar_event_id, notes, created_at, updated_at";
var CONFLICT_STATUSES = [
  "solicitado",
  "confirmado",
  "em_espera",
  "em_atendimento"
];
function toAppointment(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    patientId: row.patient_id,
    professionalId: row.professional_id,
    procedureId: row.procedure_id,
    establishmentId: row.establishment_id,
    locationId: row.location_id,
    roomId: row.room_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status ?? "solicitado",
    googleCalendarEventId: row.google_calendar_event_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function toRow2(data) {
  const row = {};
  if (data.organizationId !== void 0) row.organization_id = data.organizationId;
  if (data.patientId !== void 0) row.patient_id = data.patientId;
  if (data.professionalId !== void 0) row.professional_id = data.professionalId;
  if (data.procedureId !== void 0) row.procedure_id = data.procedureId;
  if (data.establishmentId !== void 0)
    row.establishment_id = data.establishmentId ?? null;
  if (data.locationId !== void 0) row.location_id = data.locationId ?? null;
  if (data.roomId !== void 0) row.room_id = data.roomId ?? null;
  if (data.startsAt !== void 0) row.starts_at = toDbTimestamp(data.startsAt);
  if (data.endsAt !== void 0) row.ends_at = toDbTimestamp(data.endsAt);
  if (data.status !== void 0) row.status = data.status;
  if (data.notes !== void 0) row.notes = data.notes;
  if (data.createdBy !== void 0) row.created_by = data.createdBy;
  return row;
}
function fail2(context, error) {
  throw new Error(
    `[appointments] ${context}: ${error?.message ?? "erro desconhecido"}`
  );
}
async function hydrate(rows) {
  if (rows.length === 0) return [];
  const appointments2 = rows.map(toAppointment);
  const supabase = getSupabaseAdmin();
  const patientIds = [...new Set(rows.map((r) => r.patient_id))];
  const professionalIds = [...new Set(rows.map((r) => r.professional_id))];
  const procedureIds = [...new Set(rows.map((r) => r.procedure_id))];
  const [patientsResult, professionalsResult, proceduresResult] = await Promise.all([
    supabase.from("patients").select("id, full_name, cpf, phone, email").in("id", patientIds),
    supabase.from("professionals").select("id, full_name, specialty").in("id", professionalIds),
    supabase.from("procedures").select("id, name, duration_minutes").in("id", procedureIds)
  ]);
  const patients2 = new Map(
    (patientsResult.data ?? []).map((p) => [
      p.id,
      {
        id: p.id,
        fullName: p.full_name,
        cpf: p.cpf,
        phone: p.phone,
        email: p.email
      }
    ])
  );
  const professionals2 = new Map(
    (professionalsResult.data ?? []).map((p) => [
      p.id,
      {
        id: p.id,
        fullName: p.full_name,
        specialty: p.specialty
      }
    ])
  );
  const procedures2 = new Map(
    (proceduresResult.data ?? []).map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        durationMinutes: p.duration_minutes
      }
    ])
  );
  return appointments2.map((appointment) => ({
    ...appointment,
    patient: patients2.get(appointment.patientId),
    professional: professionals2.get(appointment.professionalId),
    procedure: procedures2.get(appointment.procedureId)
  }));
}
var appointmentModel = {
  async create(data) {
    const { data: row, error } = await getSupabaseAdmin().from("appointments").insert(toRow2(data)).select(APPOINTMENT_COLUMNS).single();
    if (error || !row) fail2("erro ao criar agendamento", error);
    const [appointment] = await hydrate([row]);
    return appointment;
  },
  async findById(id, organizationId) {
    const { data: row, error } = await getSupabaseAdmin().from("appointments").select(APPOINTMENT_COLUMNS).eq("id", id).eq("organization_id", organizationId).maybeSingle();
    if (error) fail2("erro ao buscar agendamento", error);
    if (!row) return null;
    const [appointment] = await hydrate([row]);
    return appointment;
  },
  async findMany(filter) {
    const {
      organizationId,
      professionalId,
      patientId,
      status,
      startsAtFrom,
      startsAtTo,
      limit = 50,
      offset = 0
    } = filter;
    let query = getSupabaseAdmin().from("appointments").select(APPOINTMENT_COLUMNS).eq("organization_id", organizationId);
    if (professionalId) query = query.eq("professional_id", professionalId);
    if (patientId) query = query.eq("patient_id", patientId);
    if (status) query = query.eq("status", status);
    if (startsAtFrom) query = query.gte("starts_at", toDbTimestamp(startsAtFrom));
    if (startsAtTo) query = query.lte("starts_at", toDbTimestamp(startsAtTo));
    const { data, error } = await query.order("starts_at", { ascending: true }).range(offset, offset + limit - 1);
    if (error) fail2("erro ao listar agendamentos", error);
    return hydrate(data ?? []);
  },
  async update(id, organizationId, data) {
    const { id: _ignored, ...rest } = data;
    const { data: row, error } = await getSupabaseAdmin().from("appointments").update({ ...toRow2(rest), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("organization_id", organizationId).select(APPOINTMENT_COLUMNS).maybeSingle();
    if (error) fail2("erro ao atualizar agendamento", error);
    if (!row) return null;
    const [appointment] = await hydrate([row]);
    return appointment;
  },
  /** Cancelamento (mantém histórico para auditoria/LGPD) */
  async delete(id, organizationId) {
    const { data: row, error } = await getSupabaseAdmin().from("appointments").update({ status: "desmarcado", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("organization_id", organizationId).select(APPOINTMENT_COLUMNS).maybeSingle();
    if (error) fail2("erro ao cancelar agendamento", error);
    if (!row) return null;
    const [appointment] = await hydrate([row]);
    return appointment;
  },
  /** Verifica sobreposição de horário para o profissional (e sala, se informada). */
  async checkConflict(data) {
    const supabase = getSupabaseAdmin();
    const buildQuery = (column, value) => {
      let query = supabase.from("appointments").select("id").eq(column, value).in("status", CONFLICT_STATUSES).lt("starts_at", toDbTimestamp(data.endsAt)).gt("ends_at", toDbTimestamp(data.startsAt));
      if (data.excludeId) query = query.neq("id", data.excludeId);
      return query.limit(1);
    };
    const { data: conflicts, error } = await buildQuery(
      "professional_id",
      data.professionalId
    );
    if (error) fail2("erro ao verificar conflito", error);
    if ((conflicts ?? []).length > 0) return true;
    if (data.roomId) {
      const { data: roomConflicts, error: roomError } = await buildQuery(
        "room_id",
        data.roomId
      );
      if (roomError) fail2("erro ao verificar conflito de sala", roomError);
      if ((roomConflicts ?? []).length > 0) return true;
    }
    return false;
  },
  /** Agendamentos por período (usado na sincronização com o Google Calendar). */
  async findByPeriod(organizationId, from, to) {
    const { data, error } = await getSupabaseAdmin().from("appointments").select(APPOINTMENT_COLUMNS).eq("organization_id", organizationId).gte("starts_at", toDbTimestamp(from)).lte("starts_at", toDbTimestamp(to)).order("starts_at", { ascending: true });
    if (error) fail2("erro ao listar agendamentos do per\xEDodo", error);
    return hydrate(data ?? []);
  }
};

// server/services/google-calendar-sync.service.ts
init_supabase_server();

// server/lib/google-calendar.ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
var OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
var OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
var OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
var CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
var GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events"
];
var GoogleCalendarError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "GoogleCalendarError";
  }
};
function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}
function getPublicUrl() {
  const explicit = process.env.PUBLIC_URL ?? process.env.APP_URL ?? process.env.VITE_PUBLIC_URL ?? process.env.VITE_APP_URL;
  if (explicit && explicit.trim()) return trimTrailingSlash(explicit.trim());
  return `http://localhost:${process.env.PORT ?? "3000"}`;
}
function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.VITE_GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const publicUrl = getPublicUrl();
  return {
    clientId: clientId.trim(),
    clientSecret: clientSecret.trim(),
    redirectUri: `${publicUrl}/api/google-calendar/callback`,
    publicUrl,
    timeZone: process.env.GOOGLE_CALENDAR_TIMEZONE?.trim() || "America/Sao_Paulo"
  };
}
var PLACEHOLDER_PATTERN = /(seu[-_ ]|sua[-_ ]|your[-_ ]|coloque|insira|example|placeholder|changeme|^xxx)/i;
function looksLikePlaceholder(value) {
  return !value || PLACEHOLDER_PATTERN.test(value);
}
function isGoogleCalendarConfigured() {
  const config = getGoogleConfig();
  return !looksLikePlaceholder(config.clientId) && !looksLikePlaceholder(config.clientSecret);
}
function requireGoogleConfig() {
  const config = getGoogleConfig();
  const missing = [];
  if (looksLikePlaceholder(config.clientId)) missing.push("GOOGLE_CLIENT_ID");
  if (looksLikePlaceholder(config.clientSecret)) {
    missing.push("GOOGLE_CLIENT_SECRET");
  }
  if (missing.length > 0) {
    throw new GoogleCalendarError(
      `Google Calendar n\xE3o configurado: informe credenciais reais de ${missing.join(
        " e "
      )} no .env do servidor.`
    );
  }
  return config;
}
async function googleFetch(url, init, context) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text3 = await response.text();
    let detail = text3.slice(0, 300);
    try {
      const parsed = JSON.parse(text3);
      detail = parsed.error_description ?? (typeof parsed.error === "string" ? parsed.error : parsed.error?.message) ?? detail;
    } catch {
    }
    throw new GoogleCalendarError(`${context}: ${detail}`, response.status);
  }
  if (response.status === 204) return void 0;
  return await response.json();
}
function stateSecret() {
  const explicit = process.env.GOOGLE_OAUTH_STATE_SECRET?.trim();
  if (explicit) return explicit;
  const fallback = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim() || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!fallback) {
    throw new GoogleCalendarError(
      "Defina GOOGLE_OAUTH_STATE_SECRET (ou SUPABASE_SECRET_KEY) para assinar o OAuth do Google Calendar."
    );
  }
  return `ollclin:google-state:${fallback}`;
}
function createOAuthState(input) {
  const payload = {
    userId: input.userId,
    organizationId: input.organizationId,
    exp: Date.now() + 10 * 60 * 1e3,
    nonce: randomBytes(12).toString("hex")
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", stateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
function verifyOAuthState(state) {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) {
    throw new GoogleCalendarError("State OAuth inv\xE1lido");
  }
  const expected = createHmac("sha256", stateSecret()).update(encoded).digest("base64url");
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    throw new GoogleCalendarError("Assinatura do state OAuth inv\xE1lida");
  }
  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8")
  );
  if (!payload?.exp || Date.now() > payload.exp) {
    throw new GoogleCalendarError(
      "A autoriza\xE7\xE3o expirou. Conecte o Google Calendar novamente."
    );
  }
  if (!payload.userId || !payload.organizationId) {
    throw new GoogleCalendarError("State OAuth incompleto");
  }
  return {
    userId: payload.userId,
    organizationId: payload.organizationId
  };
}
function buildAuthUrl(state) {
  const config = requireGoogleConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    // `consent` garante o refresh_token mesmo em reconexões.
    prompt: "consent",
    include_granted_scopes: "true",
    state
  });
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}
async function exchangeCode(code) {
  const config = requireGoogleConfig();
  return googleFetch(
    OAUTH_TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code"
      })
    },
    "Falha ao trocar o c\xF3digo de autoriza\xE7\xE3o do Google"
  );
}
async function refreshAccessToken(refreshToken) {
  const config = requireGoogleConfig();
  return googleFetch(
    OAUTH_TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    },
    "Falha ao renovar o acesso ao Google Calendar"
  );
}
async function revokeToken(token) {
  try {
    await fetch(`${OAUTH_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
  } catch (error) {
    console.warn(
      "[Google Calendar] Falha ao revogar token:",
      error instanceof Error ? error.message : error
    );
  }
}
function calendarPath(calendarId) {
  return `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
}
async function listEvents(accessToken, input) {
  const params = new URLSearchParams({
    timeMin: input.timeMin,
    timeMax: input.timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(Math.min(input.maxResults ?? 2500, 2500))
  });
  const data = await googleFetch(
    `${calendarPath(input.calendarId ?? "primary")}?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    },
    "Falha ao listar eventos do Google Calendar"
  );
  return data.items ?? [];
}
async function createEvent(accessToken, event, calendarId = "primary") {
  return googleFetch(
    calendarPath(calendarId),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(event)
    },
    "Falha ao criar evento no Google Calendar"
  );
}
async function updateEvent(accessToken, eventId, event, calendarId = "primary") {
  return googleFetch(
    `${calendarPath(calendarId)}/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(event)
    },
    "Falha ao atualizar evento no Google Calendar"
  );
}
async function deleteEvent(accessToken, eventId, calendarId = "primary") {
  const response = await fetch(
    `${calendarPath(calendarId)}/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const text3 = await response.text();
    throw new GoogleCalendarError(
      `Falha ao remover evento do Google Calendar: ${text3.slice(0, 200)}`,
      response.status
    );
  }
}
function pad2(value) {
  return String(value).padStart(2, "0");
}
function toGoogleDateTime(value) {
  const trimmed = value.trim();
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  if (!hasZone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    const base = trimmed.slice(0, 19);
    return base.length === 16 ? `${base}:00` : base;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new GoogleCalendarError(`Data inv\xE1lida para o Google Calendar: ${value}`);
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}
function googleTimeZone() {
  return getGoogleConfig().timeZone;
}

// server/models/google-calendar.model.ts
init_supabase_server();

// server/lib/token-crypto.ts
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes as randomBytes2
} from "node:crypto";
var PREFIX = "v1";
var ALGORITHM = "aes-256-gcm";
function secretMaterial() {
  const explicit = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (explicit) return `ollclin:google-token:${explicit}`;
  const fallback = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!fallback) {
    throw new Error(
      "Configure GOOGLE_TOKEN_ENCRYPTION_KEY (ou SUPABASE_SECRET_KEY) para cifrar tokens do Google Calendar."
    );
  }
  return `ollclin:google-token:${fallback}`;
}
function key() {
  return createHash("sha256").update(secretMaterial()).digest();
}
function encryptSecret(plain) {
  const iv = randomBytes2(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64")
  ].join(":");
}
function decryptSecret(envelope) {
  const [prefix, ivB64, tagB64, dataB64] = envelope.split(":");
  if (prefix !== PREFIX || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Token cifrado em formato inv\xE1lido");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    key(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final()
  ]);
  return plain.toString("utf8");
}

// server/lib/schema-capabilities.ts
init_supabase_server();
var MISSING_TABLE_CODES = /* @__PURE__ */ new Set(["PGRST205", "42P01"]);
var MISSING_COLUMN_CODES = /* @__PURE__ */ new Set(["42703", "PGRST204"]);
function errorCode(error) {
  return error?.code ?? "";
}
async function columnExists(table, column) {
  const { error } = await getSupabaseAdmin().from(table).select(column).limit(1);
  if (!error) return true;
  return !MISSING_COLUMN_CODES.has(errorCode(error));
}
async function tableExists(table) {
  const { error } = await getSupabaseAdmin().from(table).select("id").limit(1);
  if (!error) return true;
  return !MISSING_TABLE_CODES.has(errorCode(error));
}
async function detect() {
  const [
    professionalCommission,
    revenueLinks,
    sales,
    payouts,
    receipts,
    googleAccounts
  ] = await Promise.all([
    columnExists("professionals", "commission_percentage"),
    columnExists("revenues", "professional_id"),
    tableExists("sales"),
    tableExists("payouts"),
    tableExists("receipts"),
    tableExists("google_calendar_accounts")
  ]);
  return {
    professionalCommission,
    revenueLinks,
    financeModules: sales && payouts && receipts,
    googleCalendar: googleAccounts
  };
}
var cached = null;
var cachedAt = 0;
var CACHE_TTL_MS = 6e4;
function getSchemaCapabilities() {
  if (!cached || Date.now() - cachedAt > CACHE_TTL_MS) {
    cached = detect();
    cachedAt = Date.now();
  }
  return cached;
}
var MIGRATION_0003_HINT = "M\xF3dulo financeiro indispon\xEDvel: aplique a migra\xE7\xE3o drizzle/migrations/0003_financeiro_completo.sql no Supabase (SQL Editor).";
var MIGRATION_0003_FIELDS_HINT = "Recurso indispon\xEDvel: aplique a migra\xE7\xE3o drizzle/migrations/0003_financeiro_completo.sql no Supabase (SQL Editor).";
var MIGRATION_0004_HINT = "Integra\xE7\xE3o com o Google Calendar indispon\xEDvel: aplique a migra\xE7\xE3o drizzle/migrations/0004_google_calendar.sql no Supabase (SQL Editor).";
async function requireFinanceModules() {
  const caps = await getSchemaCapabilities();
  if (!caps.financeModules) throw new Error(MIGRATION_0003_HINT);
}
async function requireGoogleCalendar() {
  const caps = await getSchemaCapabilities();
  if (!caps.googleCalendar) throw new Error(MIGRATION_0004_HINT);
}
function guarded(model, requireCapability) {
  const wrapped = {};
  for (const [name, value] of Object.entries(model)) {
    if (typeof value !== "function") {
      wrapped[name] = value;
      continue;
    }
    wrapped[name] = async function(...args) {
      await requireCapability();
      return value.apply(model, args);
    };
  }
  return wrapped;
}
function financeGuarded(model) {
  return guarded(model, requireFinanceModules);
}
function googleCalendarGuarded(model) {
  return guarded(model, requireGoogleCalendar);
}

// server/models/google-calendar.model.ts
var ACCOUNT_COLUMNS = "id, organization_id, user_id, calendar_id, access_token, refresh_token, token_expires_at, scope, connected_at, revoked_at";
var EXPIRY_MARGIN_MS = 6e4;
function toAccount(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    calendarId: row.calendar_id || "primary",
    scope: row.scope,
    connectedAt: row.connected_at,
    revokedAt: row.revoked_at,
    tokenExpiresAt: row.token_expires_at
  };
}
function fail3(context, error) {
  throw new Error(
    `[google_calendar_accounts] ${context}: ${error?.message ?? "erro desconhecido"}`
  );
}
async function findRow(organizationId, userId) {
  const { data, error } = await getSupabaseAdmin().from("google_calendar_accounts").select(ACCOUNT_COLUMNS).eq("organization_id", organizationId).eq("user_id", userId).maybeSingle();
  if (error) fail3("consultar conta", error);
  return data ?? null;
}
async function markRevoked(organizationId, userId) {
  const { error } = await getSupabaseAdmin().from("google_calendar_accounts").update({
    revoked_at: (/* @__PURE__ */ new Date()).toISOString(),
    access_token: "",
    refresh_token: null,
    token_expires_at: null,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("organization_id", organizationId).eq("user_id", userId);
  if (error) {
    console.error(
      "[google_calendar_accounts] Falha ao marcar conta como revogada:",
      error.message
    );
  }
}
async function saveTokensDirect(input) {
  const now = /* @__PURE__ */ new Date();
  const record = {
    organization_id: input.organizationId,
    user_id: input.userId,
    calendar_id: input.calendarId ?? "primary",
    access_token: encryptSecret(input.accessToken),
    token_expires_at: typeof input.expiresIn === "number" && input.expiresIn > 0 ? new Date(now.getTime() + input.expiresIn * 1e3).toISOString() : null,
    scope: input.scope ?? null,
    connected_at: now.toISOString(),
    revoked_at: null,
    updated_at: now.toISOString()
  };
  if (input.refreshToken) {
    record.refresh_token = encryptSecret(input.refreshToken);
  }
  const { data, error } = await getSupabaseAdmin().from("google_calendar_accounts").upsert(record, { onConflict: "organization_id,user_id" }).select(ACCOUNT_COLUMNS).single();
  if (error || !data) fail3("salvar credenciais", error);
  return toAccount(data);
}
var googleCalendarModel = googleCalendarGuarded({
  /** Conta ativa do usuário (sem expor tokens). */
  async findActive(organizationId, userId) {
    const row = await findRow(organizationId, userId);
    if (!row || row.revoked_at) return null;
    return toAccount(row);
  },
  /** Grava/atualiza as credenciais cifradas após o callback do OAuth. */
  saveTokens(input) {
    return saveTokensDirect(input);
  },
  /**
   * Devolve um access token válido (renovando se necessário).
   * Retorna `null` quando não há conexão ativa.
   */
  async getAccessToken(organizationId, userId) {
    const row = await findRow(organizationId, userId);
    if (!row || row.revoked_at || !row.access_token) return null;
    let accessToken = decryptSecret(row.access_token);
    const expiresAt = row.token_expires_at ? Date.parse(row.token_expires_at) : 0;
    if (expiresAt && expiresAt - EXPIRY_MARGIN_MS <= Date.now()) {
      if (!row.refresh_token) {
        await markRevoked(organizationId, userId);
        return null;
      }
      try {
        const refreshed = await refreshAccessToken(
          decryptSecret(row.refresh_token)
        );
        const updated = await saveTokensDirect({
          organizationId,
          userId,
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          expiresIn: refreshed.expires_in,
          scope: refreshed.scope ?? row.scope ?? void 0,
          calendarId: row.calendar_id || "primary"
        });
        accessToken = refreshed.access_token;
        return { accessToken, calendarId: updated.calendarId };
      } catch (error) {
        if (error instanceof GoogleCalendarError && (error.status === 400 || error.status === 401)) {
          await markRevoked(organizationId, userId);
          return null;
        }
        throw error;
      }
    }
    return { accessToken, calendarId: row.calendar_id || "primary" };
  },
  /** Desconecta: revoga no Google (melhor esforço) e limpa os tokens. */
  async disconnect(organizationId, userId) {
    const row = await findRow(organizationId, userId);
    if (!row) return;
    try {
      const token = row.refresh_token ? decryptSecret(row.refresh_token) : row.access_token ? decryptSecret(row.access_token) : null;
      if (token) await revokeToken(token);
    } catch (error) {
      console.warn(
        "[google_calendar_accounts] Falha ao revogar token no Google:",
        error instanceof Error ? error.message : error
      );
    }
    await markRevoked(organizationId, userId);
  },
  /** Vincula/desvincula o evento do Google a um agendamento. */
  async setEventId(organizationId, appointmentId, eventId) {
    const { error } = await getSupabaseAdmin().from("appointments").update({
      google_calendar_event_id: eventId,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", appointmentId).eq("organization_id", organizationId);
    if (error) fail3("vincular evento ao agendamento", error);
  }
});

// server/models/google-calendar-sync.model.ts
init_supabase_server();
var JOB_COLUMNS = "id, organization_id, appointment_id, user_id, operation, payload, idempotency_key, attempts, status, next_attempt_at, last_error, created_at, updated_at";
var EVENT_COLUMNS = "id, organization_id, appointment_id, user_id, calendar_id, event_id, etag, last_synced_at, sync_status, last_error, created_at, updated_at";
function toJob(row) {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    appointmentId: Number(row.appointment_id),
    userId: Number(row.user_id),
    operation: row.operation ?? "update",
    payload: row.payload ?? {},
    idempotencyKey: String(row.idempotency_key ?? ""),
    attempts: Number(row.attempts ?? 0),
    status: row.status ?? "pending",
    nextAttemptAt: row.next_attempt_at ? new Date(String(row.next_attempt_at)).toISOString() : null,
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null
  };
}
function toEvent(row) {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    appointmentId: Number(row.appointment_id),
    userId: Number(row.user_id),
    calendarId: String(row.calendar_id ?? "primary"),
    eventId: String(row.event_id ?? ""),
    etag: row.etag ? String(row.etag) : null,
    lastSyncedAt: row.last_synced_at ? new Date(String(row.last_synced_at)).toISOString() : null,
    syncStatus: String(row.sync_status ?? "pending"),
    lastError: row.last_error ? String(row.last_error) : null
  };
}
var googleCalendarSyncModel = {
  /** Busca job ativo por chave de idempotência (usado na idempotência). */
  async findByIdempotencyKey(idempotencyKey) {
    const { data, error } = await getSupabaseAdmin().from("calendar_sync_jobs").select(JOB_COLUMNS).eq("idempotency_key", idempotencyKey).limit(1).maybeSingle();
    if (error || !data) return null;
    return toJob(data);
  },
  /** Jobs recentes de uma organização (visão operacional/fila). */
  async findByOrganization(organizationId, limit = 50) {
    const { data, error } = await getSupabaseAdmin().from("calendar_sync_jobs").select(JOB_COLUMNS).eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 100));
    if (error) return [];
    return (data ?? []).map(toJob);
  },
  /** Jobs pendentes e vencidos, na ordem de criação (FIFO). */
  async findDueJobs(limit = 10) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const { data, error } = await getSupabaseAdmin().from("calendar_sync_jobs").select(JOB_COLUMNS).eq("status", "pending").lte("next_attempt_at", now).order("created_at", { ascending: true }).limit(Math.min(Math.max(limit, 1), 50));
    if (error) return [];
    return (data ?? []).map(toJob);
  },
  /** Busca job por id. */
  async findById(id) {
    const { data, error } = await getSupabaseAdmin().from("calendar_sync_jobs").select(JOB_COLUMNS).eq("id", id).limit(1).maybeSingle();
    if (error || !data) return null;
    return toJob(data);
  },
  /** Histórico de jobs de um agendamento. */
  async findByAppointment(appointmentId) {
    const { data, error } = await getSupabaseAdmin().from("calendar_sync_jobs").select(JOB_COLUMNS).eq("appointment_id", appointmentId).order("created_at", { ascending: false });
    if (error) return [];
    return (data ?? []).map(toJob);
  },
  /** Vínculo agendamento ↔ evento Google (do profissional dono). */
  async findEventByAppointment(input) {
    let query = getSupabaseAdmin().from("appointment_google_events").select(EVENT_COLUMNS).eq("organization_id", input.organizationId).eq("appointment_id", input.appointmentId);
    if (input.userId) query = query.eq("user_id", input.userId);
    const { data, error } = await query.limit(1).maybeSingle();
    if (error || !data) return null;
    return toEvent(data);
  },
  /** Grava/atualiza vínculo agendamento ↔ evento. */
  async saveEventLink(input) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const { data, error } = await getSupabaseAdmin().from("appointment_google_events").upsert(
      {
        organization_id: input.organizationId,
        appointment_id: input.appointmentId,
        user_id: input.userId,
        calendar_id: input.calendarId,
        event_id: input.eventId,
        etag: input.etag ?? null,
        last_synced_at: input.lastSyncedAt ?? now,
        sync_status: input.syncStatus,
        last_error: input.lastError ?? null
      },
      { onConflict: "appointment_id,user_id" }
    ).select(EVENT_COLUMNS).single();
    if (error || !data) {
      throw new Error(
        `[google_sync] Falha ao salvar v\xEDnculo: ${error?.message ?? "erro"}`
      );
    }
    return toEvent(data);
  },
  /** Insere job idempotente (unique em idempotency_key). Retorna job existente se já existir. */
  async insertJob(input) {
    const { data, error } = await getSupabaseAdmin().from("calendar_sync_jobs").insert(input).select(JOB_COLUMNS).single();
    if (error) {
      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      return existing;
    }
    return toJob(data);
  },
  /** Busca job por id e devolve a versão atualizada (para claim/atualizações). */
  async updateJobStatus(id, status, overrides = {}) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const patch = { status };
    if (overrides.attempts !== void 0) patch.attempts = overrides.attempts;
    if (overrides.nextAttemptAt !== void 0) patch.next_attempt_at = overrides.nextAttemptAt;
    if (overrides.lastError !== void 0) patch.last_error = overrides.lastError;
    patch.updated_at = now;
    const { data, error } = await getSupabaseAdmin().from("calendar_sync_jobs").update(patch).eq("id", id).select(JOB_COLUMNS).single();
    if (error || !data) return null;
    return toJob(data);
  }
};

// server/services/google-calendar-sync.service.ts
var GoogleCalendarConflictError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "GoogleCalendarConflictError";
  }
};
function payloadFor(appointment) {
  const patientName = appointment.patient?.fullName ?? `Paciente #${appointment.patientId}`;
  const procedureName = appointment.procedure?.name ?? "Atendimento";
  return {
    summary: `${procedureName} \u2014 ${patientName}`.slice(0, 250),
    description: [
      appointment.professional?.fullName ? `Profissional: ${appointment.professional.fullName}` : null,
      appointment.notes ? `Observa\xE7\xF5es: ${appointment.notes}` : null,
      `OllCLin \u2022 Agendamento #${appointment.id}`
    ].filter(Boolean).join("\n").slice(0, 2e3),
    start: { dateTime: toGoogleDateTime(appointment.startsAt), timeZone: googleTimeZone() },
    end: { dateTime: toGoogleDateTime(appointment.endsAt), timeZone: googleTimeZone() },
    extendedProperties: { private: { ollclin_appointment_id: String(appointment.id), ollclin_organization_id: String(appointment.organizationId) } }
  };
}
async function findLink(organizationId, appointmentId, userId) {
  const { data, error } = await getSupabaseAdmin().from("appointment_google_events").select("event_id, calendar_id").eq("organization_id", organizationId).eq("appointment_id", appointmentId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Falha ao consultar v\xEDnculo Google: ${error.message}`);
  return data;
}
async function saveLink(input) {
  const { error } = await getSupabaseAdmin().from("appointment_google_events").upsert({
    organization_id: input.organizationId,
    appointment_id: input.appointmentId,
    user_id: input.userId,
    event_id: input.eventId,
    calendar_id: input.calendarId,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }, { onConflict: "appointment_id,user_id" });
  if (error) throw new Error(`Falha ao salvar v\xEDnculo Google: ${error.message}`);
}
async function clearLink(organizationId, appointmentId, userId) {
  const { error } = await getSupabaseAdmin().from("appointment_google_events").delete().eq("organization_id", organizationId).eq("appointment_id", appointmentId).eq("user_id", userId);
  if (error) throw new Error(`Falha ao remover v\xEDnculo Google: ${error.message}`);
}
async function assertNoGoogleConflict(accessToken, calendarId, appointment, existingEventId) {
  const start = new Date(appointment.startsAt);
  const end = new Date(appointment.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
  const events = await listEvents(accessToken, {
    calendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    maxResults: 250
  });
  const conflict = events.find((event) => {
    if (event.id === existingEventId || event.status === "cancelled") return false;
    const eventStart = new Date(event.start.dateTime ?? `${event.start.date}T00:00:00`);
    const eventEnd = new Date(event.end.dateTime ?? `${event.end.date}T23:59:59`);
    return eventStart < end && eventEnd > start;
  });
  if (conflict) {
    throw new GoogleCalendarConflictError(
      `Conflito no Google Calendar: o hor\xE1rio coincide com \u201C${conflict.summary ?? "outro evento"}\u201D.`
    );
  }
}
async function syncAppointmentForUser(appointment, userId) {
  if (appointment.status === "desmarcado") return removeAppointmentForUser(appointment, userId);
  const auth = await googleCalendarModel.getAccessToken(appointment.organizationId, userId);
  if (!auth) return { status: "not_connected" };
  const link = await findLink(appointment.organizationId, appointment.id, userId);
  const existingEventId = link?.event_id ?? null;
  await assertNoGoogleConflict(auth.accessToken, auth.calendarId, appointment, existingEventId);
  const payload = payloadFor(appointment);
  let event;
  let status = existingEventId ? "updated" : "created";
  if (existingEventId) {
    try {
      event = await updateEvent(auth.accessToken, existingEventId, payload, auth.calendarId);
    } catch (error) {
      if (!(error instanceof GoogleCalendarError && (error.status === 404 || error.status === 410))) throw error;
      status = "created";
      event = await createEvent(auth.accessToken, payload, auth.calendarId);
    }
  } else {
    event = await createEvent(auth.accessToken, payload, auth.calendarId);
  }
  await saveLink({ organizationId: appointment.organizationId, appointmentId: appointment.id, userId, eventId: event.id, calendarId: auth.calendarId });
  return { status, eventId: event.id, htmlLink: event.htmlLink };
}
async function removeAppointmentForUser(appointment, userId) {
  const link = await findLink(appointment.organizationId, appointment.id, userId);
  const auth = await googleCalendarModel.getAccessToken(appointment.organizationId, userId);
  if (!auth) {
    if (link) await clearLink(appointment.organizationId, appointment.id, userId);
    return { status: "not_connected" };
  }
  const eventId = link?.event_id ?? (appointment.googleCalendarEventId ?? null);
  if (eventId) await deleteEvent(auth.accessToken, eventId, link?.calendar_id ?? auth.calendarId);
  await clearLink(appointment.organizationId, appointment.id, userId);
  return { status: "removed" };
}
function buildAppointmentSyncIdempotencyKey(appointmentId, userId, version) {
  return `appointment:${appointmentId}:user:${userId}:version:${version}`;
}
async function enqueueAppointmentSync(input) {
  const job = await googleCalendarSyncModel.insertJob({
    organizationId: input.organizationId,
    appointmentId: input.appointmentId,
    userId: input.userId,
    operation: input.operation,
    idempotencyKey: buildAppointmentSyncIdempotencyKey(
      input.appointmentId,
      input.userId,
      input.version
    ),
    payload: {
      appointmentId: input.appointmentId,
      version: input.version
    }
  });
  if (!job) {
    const existing = await googleCalendarSyncModel.findByIdempotencyKey(
      buildAppointmentSyncIdempotencyKey(input.appointmentId, input.userId, input.version)
    );
    if (!existing) throw new Error("[google_sync] Falha ao enfileirar job de sincroniza\xE7\xE3o");
    return existing;
  }
  return job;
}
async function pullGoogleRangeForUser(input) {
  const auth = await googleCalendarModel.getAccessToken(input.organizationId, input.userId);
  if (!auth) return { status: "not_connected", updated: 0, conflicts: [] };
  const events = await listEvents(auth.accessToken, {
    calendarId: auth.calendarId,
    timeMin: new Date(input.from).toISOString(),
    timeMax: new Date(input.to).toISOString(),
    maxResults: 2500
  });
  let updated = 0;
  const conflicts = [];
  for (const event of events) {
    const appointmentId = Number(event.extendedProperties?.private?.ollclin_appointment_id);
    const startsAt = event.start.dateTime;
    const endsAt = event.end.dateTime;
    if (!Number.isInteger(appointmentId) || !startsAt || !endsAt) continue;
    const appointment = await appointmentModel.findById(appointmentId, input.organizationId);
    if (!appointment || appointment.status === "desmarcado") continue;
    const nextStart = new Date(startsAt);
    const nextEnd = new Date(endsAt);
    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) continue;
    if (nextStart.toISOString() === new Date(appointment.startsAt).toISOString() && nextEnd.toISOString() === new Date(appointment.endsAt).toISOString()) continue;
    const hasConflict = await appointmentModel.checkConflict({
      professionalId: appointment.professionalId,
      startsAt: nextStart.toISOString(),
      endsAt: nextEnd.toISOString(),
      excludeId: appointment.id,
      roomId: appointment.roomId ?? void 0
    });
    if (hasConflict) {
      conflicts.push(`Agendamento #${appointment.id}: o novo hor\xE1rio conflita com outro agendamento.`);
      continue;
    }
    await appointmentModel.update(appointment.id, input.organizationId, {
      id: appointment.id,
      startsAt: nextStart.toISOString(),
      endsAt: nextEnd.toISOString()
    });
    updated += 1;
  }
  return { status: "updated", updated, conflicts };
}

// server/controllers/appointment.controller.ts
var statusSchema = z3.enum([
  "solicitado",
  "confirmado",
  "em_espera",
  "em_atendimento",
  "atendido",
  "faltou",
  "desmarcado"
]);
var isoDate = z3.string().refine((value) => !Number.isNaN(new Date(value).getTime()), {
  message: "Data inv\xE1lida"
});
function syncVersion(appointment) {
  const version = appointment.updatedAt ?? appointment.createdAt;
  return version ? String(version) : `${appointment.startsAt}|${appointment.endsAt}|${appointment.status}`;
}
async function enqueueGoogleSync(input) {
  const appointment = await appointmentModel.findById(
    input.appointmentId,
    input.organizationId
  );
  if (!appointment) {
    throw new Error("Agendamento n\xE3o encontrado para enfileirar sincroniza\xE7\xE3o");
  }
  const job = await enqueueAppointmentSync({
    organizationId: input.organizationId,
    appointmentId: appointment.id,
    userId: input.userId,
    operation: input.operation,
    version: syncVersion(appointment)
  });
  return {
    status: job.status,
    operation: job.operation,
    idempotencyKey: job.idempotencyKey,
    attempts: job.attempts,
    lastError: job.lastError
  };
}
var createAppointmentSchema = z3.object({
  organizationId: z3.number().int().positive(),
  patientId: z3.number().int().positive(),
  professionalId: z3.number().int().positive(),
  procedureId: z3.number().int().positive(),
  establishmentId: z3.number().int().optional(),
  locationId: z3.number().int().optional(),
  roomId: z3.number().int().optional(),
  startsAt: isoDate,
  endsAt: isoDate,
  status: statusSchema.default("solicitado"),
  notes: z3.string().optional()
});
var updateAppointmentSchema = z3.object({
  id: z3.number().int().positive(),
  organizationId: z3.number().int().positive(),
  patientId: z3.number().int().positive().optional(),
  professionalId: z3.number().int().positive().optional(),
  procedureId: z3.number().int().positive().optional(),
  establishmentId: z3.number().int().optional(),
  locationId: z3.number().int().optional(),
  roomId: z3.number().int().optional(),
  startsAt: isoDate.optional(),
  endsAt: isoDate.optional(),
  status: statusSchema.optional(),
  notes: z3.string().optional()
});
var appointmentFilterSchema = z3.object({
  organizationId: z3.number().int().positive(),
  professionalId: z3.number().int().optional(),
  patientId: z3.number().int().optional(),
  status: statusSchema.optional(),
  startsAtFrom: z3.string().optional(),
  startsAtTo: z3.string().optional(),
  limit: z3.number().int().min(1).max(500).default(50),
  offset: z3.number().int().min(0).default(0)
});
var conflictCheckSchema = z3.object({
  professionalId: z3.number().int().positive(),
  startsAt: isoDate,
  endsAt: isoDate,
  excludeId: z3.number().int().optional(),
  roomId: z3.number().int().optional()
});
var appointmentRouter = router({
  list: protectedProcedure.input(appointmentFilterSchema).query(async ({ input }) => appointmentModel.findMany(input)),
  getById: protectedProcedure.input(z3.object({ id: z3.number().int(), organizationId: z3.number().int() })).query(async ({ input }) => {
    const appointment = await appointmentModel.findById(
      input.id,
      input.organizationId
    );
    if (!appointment) {
      throw new TRPCError4({
        code: "NOT_FOUND",
        message: "Agendamento n\xE3o encontrado"
      });
    }
    return appointment;
  }),
  create: protectedWith("appointments.write").input(createAppointmentSchema).mutation(async ({ ctx, input }) => {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) {
      throw new TRPCError4({
        code: "BAD_REQUEST",
        message: "O hor\xE1rio final deve ser posterior ao inicial"
      });
    }
    const hasConflict = await appointmentModel.checkConflict({
      professionalId: input.professionalId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      roomId: input.roomId
    });
    if (hasConflict) {
      throw new TRPCError4({
        code: "CONFLICT",
        message: "Conflito de hor\xE1rio: profissional ou sala j\xE1 possui agendamento neste per\xEDodo"
      });
    }
    const appointment = await appointmentModel.create({
      ...input,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      createdBy: ctx.user.id
    });
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "CREATE",
      entity: "appointment",
      entityId: appointment.id,
      newValues: {
        patientId: input.patientId,
        professionalId: input.professionalId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: input.status
      },
      request: ctx.req
    });
    const googleSync = await enqueueGoogleSync({
      organizationId: input.organizationId,
      appointmentId: appointment.id,
      userId: ctx.user.id,
      operation: "create"
    });
    return {
      appointment,
      googleSync
    };
  }),
  update: protectedWith("appointments.write").input(updateAppointmentSchema).mutation(async ({ ctx, input }) => {
    const { id, organizationId, startsAt, endsAt, ...data } = input;
    const existing = await appointmentModel.findById(id, organizationId);
    if (!existing) {
      throw new TRPCError4({
        code: "NOT_FOUND",
        message: "Agendamento n\xE3o encontrado"
      });
    }
    const nextStartsAt = startsAt ? new Date(startsAt) : new Date(existing.startsAt);
    const nextEndsAt = endsAt ? new Date(endsAt) : new Date(existing.endsAt);
    if (nextEndsAt <= nextStartsAt) {
      throw new TRPCError4({
        code: "BAD_REQUEST",
        message: "O hor\xE1rio final deve ser posterior ao inicial"
      });
    }
    if (startsAt || endsAt || data.professionalId || data.roomId) {
      const hasConflict = await appointmentModel.checkConflict({
        professionalId: data.professionalId ?? existing.professionalId,
        startsAt: nextStartsAt.toISOString(),
        endsAt: nextEndsAt.toISOString(),
        excludeId: id,
        roomId: data.roomId ?? existing.roomId ?? void 0
      });
      if (hasConflict) {
        throw new TRPCError4({
          code: "CONFLICT",
          message: "Conflito de hor\xE1rio: profissional ou sala j\xE1 possui agendamento neste per\xEDodo"
        });
      }
    }
    const appointment = await appointmentModel.update(id, organizationId, {
      id,
      ...data,
      startsAt: nextStartsAt.toISOString(),
      endsAt: nextEndsAt.toISOString()
    });
    if (!appointment) {
      throw new TRPCError4({
        code: "NOT_FOUND",
        message: "Agendamento n\xE3o encontrado"
      });
    }
    await writeAuditLog({
      organizationId,
      userId: ctx.user.id,
      action: "UPDATE",
      entity: "appointment",
      entityId: id,
      oldValues: {
        status: existing.status,
        startsAt: existing.startsAt,
        endsAt: existing.endsAt
      },
      newValues: {
        status: data.status ?? existing.status,
        startsAt: nextStartsAt.toISOString(),
        endsAt: nextEndsAt.toISOString()
      },
      request: ctx.req
    });
    const googleSync = await enqueueGoogleSync({
      organizationId,
      appointmentId: appointment.id,
      userId: ctx.user.id,
      operation: input.status === "desmarcado" ? "delete" : "update"
    });
    return {
      appointment,
      googleSync
    };
  }),
  delete: protectedWith("appointments.write").input(z3.object({ id: z3.number().int(), organizationId: z3.number().int() })).mutation(async ({ ctx, input }) => {
    const appointment = await appointmentModel.delete(
      input.id,
      input.organizationId
    );
    if (!appointment) {
      throw new TRPCError4({
        code: "NOT_FOUND",
        message: "Agendamento n\xE3o encontrado"
      });
    }
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "DELETE",
      entity: "appointment",
      entityId: input.id,
      newValues: { status: "desmarcado" },
      request: ctx.req
    });
    const googleSync = await enqueueGoogleSync({
      organizationId: input.organizationId,
      appointmentId: appointment.id,
      userId: ctx.user.id,
      operation: "delete"
    });
    return {
      success: true,
      googleSync
    };
  }),
  checkConflict: protectedProcedure.input(conflictCheckSchema).query(async ({ input }) => {
    const hasConflict = await appointmentModel.checkConflict({
      professionalId: input.professionalId,
      startsAt: new Date(input.startsAt).toISOString(),
      endsAt: new Date(input.endsAt).toISOString(),
      excludeId: input.excludeId,
      roomId: input.roomId
    });
    return { hasConflict };
  })
});

// server/controllers/professional.controller.ts
import { z as z4 } from "zod";
import { TRPCError as TRPCError5 } from "@trpc/server";

// server/models/professional.model.ts
init_supabase_server();
var LEGACY_PROFESSIONAL_COLUMNS = "id, organization_id, user_id, full_name, cpf, council, council_number, specialty, phone, email, is_active, created_at, updated_at";
var FULL_PROFESSIONAL_COLUMNS = "id, organization_id, user_id, full_name, cpf, council, council_number, specialty, phone, email, commission_percentage, is_active, created_at, updated_at";
function professionalColumns(hasCommission) {
  return hasCommission ? FULL_PROFESSIONAL_COLUMNS : LEGACY_PROFESSIONAL_COLUMNS;
}
function toProfessional(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    fullName: row.full_name,
    cpf: row.cpf,
    council: row.council,
    councilNumber: row.council_number,
    specialty: row.specialty,
    phone: row.phone,
    email: row.email,
    commissionPercentage: Number(row.commission_percentage ?? 0),
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function toRow3(data, hasCommission) {
  const row = {};
  if (data.organizationId !== void 0) row.organization_id = data.organizationId;
  if (data.userId !== void 0) row.user_id = data.userId ?? null;
  if (data.fullName !== void 0) row.full_name = data.fullName;
  if (data.cpf !== void 0) row.cpf = data.cpf;
  if (data.council !== void 0) row.council = data.council;
  if (data.councilNumber !== void 0) row.council_number = data.councilNumber;
  if (data.specialty !== void 0) row.specialty = data.specialty;
  if (data.phone !== void 0) row.phone = data.phone;
  if (data.email !== void 0) row.email = data.email;
  if (data.commissionPercentage !== void 0) {
    if (hasCommission) {
      row.commission_percentage = data.commissionPercentage;
    } else if (data.commissionPercentage !== 0) {
      throw new Error(MIGRATION_0003_FIELDS_HINT);
    }
  }
  if (data.isActive !== void 0) row.is_active = data.isActive;
  return row;
}
function fail4(context, error) {
  throw new Error(
    `[professionals] ${context}: ${error?.message ?? "erro desconhecido"}`
  );
}
var professionalModel = {
  async create(data) {
    const caps = await getSchemaCapabilities();
    const { data: row, error } = await getSupabaseAdmin().from("professionals").insert({ ...toRow3(data, caps.professionalCommission), is_active: data.isActive ?? true }).select(professionalColumns(caps.professionalCommission)).single();
    if (error || !row) fail4("erro ao criar profissional", error);
    return toProfessional(row);
  },
  async findById(id, organizationId) {
    const caps = await getSchemaCapabilities();
    const { data: row, error } = await getSupabaseAdmin().from("professionals").select(professionalColumns(caps.professionalCommission)).eq("id", id).eq("organization_id", organizationId).maybeSingle();
    if (error) fail4("erro ao buscar profissional", error);
    return row ? toProfessional(row) : null;
  },
  async findMany(filter) {
    const caps = await getSchemaCapabilities();
    const {
      organizationId,
      search,
      specialty,
      isActive,
      limit = 50,
      offset = 0
    } = filter;
    let query = getSupabaseAdmin().from("professionals").select(professionalColumns(caps.professionalCommission)).eq("organization_id", organizationId);
    if (isActive !== void 0) query = query.eq("is_active", isActive);
    if (specialty) query = query.eq("specialty", specialty);
    if (search) {
      const term = search.replace(/[%,()]/g, "").trim();
      if (term) {
        query = query.or(
          `full_name.ilike.%${term}%,specialty.ilike.%${term}%,cpf.ilike.%${term}%`
        );
      }
    }
    const { data, error } = await query.order("full_name", { ascending: true }).range(offset, offset + limit - 1);
    if (error) fail4("erro ao listar profissionais", error);
    return (data ?? []).map((row) => toProfessional(row));
  },
  async update(id, organizationId, data) {
    const { id: _ignored, ...rest } = data;
    const caps = await getSchemaCapabilities();
    const { data: row, error } = await getSupabaseAdmin().from("professionals").update({
      ...toRow3(rest, caps.professionalCommission),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", id).eq("organization_id", organizationId).select(professionalColumns(caps.professionalCommission)).maybeSingle();
    if (error) fail4("erro ao atualizar profissional", error);
    return row ? toProfessional(row) : null;
  },
  async delete(id, organizationId) {
    const caps = await getSchemaCapabilities();
    const { data: row, error } = await getSupabaseAdmin().from("professionals").update({ is_active: false, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("organization_id", organizationId).select(professionalColumns(caps.professionalCommission)).maybeSingle();
    if (error) fail4("erro ao desativar profissional", error);
    return row ? toProfessional(row) : null;
  }
};

// server/controllers/professional.controller.ts
var createProfessionalSchema = z4.object({
  organizationId: z4.number().int().positive(),
  userId: z4.number().int().optional(),
  fullName: z4.string().min(2, "Nome completo \xE9 obrigat\xF3rio"),
  cpf: z4.string().optional(),
  council: z4.string().optional(),
  councilNumber: z4.string().optional(),
  specialty: z4.string().optional(),
  phone: z4.string().optional(),
  email: z4.string().email().optional(),
  commissionPercentage: z4.number().min(0).max(100).optional(),
  isActive: z4.boolean().default(true)
});
var updateProfessionalSchema = z4.object({
  id: z4.number().int().positive(),
  organizationId: z4.number().int().positive(),
  userId: z4.number().int().optional(),
  fullName: z4.string().min(2).optional(),
  cpf: z4.string().optional(),
  council: z4.string().optional(),
  councilNumber: z4.string().optional(),
  specialty: z4.string().optional(),
  phone: z4.string().optional(),
  email: z4.string().email().optional(),
  commissionPercentage: z4.number().min(0).max(100).optional(),
  isActive: z4.boolean().optional()
});
var professionalFilterSchema = z4.object({
  organizationId: z4.number().int().positive(),
  search: z4.string().optional(),
  specialty: z4.string().optional(),
  isActive: z4.boolean().optional(),
  limit: z4.number().int().min(1).max(200).default(50),
  offset: z4.number().int().min(0).default(0)
});
var professionalRouter = router({
  list: protectedProcedure.input(professionalFilterSchema).query(async ({ input }) => professionalModel.findMany(input)),
  getById: protectedProcedure.input(z4.object({ id: z4.number().int(), organizationId: z4.number().int() })).query(async ({ input }) => {
    const professional = await professionalModel.findById(
      input.id,
      input.organizationId
    );
    if (!professional) {
      throw new TRPCError5({
        code: "NOT_FOUND",
        message: "Profissional n\xE3o encontrado"
      });
    }
    return professional;
  }),
  create: protectedProcedure.input(createProfessionalSchema).mutation(async ({ ctx, input }) => {
    const professional = await professionalModel.create(input);
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "CREATE",
      entity: "professional",
      entityId: professional.id,
      newValues: { fullName: input.fullName, specialty: input.specialty },
      request: ctx.req
    });
    return professional;
  }),
  update: protectedProcedure.input(updateProfessionalSchema).mutation(async ({ ctx, input }) => {
    const { id, organizationId, ...data } = input;
    const existing = await professionalModel.findById(id, organizationId);
    if (!existing) {
      throw new TRPCError5({
        code: "NOT_FOUND",
        message: "Profissional n\xE3o encontrado"
      });
    }
    const professional = await professionalModel.update(id, organizationId, {
      id,
      ...data
    });
    await writeAuditLog({
      organizationId,
      userId: ctx.user.id,
      action: "UPDATE",
      entity: "professional",
      entityId: id,
      oldValues: existing,
      newValues: data,
      request: ctx.req
    });
    return professional;
  }),
  delete: protectedProcedure.input(z4.object({ id: z4.number().int(), organizationId: z4.number().int() })).mutation(async ({ ctx, input }) => {
    const professional = await professionalModel.delete(
      input.id,
      input.organizationId
    );
    if (!professional) {
      throw new TRPCError5({
        code: "NOT_FOUND",
        message: "Profissional n\xE3o encontrado"
      });
    }
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "DELETE",
      entity: "professional",
      entityId: input.id,
      newValues: { isActive: false },
      request: ctx.req
    });
    return { success: true };
  })
});

// server/controllers/procedure.controller.ts
import { z as z5 } from "zod";
import { TRPCError as TRPCError6 } from "@trpc/server";

// server/models/procedure.model.ts
init_supabase_server();
var PROCEDURE_COLUMNS = "id, organization_id, name, description, duration_minutes, price, is_active, created_at, updated_at";
function toProcedure(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
    price: row.price,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function toRow4(data) {
  const row = {};
  if (data.organizationId !== void 0) row.organization_id = data.organizationId;
  if (data.name !== void 0) row.name = data.name;
  if (data.description !== void 0) row.description = data.description;
  if (data.durationMinutes !== void 0) row.duration_minutes = data.durationMinutes;
  if (data.price !== void 0) row.price = data.price;
  if (data.isActive !== void 0) row.is_active = data.isActive;
  return row;
}
function fail5(context, error) {
  throw new Error(
    `[procedures] ${context}: ${error?.message ?? "erro desconhecido"}`
  );
}
var procedureModel = {
  async create(data) {
    const { data: row, error } = await getSupabaseAdmin().from("procedures").insert({ ...toRow4(data), is_active: data.isActive ?? true }).select(PROCEDURE_COLUMNS).single();
    if (error || !row) fail5("erro ao criar procedimento", error);
    return toProcedure(row);
  },
  async findById(id, organizationId) {
    const { data: row, error } = await getSupabaseAdmin().from("procedures").select(PROCEDURE_COLUMNS).eq("id", id).eq("organization_id", organizationId).maybeSingle();
    if (error) fail5("erro ao buscar procedimento", error);
    return row ? toProcedure(row) : null;
  },
  async findMany(filter) {
    const { organizationId, search, isActive, limit = 50, offset = 0 } = filter;
    let query = getSupabaseAdmin().from("procedures").select(PROCEDURE_COLUMNS).eq("organization_id", organizationId);
    if (isActive !== void 0) query = query.eq("is_active", isActive);
    if (search) {
      const term = search.replace(/[%,()]/g, "").trim();
      if (term) {
        query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
      }
    }
    const { data, error } = await query.order("name", { ascending: true }).range(offset, offset + limit - 1);
    if (error) fail5("erro ao listar procedimentos", error);
    return (data ?? []).map((row) => toProcedure(row));
  },
  async update(id, organizationId, data) {
    const { id: _ignored, ...rest } = data;
    const { data: row, error } = await getSupabaseAdmin().from("procedures").update({ ...toRow4(rest), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("organization_id", organizationId).select(PROCEDURE_COLUMNS).maybeSingle();
    if (error) fail5("erro ao atualizar procedimento", error);
    return row ? toProcedure(row) : null;
  },
  async delete(id, organizationId) {
    const { data: row, error } = await getSupabaseAdmin().from("procedures").update({ is_active: false, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("organization_id", organizationId).select(PROCEDURE_COLUMNS).maybeSingle();
    if (error) fail5("erro ao desativar procedimento", error);
    return row ? toProcedure(row) : null;
  }
};

// server/controllers/procedure.controller.ts
var createProcedureSchema = z5.object({
  organizationId: z5.number().int().positive(),
  name: z5.string().min(2, "Nome do procedimento \xE9 obrigat\xF3rio"),
  description: z5.string().optional(),
  durationMinutes: z5.number().int().positive().default(30),
  price: z5.string().default("0.00"),
  isActive: z5.boolean().default(true)
});
var updateProcedureSchema = z5.object({
  id: z5.number().int().positive(),
  organizationId: z5.number().int().positive(),
  name: z5.string().min(2).optional(),
  description: z5.string().optional(),
  durationMinutes: z5.number().int().positive().optional(),
  price: z5.string().optional(),
  isActive: z5.boolean().optional()
});
var procedureFilterSchema = z5.object({
  organizationId: z5.number().int().positive(),
  search: z5.string().optional(),
  isActive: z5.boolean().optional(),
  limit: z5.number().int().min(1).max(200).default(50),
  offset: z5.number().int().min(0).default(0)
});
var procedureRouter = router({
  list: protectedProcedure.input(procedureFilterSchema).query(async ({ input }) => procedureModel.findMany(input)),
  getById: protectedProcedure.input(z5.object({ id: z5.number().int(), organizationId: z5.number().int() })).query(async ({ input }) => {
    const procedure = await procedureModel.findById(
      input.id,
      input.organizationId
    );
    if (!procedure) {
      throw new TRPCError6({
        code: "NOT_FOUND",
        message: "Procedimento n\xE3o encontrado"
      });
    }
    return procedure;
  }),
  create: protectedProcedure.input(createProcedureSchema).mutation(async ({ ctx, input }) => {
    const procedure = await procedureModel.create(input);
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "CREATE",
      entity: "procedure",
      entityId: procedure.id,
      newValues: { name: input.name, price: input.price },
      request: ctx.req
    });
    return procedure;
  }),
  update: protectedProcedure.input(updateProcedureSchema).mutation(async ({ ctx, input }) => {
    const { id, organizationId, ...data } = input;
    const existing = await procedureModel.findById(id, organizationId);
    if (!existing) {
      throw new TRPCError6({
        code: "NOT_FOUND",
        message: "Procedimento n\xE3o encontrado"
      });
    }
    const procedure = await procedureModel.update(id, organizationId, {
      id,
      ...data
    });
    await writeAuditLog({
      organizationId,
      userId: ctx.user.id,
      action: "UPDATE",
      entity: "procedure",
      entityId: id,
      oldValues: existing,
      newValues: data,
      request: ctx.req
    });
    return procedure;
  }),
  delete: protectedProcedure.input(z5.object({ id: z5.number().int(), organizationId: z5.number().int() })).mutation(async ({ ctx, input }) => {
    const procedure = await procedureModel.delete(
      input.id,
      input.organizationId
    );
    if (!procedure) {
      throw new TRPCError6({
        code: "NOT_FOUND",
        message: "Procedimento n\xE3o encontrado"
      });
    }
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "DELETE",
      entity: "procedure",
      entityId: input.id,
      newValues: { isActive: false },
      request: ctx.req
    });
    return { success: true };
  })
});

// server/controllers/expense.controller.ts
import { z as z6 } from "zod";
import { TRPCError as TRPCError7 } from "@trpc/server";

// server/models/expense.model.ts
init_supabase_server();
var CATEGORY_COLUMNS = "id, organization_id, parent_id, name, kind, is_active";
function toCategory(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    parentId: row.parent_id,
    name: row.name,
    kind: row.kind === "fixa" ? "fixa" : "variavel",
    isActive: row.is_active ?? true
  };
}
function fail6(context, error) {
  console.error(`[ExpenseModel] ${context}:`, error?.message);
  throw new Error(`Falha ao ${context}`);
}
var EXPENSE_COLUMNS = "id, organization_id, expense_category_id, payee_name, payment_method_id, installment_no, installments_total, amount, status, due_date, paid_at, description, attachment_url, recurrence_rule, created_by, created_at";
function toExpense(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    expenseCategoryId: row.expense_category_id,
    payeeName: row.payee_name,
    paymentMethodId: row.payment_method_id,
    installmentNo: row.installment_no ?? 1,
    installmentsTotal: row.installments_total ?? 1,
    amount: Number(row.amount),
    status: row.status ?? "a_pagar",
    dueDate: row.due_date,
    paidAt: row.paid_at,
    description: row.description,
    attachmentUrl: row.attachment_url,
    recurrenceRule: row.recurrence_rule,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}
var expenseModel = {
  /* ------------------------------ categorias ------------------------------ */
  async listCategories(organizationId) {
    const { data, error } = await getSupabaseAdmin().from("expense_categories").select(CATEGORY_COLUMNS).eq("organization_id", organizationId).eq("is_active", true).order("name");
    if (error) fail6("listar categorias", error);
    return (data ?? []).map(toCategory);
  },
  async createCategory(organizationId, name, kind, parentId) {
    const { data: row, error } = await getSupabaseAdmin().from("expense_categories").insert({
      organization_id: organizationId,
      name,
      kind,
      parent_id: parentId ?? null
    }).select(CATEGORY_COLUMNS).single();
    if (error) fail6("criar categoria", error);
    return toCategory(row);
  },
  async deleteCategory(id, organizationId) {
    const { error } = await getSupabaseAdmin().from("expense_categories").update({ is_active: false }).eq("id", id).eq("organization_id", organizationId);
    if (error) fail6("inativar categoria", error);
    return true;
  },
  /* -------------------------------- despesas ------------------------------- */
  async create(data) {
    const { data: row, error } = await getSupabaseAdmin().from("expenses").insert({
      organization_id: data.organizationId,
      expense_category_id: data.expenseCategoryId ?? null,
      payee_name: data.payeeName ?? null,
      payment_method_id: data.paymentMethodId ?? null,
      installment_no: data.installmentNo ?? 1,
      installments_total: data.installmentsTotal ?? 1,
      amount: data.amount,
      status: data.status ?? "a_pagar",
      due_date: data.dueDate ?? null,
      paid_at: data.paidAt ?? null,
      description: data.description ?? null,
      attachment_url: data.attachmentUrl ?? null,
      recurrence_rule: data.recurrenceRule ?? null,
      created_by: data.createdBy ?? null
    }).select(EXPENSE_COLUMNS).single();
    if (error) fail6("criar despesa", error);
    return toExpense(row);
  },
  async findById(id, organizationId) {
    const { data: row, error } = await getSupabaseAdmin().from("expenses").select(EXPENSE_COLUMNS).eq("id", id).eq("organization_id", organizationId).maybeSingle();
    if (error) fail6("consultar despesa", error);
    return row ? toExpense(row) : null;
  },
  async findMany(filter) {
    let query = getSupabaseAdmin().from("expenses").select(EXPENSE_COLUMNS).eq("organization_id", filter.organizationId).order("created_at", { ascending: false });
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.from) query = query.gte("created_at", filter.from);
    if (filter.to) query = query.lte("created_at", filter.to);
    const { data, error } = await query.range(
      filter.offset ?? 0,
      (filter.offset ?? 0) + (filter.limit ?? 50) - 1
    );
    if (error) fail6("listar despesas", error);
    return (data ?? []).map(toExpense);
  },
  /** Resumo: pago / a pagar / atrasado (Cap. 15.2). */
  async summarize(organizationId) {
    const { data, error } = await getSupabaseAdmin().from("expenses").select("amount, status, due_date").eq("organization_id", organizationId);
    if (error) fail6("resumir despesas", error);
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const summary = { paidTotal: 0, toPayTotal: 0, overdueTotal: 0 };
    for (const row of data ?? []) {
      const amount = Number(row.amount);
      const status = row.status;
      const due = row.due_date;
      if (status === "pago") summary.paidTotal += amount;
      if (status === "a_pagar") {
        summary.toPayTotal += amount;
        if (due && due < today) summary.overdueTotal += amount;
      }
    }
    return summary;
  },
  async update(id, organizationId, data) {
    const patch = {};
    if (data.amount !== void 0) patch.amount = data.amount;
    if (data.status !== void 0) patch.status = data.status;
    if (data.payeeName !== void 0) patch.payee_name = data.payeeName;
    if (data.dueDate !== void 0) patch.due_date = data.dueDate;
    if (data.paidAt !== void 0) patch.paid_at = data.paidAt;
    if (data.description !== void 0) patch.description = data.description;
    if (data.attachmentUrl !== void 0) patch.attachment_url = data.attachmentUrl;
    if (data.expenseCategoryId !== void 0) patch.expense_category_id = data.expenseCategoryId;
    if (data.paymentMethodId !== void 0) patch.payment_method_id = data.paymentMethodId;
    if (data.installmentNo !== void 0) patch.installment_no = data.installmentNo;
    if (data.installmentsTotal !== void 0) patch.installments_total = data.installmentsTotal;
    if (data.recurrenceRule !== void 0) patch.recurrence_rule = data.recurrenceRule;
    if (Object.keys(patch).length === 0) return this.findById(id, organizationId);
    const { data: row, error } = await getSupabaseAdmin().from("expenses").update(patch).eq("id", id).eq("organization_id", organizationId).select(EXPENSE_COLUMNS).maybeSingle();
    if (error) fail6("atualizar despesa", error);
    return row ? toExpense(row) : null;
  },
  /** Cancelamento exige motivo (Cap. 15.2); permitido para não pagas. */
  async cancel(id, organizationId, userId, reason) {
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;
    if (existing.status === "cancelado") {
      throw new Error("Despesa j\xE1 est\xE1 cancelada");
    }
    if (existing.status === "pago") {
      throw new Error("Despesa paga n\xE3o pode ser cancelada");
    }
    const { data: row, error } = await getSupabaseAdmin().from("expenses").update({ status: "cancelado" }).eq("id", id).eq("organization_id", organizationId).select(EXPENSE_COLUMNS).maybeSingle();
    if (error) fail6("cancelar despesa", error);
    await this.addHistory(id, userId, "CANCEL", { status: "cancelado" }, reason);
    return row ? toExpense(row) : null;
  },
  async addHistory(expenseId, userId, action, changes, reason) {
    await getSupabaseAdmin().from("expense_history").insert({
      expense_id: expenseId,
      changed_by: userId,
      action,
      changes,
      reason: reason ?? null
    });
  },
  async listHistory(expenseId) {
    const { data, error } = await getSupabaseAdmin().from("expense_history").select("id, action, reason, created_at").eq("expense_id", expenseId).order("created_at", { ascending: false });
    if (error) fail6("listar hist\xF3rico", error);
    return (data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      reason: row.reason ?? null,
      createdAt: row.created_at ?? null
    }));
  }
};

// server/controllers/expense.controller.ts
var expenseStatusSchema = z6.enum(["a_pagar", "pago", "cancelado"]);
var expenseRouter = router({
  /** Categorias hierárquicas (tipo -> categoria) para o formulário (REQ-08-025). */
  categories: protectedProcedure.input(z6.object({ organizationId: z6.number().int().positive() })).query(({ input }) => expenseModel.listCategories(input.organizationId)),
  createCategory: protectedProcedure.input(
    z6.object({
      organizationId: z6.number().int().positive(),
      name: z6.string().min(2, "Nome da categoria \xE9 obrigat\xF3rio"),
      kind: z6.enum(["fixa", "variavel"]),
      parentId: z6.number().int().positive().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const cat = await expenseModel.createCategory(
      input.organizationId,
      input.name,
      input.kind,
      input.parentId
    );
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "CREATE",
      entity: "expense_category",
      entityId: cat.id,
      newValues: { name: cat.name, kind: cat.kind },
      request: ctx.req
    });
    return cat;
  }),
  deleteCategory: protectedProcedure.input(z6.object({ id: z6.number().int().positive(), organizationId: z6.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await expenseModel.deleteCategory(input.id, input.organizationId);
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "DELETE",
      entity: "expense_category",
      entityId: input.id,
      newValues: { isActive: false },
      request: ctx.req
    });
    return { success: true };
  }),
  list: protectedProcedure.input(
    z6.object({
      organizationId: z6.number().int().positive(),
      status: expenseStatusSchema.optional(),
      limit: z6.number().int().min(1).max(200).default(50),
      offset: z6.number().int().min(0).default(0)
    })
  ).query(({ input }) => expenseModel.findMany(input)),
  /** Resumo pago / a pagar / atrasado (Cap. 15.2). */
  summary: protectedProcedure.input(z6.object({ organizationId: z6.number().int().positive() })).query(({ input }) => expenseModel.summarize(input.organizationId)),
  history: protectedProcedure.input(z6.object({ id: z6.number().int().positive(), organizationId: z6.number().int().positive() })).query(async ({ input }) => {
    const expense = await expenseModel.findById(input.id, input.organizationId);
    if (!expense) {
      throw new TRPCError7({ code: "NOT_FOUND", message: "Despesa n\xE3o encontrada" });
    }
    return expenseModel.listHistory(input.id);
  }),
  create: protectedProcedure.input(
    z6.object({
      organizationId: z6.number().int().positive(),
      expenseCategoryId: z6.number().int().positive().optional(),
      payeeName: z6.string().max(255).optional(),
      paymentMethodId: z6.number().int().positive().optional(),
      installmentNo: z6.number().int().min(1).max(48).default(1),
      installmentsTotal: z6.number().int().min(1).max(48).default(1),
      amount: z6.number().min(0, "Valor n\xE3o pode ser negativo"),
      status: expenseStatusSchema.default("a_pagar"),
      dueDate: z6.string().optional(),
      paidAt: z6.string().optional(),
      description: z6.string().optional(),
      recurrenceRule: z6.string().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    if (input.installmentsTotal > 1 && input.installmentNo > input.installmentsTotal) {
      throw new TRPCError7({
        code: "BAD_REQUEST",
        message: "N\xFAmero da parcela maior que o total"
      });
    }
    const createInput = { ...input, createdBy: ctx.user.id };
    const expense = await expenseModel.create(createInput);
    await expenseModel.addHistory(expense.id, ctx.user.id, "CREATE", {
      amount: expense.amount,
      status: expense.status
    });
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "CREATE",
      entity: "expense",
      entityId: expense.id,
      newValues: { amount: expense.amount, status: expense.status },
      request: ctx.req
    });
    return expense;
  }),
  update: protectedProcedure.input(
    z6.object({
      id: z6.number().int().positive(),
      organizationId: z6.number().int().positive(),
      amount: z6.number().min(0).optional(),
      status: expenseStatusSchema.optional(),
      payeeName: z6.string().max(255).optional(),
      dueDate: z6.string().optional(),
      paidAt: z6.string().optional(),
      description: z6.string().optional(),
      expenseCategoryId: z6.number().int().positive().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const { id, organizationId, ...data } = input;
    const existing = await expenseModel.findById(id, organizationId);
    if (!existing) {
      throw new TRPCError7({ code: "NOT_FOUND", message: "Despesa n\xE3o encontrada" });
    }
    if (existing.status === "cancelado") {
      throw new TRPCError7({ code: "BAD_REQUEST", message: "Despesa cancelada n\xE3o pode ser editada" });
    }
    const expense = await expenseModel.update(id, organizationId, { id, ...data });
    await expenseModel.addHistory(id, ctx.user.id, "UPDATE", data);
    await writeAuditLog({
      organizationId,
      userId: ctx.user.id,
      action: "UPDATE",
      entity: "expense",
      entityId: id,
      oldValues: { status: existing.status, amount: existing.amount },
      newValues: data,
      request: ctx.req
    });
    return expense;
  }),
  /** Cancelamento com motivo obrigatório (Cap. 15.2). */
  cancel: protectedProcedure.input(
    z6.object({
      id: z6.number().int().positive(),
      organizationId: z6.number().int().positive(),
      reason: z6.string().min(3, "Motivo do cancelamento \xE9 obrigat\xF3rio")
    })
  ).mutation(async ({ ctx, input }) => {
    const expense = await expenseModel.cancel(input.id, input.organizationId, ctx.user.id, input.reason);
    if (!expense) {
      throw new TRPCError7({ code: "NOT_FOUND", message: "Despesa n\xE3o encontrada" });
    }
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "CANCEL",
      entity: "expense",
      entityId: input.id,
      newValues: { status: "cancelado", reason: input.reason },
      request: ctx.req
    });
    return expense;
  })
});

// server/controllers/settings.controller.ts
import { z as z7 } from "zod";
import { TRPCError as TRPCError8 } from "@trpc/server";
init_supabase_server();
var settingsRouter = router({
  /* --------------------------- Locais de atendimento --------------------- */
  locations: protectedProcedure.input(z7.object({ organizationId: z7.number().int().positive() })).query(async ({ input }) => {
    const { data, error } = await getSupabaseAdmin().from("locations").select("id, name, address, phone, email, is_active").eq("organization_id", input.organizationId).order("name");
    if (error) throw new TRPCError8({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      isActive: row.is_active !== false
    }));
  }),
  createLocation: protectedProcedure.input(
    z7.object({
      organizationId: z7.number().int().positive(),
      name: z7.string().min(2, "Nome do local \xE9 obrigat\xF3rio"),
      // REQ-05-011
      address: z7.string().optional(),
      phone: z7.string().max(20).optional(),
      email: z7.string().email().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    let est = await getSupabaseAdmin().from("establishments").select("id").eq("organization_id", input.organizationId).limit(1).maybeSingle();
    if (!est.data) {
      const created = await getSupabaseAdmin().from("establishments").insert({ organization_id: input.organizationId, name: "Estabelecimento principal" }).select("id").single();
      if (created.error) throw new TRPCError8({ code: "INTERNAL_SERVER_ERROR", message: created.error.message });
      est = { data: created.data, error: null };
    }
    const { data, error } = await getSupabaseAdmin().from("locations").insert({
      organization_id: input.organizationId,
      establishment_id: est.data.id,
      name: input.name,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null
    }).select("id, name").single();
    if (error) throw new TRPCError8({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "CREATE",
      entity: "location",
      entityId: data.id,
      newValues: { name: input.name },
      request: ctx.req
    });
    return data;
  }),
  rooms: protectedProcedure.input(z7.object({ locationId: z7.number().int().positive() })).query(async ({ input }) => {
    const { data, error } = await getSupabaseAdmin().from("rooms").select("id, name, capacity, is_active").eq("location_id", input.locationId).order("name");
    if (error) throw new TRPCError8({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      capacity: row.capacity ?? 1,
      isActive: row.is_active !== false
    }));
  }),
  createRoom: protectedProcedure.input(
    z7.object({
      locationId: z7.number().int().positive(),
      organizationId: z7.number().int().positive(),
      name: z7.string().min(1, "Nome da sala \xE9 obrigat\xF3rio")
      // REQ-05-013
    })
  ).mutation(async ({ ctx, input }) => {
    const { data, error } = await getSupabaseAdmin().from("rooms").insert({ location_id: input.locationId, name: input.name }).select("id, name").single();
    if (error) throw new TRPCError8({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "CREATE",
      entity: "room",
      entityId: data.id,
      newValues: { name: input.name, locationId: input.locationId },
      request: ctx.req
    });
    return data;
  }),
  deleteRoom: protectedProcedure.input(z7.object({ id: z7.number().int().positive(), organizationId: z7.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { error } = await getSupabaseAdmin().from("rooms").update({ is_active: false }).eq("id", input.id);
    if (error) throw new TRPCError8({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "DELETE",
      entity: "room",
      entityId: input.id,
      newValues: { isActive: false },
      request: ctx.req
    });
    return { success: true };
  }),
  /* --------------------- Campos obrigatórios (pacientes) ----------------- */
  /** REQ-05-015: leitura da configuração; Nome sempre obrigatório (REQ-05-019). */
  getRequiredPatientFields: protectedProcedure.input(z7.object({ organizationId: z7.number().int().positive() })).query(async ({ input }) => {
    try {
      return await getRequiredPatientFields(input.organizationId);
    } catch (error) {
      throw new TRPCError8({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Falha ao ler configura\xE7\xE3o"
      });
    }
  }),
  /** REQ-05-018: salvamento imediato ao marcar/desmarcar. */
  setRequiredPatientField: protectedProcedure.input(
    z7.object({
      organizationId: z7.number().int().positive(),
      field: z7.string().min(2),
      required: z7.boolean()
    })
  ).mutation(async ({ ctx, input }) => {
    if (ALWAYS_REQUIRED_FIELDS.includes(input.field) && !input.required) {
      throw new TRPCError8({ code: "BAD_REQUEST", message: "O campo Nome n\xE3o pode ser desabilitado" });
    }
    const current = await getSupabaseAdmin().from("org_settings").select("required_patient_fields").eq("organization_id", input.organizationId).maybeSingle();
    if (current.error) throw new TRPCError8({ code: "INTERNAL_SERVER_ERROR", message: current.error.message });
    const stored = current.data?.required_patient_fields ?? {};
    stored[input.field] = input.required;
    const { error } = await getSupabaseAdmin().from("org_settings").upsert(
      { organization_id: input.organizationId, required_patient_fields: stored },
      { onConflict: "organization_id" }
    );
    if (error) throw new TRPCError8({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "UPDATE",
      entity: "org_settings",
      entityId: input.organizationId,
      newValues: { field: input.field, required: input.required },
      request: ctx.req
    });
    return { success: true };
  })
});

// server/controllers/health-plan.controller.ts
import { z as z8 } from "zod";
import { TRPCError as TRPCError9 } from "@trpc/server";

// server/models/health-plan.model.ts
init_supabase_server();
var HEALTH_PLAN_COLUMNS = "id, organization_id, operator_name, ans_code, tiss_xml_version, contact_email, contact_phone, notes, is_active, created_at, updated_at";
function toHealthPlan(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    operatorName: row.operator_name,
    ansCode: row.ans_code,
    tissXmlVersion: row.tiss_xml_version,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    notes: row.notes,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function fail7(context, error) {
  console.error(`[HealthPlanModel] ${context}:`, error?.message);
  throw new Error(`Falha ao ${context} conv\xEAnio`);
}
var healthPlanModel = {
  async create(data) {
    const { data: row, error } = await getSupabaseAdmin().from("health_plans").insert({
      organization_id: data.organizationId,
      operator_name: data.operatorName,
      ans_code: data.ansCode ?? null,
      tiss_xml_version: data.tissXmlVersion ?? null,
      contact_email: data.contactEmail ?? null,
      contact_phone: data.contactPhone ?? null,
      notes: data.notes ?? null,
      is_active: data.isActive ?? true
    }).select(HEALTH_PLAN_COLUMNS).single();
    if (error) fail7("criar", error);
    return toHealthPlan(row);
  },
  async findById(id, organizationId) {
    const { data: row, error } = await getSupabaseAdmin().from("health_plans").select(HEALTH_PLAN_COLUMNS).eq("id", id).eq("organization_id", organizationId).maybeSingle();
    if (error) fail7("consultar", error);
    return row ? toHealthPlan(row) : null;
  },
  async findMany(filter) {
    let query = getSupabaseAdmin().from("health_plans").select(HEALTH_PLAN_COLUMNS).eq("organization_id", filter.organizationId).order("operator_name", { ascending: true });
    if (filter.isActive !== void 0) query = query.eq("is_active", filter.isActive);
    if (filter.search) {
      query = query.ilike("operator_name", `%${filter.search}%`);
    }
    const { data, error } = await query.range(
      filter.offset ?? 0,
      (filter.offset ?? 0) + (filter.limit ?? 50) - 1
    );
    if (error) fail7("listar", error);
    return (data ?? []).map(toHealthPlan);
  },
  async update(id, organizationId, data) {
    const patch = {};
    if (data.operatorName !== void 0) patch.operator_name = data.operatorName;
    if (data.ansCode !== void 0) patch.ans_code = data.ansCode;
    if (data.tissXmlVersion !== void 0) patch.tiss_xml_version = data.tissXmlVersion;
    if (data.contactEmail !== void 0) patch.contact_email = data.contactEmail;
    if (data.contactPhone !== void 0) patch.contact_phone = data.contactPhone;
    if (data.notes !== void 0) patch.notes = data.notes;
    if (data.isActive !== void 0) patch.is_active = data.isActive;
    if (Object.keys(patch).length === 0) return this.findById(id, organizationId);
    const { data: row, error } = await getSupabaseAdmin().from("health_plans").update(patch).eq("id", id).eq("organization_id", organizationId).select(HEALTH_PLAN_COLUMNS).maybeSingle();
    if (error) fail7("atualizar", error);
    return row ? toHealthPlan(row) : null;
  },
  /** Soft delete (REQ-05-004): mantém histórico e integridade referencial. */
  async softDelete(id, organizationId) {
    const { data: row, error } = await getSupabaseAdmin().from("health_plans").update({ is_active: false }).eq("id", id).eq("organization_id", organizationId).select(HEALTH_PLAN_COLUMNS).maybeSingle();
    if (error) fail7("inativar", error);
    return row ? toHealthPlan(row) : null;
  }
};

// server/controllers/health-plan.controller.ts
var createHealthPlanSchema = z8.object({
  organizationId: z8.number().int().positive(),
  operatorName: z8.string().min(2, "Nome da operadora \xE9 obrigat\xF3rio"),
  ansCode: z8.string().max(20).optional(),
  tissXmlVersion: z8.string().max(20).optional(),
  contactEmail: z8.string().email().optional(),
  contactPhone: z8.string().max(20).optional(),
  notes: z8.string().optional()
});
var updateHealthPlanSchema = z8.object({
  id: z8.number().int().positive(),
  organizationId: z8.number().int().positive(),
  operatorName: z8.string().min(2).optional(),
  ansCode: z8.string().max(20).optional(),
  tissXmlVersion: z8.string().max(20).optional(),
  contactEmail: z8.string().email().optional(),
  contactPhone: z8.string().max(20).optional(),
  notes: z8.string().optional(),
  isActive: z8.boolean().optional()
});
var healthPlanRouter = router({
  list: protectedProcedure.input(
    z8.object({
      organizationId: z8.number().int().positive(),
      search: z8.string().optional(),
      isActive: z8.boolean().optional(),
      limit: z8.number().int().min(1).max(200).default(100),
      offset: z8.number().int().min(0).default(0)
    })
  ).query(({ input }) => healthPlanModel.findMany(input)),
  getById: protectedProcedure.input(z8.object({ id: z8.number().int(), organizationId: z8.number().int() })).query(async ({ input }) => {
    const plan = await healthPlanModel.findById(input.id, input.organizationId);
    if (!plan) {
      throw new TRPCError9({ code: "NOT_FOUND", message: "Conv\xEAnio n\xE3o encontrado" });
    }
    return plan;
  }),
  create: protectedProcedure.input(createHealthPlanSchema).mutation(async ({ ctx, input }) => {
    const createInput = { ...input };
    const plan = await healthPlanModel.create(createInput);
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "CREATE",
      entity: "health_plan",
      entityId: plan.id,
      newValues: { operatorName: plan.operatorName, ansCode: plan.ansCode },
      request: ctx.req
    });
    return plan;
  }),
  update: protectedProcedure.input(updateHealthPlanSchema).mutation(async ({ ctx, input }) => {
    const { id, organizationId, ...data } = input;
    const existing = await healthPlanModel.findById(id, organizationId);
    if (!existing) {
      throw new TRPCError9({ code: "NOT_FOUND", message: "Conv\xEAnio n\xE3o encontrado" });
    }
    const plan = await healthPlanModel.update(id, organizationId, { id, ...data });
    await writeAuditLog({
      organizationId,
      userId: ctx.user.id,
      action: "UPDATE",
      entity: "health_plan",
      entityId: id,
      oldValues: { operatorName: existing.operatorName, isActive: existing.isActive },
      newValues: data,
      request: ctx.req
    });
    return plan;
  }),
  /** REQ-05-004: exclusão como soft delete (is_active = false). */
  delete: protectedProcedure.input(z8.object({ id: z8.number().int(), organizationId: z8.number().int() })).mutation(async ({ ctx, input }) => {
    const plan = await healthPlanModel.softDelete(input.id, input.organizationId);
    if (!plan) {
      throw new TRPCError9({ code: "NOT_FOUND", message: "Conv\xEAnio n\xE3o encontrado" });
    }
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "DELETE",
      entity: "health_plan",
      entityId: input.id,
      newValues: { isActive: false },
      request: ctx.req
    });
    return { success: true };
  })
});

// server/controllers/revenue.controller.ts
import { z as z9 } from "zod";
import { TRPCError as TRPCError10 } from "@trpc/server";

// server/models/revenue.model.ts
init_supabase_server();
var LEGACY_REVENUE_COLUMNS = "id, organization_id, patient_id, payer_name, procedure_id, appointment_id, health_plan_id, payment_method_id, installment_no, installments_total, amount, status, due_date, received_at, description, attachment_url, sent_to_omie, sent_to_conta_azul, created_by, created_at, updated_at";
var LINKED_REVENUE_COLUMNS = "id, organization_id, patient_id, payer_name, procedure_id, appointment_id, health_plan_id, payment_method_id, professional_id, location_id, installment_no, installments_total, amount, status, due_date, received_at, description, attachment_url, sent_to_omie, sent_to_conta_azul, created_by, created_at, updated_at";
function revenueColumns(hasLinks) {
  return hasLinks ? LINKED_REVENUE_COLUMNS : LEGACY_REVENUE_COLUMNS;
}
function toRevenue(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    patientId: row.patient_id,
    payerName: row.payer_name,
    procedureId: row.procedure_id,
    appointmentId: row.appointment_id,
    healthPlanId: row.health_plan_id,
    paymentMethodId: row.payment_method_id,
    professionalId: row.professional_id ?? null,
    locationId: row.location_id ?? null,
    installmentNo: row.installment_no ?? 1,
    installmentsTotal: row.installments_total ?? 1,
    amount: Number(row.amount),
    status: row.status ?? "a_receber",
    dueDate: row.due_date,
    receivedAt: row.received_at,
    description: row.description,
    attachmentUrl: row.attachment_url,
    sentToOmie: row.sent_to_omie ?? false,
    sentToContaAzul: row.sent_to_conta_azul ?? false,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function fail8(context, error) {
  console.error(`[RevenueModel] ${context}:`, error?.message);
  throw new Error(`Falha ao ${context} receita`);
}
function assertRangeWithin90Days(from, to) {
  if (!from || !to) return;
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error("Per\xEDodo inv\xE1lido");
  }
  if (end - start > 90 * 24 * 60 * 60 * 1e3) {
    throw new Error("O intervalo de pesquisa n\xE3o pode ultrapassar 90 dias");
  }
}
var revenueModel = {
  async create(data) {
    const caps = await getSchemaCapabilities();
    const wantsLinks = data.professionalId !== void 0 || data.locationId !== void 0;
    if (wantsLinks && !caps.revenueLinks) throw new Error(MIGRATION_0003_FIELDS_HINT);
    const payload = {
      organization_id: data.organizationId,
      patient_id: data.patientId ?? null,
      payer_name: data.payerName ?? null,
      procedure_id: data.procedureId ?? null,
      appointment_id: data.appointmentId ?? null,
      health_plan_id: data.healthPlanId ?? null,
      payment_method_id: data.paymentMethodId ?? null,
      installment_no: data.installmentNo ?? 1,
      installments_total: data.installmentsTotal ?? 1,
      amount: data.amount,
      status: data.status ?? "a_receber",
      due_date: data.dueDate ?? null,
      // Se a receita já nasce RECEBIDA, `received_at` precisa existir: o
      // Repasse e o Extrato filtram por essa data.
      received_at: data.receivedAt ?? (data.status === "recebido" ? (/* @__PURE__ */ new Date()).toISOString() : null),
      description: data.description ?? null,
      attachment_url: data.attachmentUrl ?? null,
      created_by: data.createdBy ?? null
    };
    if (caps.revenueLinks) {
      payload.professional_id = data.professionalId ?? null;
      payload.location_id = data.locationId ?? null;
    }
    const { data: row, error } = await getSupabaseAdmin().from("revenues").insert(payload).select(revenueColumns(caps.revenueLinks)).single();
    if (error) fail8("criar", error);
    return toRevenue(row);
  },
  async findById(id, organizationId) {
    const caps = await getSchemaCapabilities();
    const { data: row, error } = await getSupabaseAdmin().from("revenues").select(revenueColumns(caps.revenueLinks)).eq("id", id).eq("organization_id", organizationId).maybeSingle();
    if (error) fail8("consultar", error);
    return row ? toRevenue(row) : null;
  },
  async findMany(filter) {
    assertRangeWithin90Days(filter.from, filter.to);
    const caps = await getSchemaCapabilities();
    const wantsLinkFilters = filter.professionalId !== void 0 || filter.locationId !== void 0;
    if (wantsLinkFilters && !caps.revenueLinks) throw new Error(MIGRATION_0003_FIELDS_HINT);
    let query = getSupabaseAdmin().from("revenues").select(revenueColumns(caps.revenueLinks)).eq("organization_id", filter.organizationId).order("created_at", { ascending: false });
    if (filter.patientId) query = query.eq("patient_id", filter.patientId);
    if (filter.professionalId && caps.revenueLinks) {
      query = query.eq("professional_id", filter.professionalId);
    }
    if (filter.locationId && caps.revenueLinks) {
      query = query.eq("location_id", filter.locationId);
    }
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.from) query = query.gte("created_at", filter.from);
    if (filter.to) query = query.lte("created_at", filter.to);
    const { data, error } = await query.range(
      filter.offset ?? 0,
      (filter.offset ?? 0) + (filter.limit ?? 50) - 1
    );
    if (error) fail8("listar", error);
    return (data ?? []).map(toRevenue);
  },
  /** Resumo separado de recebidos e a receber (Cap. 15.1). */
  async summarize(filter) {
    assertRangeWithin90Days(filter.from, filter.to);
    let query = getSupabaseAdmin().from("revenues").select("amount, status").eq("organization_id", filter.organizationId);
    if (filter.patientId) query = query.eq("patient_id", filter.patientId);
    if (filter.from) query = query.gte("created_at", filter.from);
    if (filter.to) query = query.lte("created_at", filter.to);
    const { data, error } = await query;
    if (error) fail8("resumir", error);
    const summary = { receivedTotal: 0, toReceiveTotal: 0 };
    for (const row of data ?? []) {
      const amount = Number(row.amount);
      const status = row.status;
      if (status === "recebido") summary.receivedTotal += amount;
      if (status === "a_receber") summary.toReceiveTotal += amount;
    }
    return summary;
  },
  async update(id, organizationId, data) {
    const caps = await getSchemaCapabilities();
    const patch = {};
    if (data.amount !== void 0) patch.amount = data.amount;
    if (data.status !== void 0) patch.status = data.status;
    if (data.payerName !== void 0) patch.payer_name = data.payerName;
    if (data.dueDate !== void 0) patch.due_date = data.dueDate;
    if (data.receivedAt !== void 0) patch.received_at = data.receivedAt;
    if (data.description !== void 0) patch.description = data.description;
    if (data.attachmentUrl !== void 0) patch.attachment_url = data.attachmentUrl;
    if (data.paymentMethodId !== void 0) patch.payment_method_id = data.paymentMethodId;
    if (data.professionalId !== void 0 || data.locationId !== void 0) {
      if (!caps.revenueLinks) throw new Error(MIGRATION_0003_FIELDS_HINT);
      if (data.professionalId !== void 0) patch.professional_id = data.professionalId;
      if (data.locationId !== void 0) patch.location_id = data.locationId;
    }
    if (data.installmentNo !== void 0) patch.installment_no = data.installmentNo;
    if (data.installmentsTotal !== void 0) patch.installments_total = data.installmentsTotal;
    if (data.status === "recebido" && data.receivedAt === void 0) {
      patch.received_at = (/* @__PURE__ */ new Date()).toISOString();
    }
    if (Object.keys(patch).length === 0) return this.findById(id, organizationId);
    const { data: row, error } = await getSupabaseAdmin().from("revenues").update(patch).eq("id", id).eq("organization_id", organizationId).select(revenueColumns(caps.revenueLinks)).maybeSingle();
    if (error) fail8("atualizar", error);
    return row ? toRevenue(row) : null;
  },
  /**
   * Cancelamento com motivo (Cap. 15.1.1):
   * permitido somente quando status = "a_receber"; a desativação é registrada
   * no histórico da própria receita pelo controller.
   */
  async cancel(id, organizationId, userId, reason) {
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;
    if (existing.status !== "a_receber") {
      throw new Error("Somente receitas com status A RECEBER podem ser canceladas");
    }
    const caps = await getSchemaCapabilities();
    const { data: row, error } = await getSupabaseAdmin().from("revenues").update({ status: "cancelado" }).eq("id", id).eq("organization_id", organizationId).select(revenueColumns(caps.revenueLinks)).maybeSingle();
    if (error) fail8("cancelar", error);
    await this.addHistory(id, userId, "CANCEL", { status: "cancelado" }, reason);
    return row ? toRevenue(row) : null;
  },
  /** Histórico de edições/alterações da receita (Cap. 15.1.1). */
  async addHistory(revenueId, userId, action, changes, reason) {
    await getSupabaseAdmin().from("revenue_history").insert({
      revenue_id: revenueId,
      changed_by: userId,
      action,
      changes,
      reason: reason ?? null
    });
  },
  async listHistory(revenueId) {
    const { data, error } = await getSupabaseAdmin().from("revenue_history").select("id, action, reason, created_at").eq("revenue_id", revenueId).order("created_at", { ascending: false });
    if (error) fail8("listar hist\xF3rico", error);
    return (data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      reason: row.reason ?? null,
      createdAt: row.created_at ?? null
    }));
  }
};

// server/controllers/revenue.controller.ts
init_supabase_server();
var revenueStatusSchema = z9.enum([
  "a_receber",
  "recebido",
  "cancelado",
  "desconto",
  "cortesia"
]);
var createRevenueSchema = z9.object({
  organizationId: z9.number().int().positive(),
  patientId: z9.number().int().positive().optional(),
  payerName: z9.string().max(255).optional(),
  procedureId: z9.number().int().positive().optional(),
  appointmentId: z9.number().int().positive().optional(),
  healthPlanId: z9.number().int().positive().optional(),
  paymentMethodId: z9.number().int().positive().optional(),
  professionalId: z9.number().int().positive().optional(),
  locationId: z9.number().int().positive().optional(),
  installmentNo: z9.number().int().min(1).max(48).default(1),
  installmentsTotal: z9.number().int().min(1).max(48).default(1),
  amount: z9.number().min(0, "Valor n\xE3o pode ser negativo"),
  status: revenueStatusSchema.default("a_receber"),
  dueDate: z9.string().optional(),
  receivedAt: z9.string().optional(),
  description: z9.string().optional()
});
var updateRevenueSchema = z9.object({
  id: z9.number().int().positive(),
  organizationId: z9.number().int().positive(),
  amount: z9.number().min(0).optional(),
  status: revenueStatusSchema.optional(),
  payerName: z9.string().max(255).optional(),
  dueDate: z9.string().optional(),
  receivedAt: z9.string().optional(),
  description: z9.string().optional(),
  professionalId: z9.number().int().positive().optional(),
  locationId: z9.number().int().positive().optional()
});
var revenueFilterSchema = z9.object({
  organizationId: z9.number().int().positive(),
  patientId: z9.number().int().positive().optional(),
  professionalId: z9.number().int().positive().optional(),
  locationId: z9.number().int().positive().optional(),
  status: revenueStatusSchema.optional(),
  from: z9.string().optional(),
  to: z9.string().optional(),
  limit: z9.number().int().min(1).max(200).default(50),
  offset: z9.number().int().min(0).default(0)
});
var revenueRouter = router({
  /** Formas de recebimento ativas para seleção (REQ-08-036). */
  paymentMethods: protectedProcedure.input(z9.object({ organizationId: z9.number().int().positive() })).query(async ({ input }) => {
    const { data, error } = await getSupabaseAdmin().from("payment_methods").select("id, name, type, allows_installments").eq("organization_id", input.organizationId).eq("is_active", true).order("name");
    if (error) {
      throw new TRPCError10({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      allowsInstallments: row.allows_installments === true
    }));
  }),
  list: protectedProcedure.input(revenueFilterSchema).query(({ input }) => revenueModel.findMany(input)),
  /** Resumo de valores recebidos e a receber (Cap. 15.1). */
  summary: protectedProcedure.input(
    revenueFilterSchema.omit({ limit: true, offset: true, status: true })
  ).query(({ input }) => revenueModel.summarize(input)),
  getById: protectedProcedure.input(z9.object({ id: z9.number().int(), organizationId: z9.number().int() })).query(async ({ input }) => {
    const revenue = await revenueModel.findById(input.id, input.organizationId);
    if (!revenue) {
      throw new TRPCError10({ code: "NOT_FOUND", message: "Receita n\xE3o encontrada" });
    }
    return revenue;
  }),
  history: protectedProcedure.input(z9.object({ id: z9.number().int(), organizationId: z9.number().int() })).query(async ({ input }) => {
    const revenue = await revenueModel.findById(input.id, input.organizationId);
    if (!revenue) {
      throw new TRPCError10({ code: "NOT_FOUND", message: "Receita n\xE3o encontrada" });
    }
    return revenueModel.listHistory(input.id);
  }),
  create: protectedProcedure.input(createRevenueSchema).mutation(async ({ ctx, input }) => {
    if (input.installmentsTotal > 1 && input.installmentNo > input.installmentsTotal) {
      throw new TRPCError10({
        code: "BAD_REQUEST",
        message: "N\xFAmero da parcela maior que o total de parcelas"
      });
    }
    const createInput = { ...input, createdBy: ctx.user.id };
    const revenue = await revenueModel.create(createInput);
    await revenueModel.addHistory(
      revenue.id,
      ctx.user.id,
      "CREATE",
      { amount: revenue.amount, status: revenue.status }
    );
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "CREATE",
      entity: "revenue",
      entityId: revenue.id,
      newValues: { amount: revenue.amount, status: revenue.status },
      request: ctx.req
    });
    return revenue;
  }),
  update: protectedProcedure.input(updateRevenueSchema).mutation(async ({ ctx, input }) => {
    const { id, organizationId, ...data } = input;
    const existing = await revenueModel.findById(id, organizationId);
    if (!existing) {
      throw new TRPCError10({ code: "NOT_FOUND", message: "Receita n\xE3o encontrada" });
    }
    if (existing.status === "cancelado") {
      throw new TRPCError10({
        code: "BAD_REQUEST",
        message: "Receita cancelada n\xE3o pode ser editada"
      });
    }
    const revenue = await revenueModel.update(id, organizationId, { id, ...data });
    await revenueModel.addHistory(id, ctx.user.id, "UPDATE", data);
    await writeAuditLog({
      organizationId,
      userId: ctx.user.id,
      action: "UPDATE",
      entity: "revenue",
      entityId: id,
      oldValues: { status: existing.status, amount: existing.amount },
      newValues: data,
      request: ctx.req
    });
    return revenue;
  }),
  /**
   * Cancelamento apenas para status A RECEBER, com motivo obrigatório
   * registrado no histórico (Cap. 15.1.1).
   */
  cancel: protectedProcedure.input(
    z9.object({
      id: z9.number().int().positive(),
      organizationId: z9.number().int().positive(),
      reason: z9.string().min(3, "Motivo do cancelamento \xE9 obrigat\xF3rio")
    })
  ).mutation(async ({ ctx, input }) => {
    const revenue = await revenueModel.cancel(
      input.id,
      input.organizationId,
      ctx.user.id,
      input.reason
    );
    if (!revenue) {
      throw new TRPCError10({ code: "NOT_FOUND", message: "Receita n\xE3o encontrada" });
    }
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "CANCEL",
      entity: "revenue",
      entityId: input.id,
      newValues: { status: "cancelado", reason: input.reason },
      request: ctx.req
    });
    return revenue;
  })
});

// server/controllers/sale.controller.ts
import { z as z10 } from "zod";
import { TRPCError as TRPCError11 } from "@trpc/server";

// server/models/sale.model.ts
init_supabase_server();
var SALE_COLUMNS = "id, organization_id, patient_id, payer_name, health_plan_id, payment_method_id, location_id, professional_id, installment_no, installments_total, amount, status, issued_at, received_at, description, attachment_url, created_by, created_at, updated_at";
var SALE_ITEM_COLUMNS = "id, procedure_id, professional_id, description, quantity, unit_amount, amount";
function toItem(row) {
  const quantity = Number(row.quantity ?? 1);
  const unitAmount = Number(row.unit_amount ?? 0);
  return {
    id: row.id,
    procedureId: row.procedure_id,
    professionalId: row.professional_id,
    description: row.description,
    quantity,
    unitAmount,
    amount: Number(row.amount ?? quantity * unitAmount)
  };
}
function toSale(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    patientId: row.patient_id,
    payerName: row.payer_name,
    healthPlanId: row.health_plan_id,
    paymentMethodId: row.payment_method_id,
    locationId: row.location_id,
    professionalId: row.professional_id,
    installmentNo: row.installment_no ?? 1,
    installmentsTotal: row.installments_total ?? 1,
    amount: Number(row.amount),
    status: row.status ?? "a_receber",
    issuedAt: row.issued_at,
    receivedAt: row.received_at,
    description: row.description,
    attachmentUrl: row.attachment_url,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: (row.sale_items ?? []).map(toItem)
  };
}
function fail9(context, error) {
  console.error(`[SaleModel] ${context}:`, error?.message);
  throw new Error(`Falha ao ${context} venda`);
}
function itemRows(saleId, items) {
  return items.map((item) => ({
    sale_id: saleId,
    procedure_id: item.procedureId ?? null,
    professional_id: item.professionalId ?? null,
    description: item.description ?? null,
    quantity: item.quantity,
    unit_amount: item.unitAmount,
    amount: Number((item.quantity * item.unitAmount).toFixed(2))
  }));
}
var saleModel = financeGuarded({
  async create(data) {
    const { data: row, error } = await getSupabaseAdmin().from("sales").insert({
      organization_id: data.organizationId,
      patient_id: data.patientId ?? null,
      payer_name: data.payerName ?? null,
      health_plan_id: data.healthPlanId ?? null,
      payment_method_id: data.paymentMethodId ?? null,
      location_id: data.locationId ?? null,
      professional_id: data.professionalId ?? null,
      installment_no: data.installmentNo ?? 1,
      installments_total: data.installmentsTotal ?? 1,
      amount: data.amount,
      status: data.status ?? "a_receber",
      issued_at: data.issuedAt ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      received_at: data.receivedAt ?? null,
      description: data.description ?? null,
      attachment_url: data.attachmentUrl ?? null,
      created_by: data.createdBy ?? null
    }).select(SALE_COLUMNS).single();
    if (error || !row) fail9("criar", error);
    let items = [];
    if (data.items && data.items.length > 0) {
      const { data: itemData, error: itemError } = await getSupabaseAdmin().from("sale_items").insert(itemRows(row.id, data.items)).select(SALE_ITEM_COLUMNS);
      if (itemError) fail9("criar itens da", itemError);
      items = (itemData ?? []).map((item) => toItem(item));
    }
    return { ...toSale(row), items };
  },
  async findById(id, organizationId) {
    const { data: row, error } = await getSupabaseAdmin().from("sales").select(`${SALE_COLUMNS}, sale_items(${SALE_ITEM_COLUMNS})`).eq("id", id).eq("organization_id", organizationId).maybeSingle();
    if (error) fail9("consultar", error);
    return row ? toSale(row) : null;
  },
  async findMany(filter) {
    let query = getSupabaseAdmin().from("sales").select(`${SALE_COLUMNS}, sale_items(${SALE_ITEM_COLUMNS})`).eq("organization_id", filter.organizationId).order("issued_at", { ascending: false });
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.professionalId) query = query.eq("professional_id", filter.professionalId);
    if (filter.healthPlanId) query = query.eq("health_plan_id", filter.healthPlanId);
    if (filter.paymentMethodId) query = query.eq("payment_method_id", filter.paymentMethodId);
    if (filter.locationId) query = query.eq("location_id", filter.locationId);
    if (filter.from) query = query.gte("issued_at", filter.from);
    if (filter.to) query = query.lte("issued_at", filter.to);
    if (filter.search) {
      const term = filter.search.replace(/[%,()]/g, "").trim();
      if (term) {
        query = query.or(`payer_name.ilike.%${term}%,description.ilike.%${term}%`);
      }
    }
    if (filter.procedureId) {
      const { data: itemRowsData, error: itemError } = await getSupabaseAdmin().from("sale_items").select("sale_id").eq("procedure_id", filter.procedureId);
      if (itemError) fail9("filtrar por procedimento", itemError);
      const ids = Array.from(
        new Set((itemRowsData ?? []).map((item) => item.sale_id))
      );
      if (ids.length === 0) return [];
      query = query.in("id", ids);
    }
    const { data, error } = await query.range(
      filter.offset ?? 0,
      (filter.offset ?? 0) + (filter.limit ?? 100) - 1
    );
    if (error) fail9("listar", error);
    return (data ?? []).map((row) => toSale(row));
  },
  /** Totais da tela; vendas canceladas ficam fora de todos os totais (Cap. 15.1.2). */
  async summarize(filter) {
    const rows = await this.findMany({ ...filter, limit: 1e3, offset: 0, status: void 0 });
    const summary = {
      toReceiveTotal: 0,
      receivedTotal: 0,
      generalTotal: 0
    };
    for (const sale of rows) {
      if (sale.status === "a_receber") summary.toReceiveTotal += sale.amount;
      if (sale.status === "recebido") summary.receivedTotal += sale.amount;
    }
    summary.generalTotal = summary.toReceiveTotal + summary.receivedTotal;
    return summary;
  },
  async update(id, organizationId, data) {
    const patch = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    if (data.amount !== void 0) patch.amount = data.amount;
    if (data.status !== void 0) patch.status = data.status;
    if (data.payerName !== void 0) patch.payer_name = data.payerName;
    if (data.patientId !== void 0) patch.patient_id = data.patientId;
    if (data.healthPlanId !== void 0) patch.health_plan_id = data.healthPlanId;
    if (data.paymentMethodId !== void 0) patch.payment_method_id = data.paymentMethodId;
    if (data.locationId !== void 0) patch.location_id = data.locationId;
    if (data.professionalId !== void 0) patch.professional_id = data.professionalId;
    if (data.installmentNo !== void 0) patch.installment_no = data.installmentNo;
    if (data.installmentsTotal !== void 0) patch.installments_total = data.installmentsTotal;
    if (data.issuedAt !== void 0) patch.issued_at = data.issuedAt;
    if (data.receivedAt !== void 0) patch.received_at = data.receivedAt;
    if (data.description !== void 0) patch.description = data.description;
    if (data.attachmentUrl !== void 0) patch.attachment_url = data.attachmentUrl;
    if (data.status === "recebido" && data.receivedAt === void 0) {
      patch.received_at = (/* @__PURE__ */ new Date()).toISOString();
    }
    const { error } = await getSupabaseAdmin().from("sales").update(patch).eq("id", id).eq("organization_id", organizationId);
    if (error) fail9("atualizar", error);
    if (data.items) {
      const { error: deleteError } = await getSupabaseAdmin().from("sale_items").delete().eq("sale_id", id);
      if (deleteError) fail9("substituir itens da", deleteError);
      if (data.items.length > 0) {
        const { error: insertError } = await getSupabaseAdmin().from("sale_items").insert(itemRows(id, data.items));
        if (insertError) fail9("atualizar itens da", insertError);
      }
    }
    return this.findById(id, organizationId);
  },
  async cancel(id, organizationId, userId, reason) {
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;
    if (existing.status === "cancelada") {
      throw new Error("Venda j\xE1 est\xE1 cancelada");
    }
    const { error } = await getSupabaseAdmin().from("sales").update({ status: "cancelada", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("organization_id", organizationId);
    if (error) fail9("cancelar", error);
    await this.addHistory(id, userId, "CANCEL", { status: "cancelada" }, reason);
    return this.findById(id, organizationId);
  },
  async addHistory(saleId, userId, action, changes, reason) {
    const { error } = await getSupabaseAdmin().from("sale_history").insert({
      sale_id: saleId,
      changed_by: userId,
      action,
      changes,
      reason: reason ?? null
    });
    if (error) console.error("[SaleModel] hist\xF3rico:", error.message);
  },
  async listHistory(saleId) {
    const { data, error } = await getSupabaseAdmin().from("sale_history").select("id, action, reason, created_at").eq("sale_id", saleId).order("created_at", { ascending: false });
    if (error) fail9("listar hist\xF3rico", error);
    return (data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      reason: row.reason ?? null,
      createdAt: row.created_at ?? null
    }));
  }
});

// server/controllers/sale.controller.ts
var saleStatusSchema = z10.enum(["a_receber", "recebido", "cancelada"]);
var saleItemSchema = z10.object({
  procedureId: z10.number().int().positive().optional(),
  professionalId: z10.number().int().positive().optional(),
  description: z10.string().max(255).optional(),
  quantity: z10.number().positive().default(1),
  unitAmount: z10.number().min(0)
});
var createSaleSchema = z10.object({
  organizationId: z10.number().int().positive(),
  patientId: z10.number().int().positive().optional(),
  payerName: z10.string().max(255).optional(),
  healthPlanId: z10.number().int().positive().optional(),
  paymentMethodId: z10.number().int().positive().optional(),
  locationId: z10.number().int().positive().optional(),
  professionalId: z10.number().int().positive().optional(),
  installmentNo: z10.number().int().min(1).max(48).default(1),
  installmentsTotal: z10.number().int().min(1).max(48).default(1),
  amount: z10.number().min(0),
  status: saleStatusSchema.default("a_receber"),
  issuedAt: z10.string().optional(),
  receivedAt: z10.string().optional(),
  description: z10.string().optional(),
  attachmentUrl: z10.string().url().optional().or(z10.literal("")),
  items: z10.array(saleItemSchema).max(50).optional()
});
var updateSaleSchema = createSaleSchema.omit({ organizationId: true }).partial().extend({ id: z10.number().int().positive(), organizationId: z10.number().int().positive() });
var saleFilterSchema = z10.object({
  organizationId: z10.number().int().positive(),
  status: saleStatusSchema.optional(),
  professionalId: z10.number().int().positive().optional(),
  healthPlanId: z10.number().int().positive().optional(),
  paymentMethodId: z10.number().int().positive().optional(),
  locationId: z10.number().int().positive().optional(),
  procedureId: z10.number().int().positive().optional(),
  from: z10.string().optional(),
  to: z10.string().optional(),
  search: z10.string().optional(),
  limit: z10.number().int().min(1).max(500).default(100),
  offset: z10.number().int().min(0).default(0)
});
function totalOf(items, fallback) {
  if (!items || items.length === 0) return fallback;
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0);
  return Number(total.toFixed(2));
}
var saleRouter = router({
  list: protectedProcedure.input(saleFilterSchema).query(({ input }) => saleModel.findMany(input)),
  summary: protectedProcedure.input(saleFilterSchema.omit({ limit: true, offset: true, status: true })).query(({ input }) => saleModel.summarize(input)),
  getById: protectedProcedure.input(z10.object({ id: z10.number().int(), organizationId: z10.number().int() })).query(async ({ input }) => {
    const sale = await saleModel.findById(input.id, input.organizationId);
    if (!sale) throw new TRPCError11({ code: "NOT_FOUND", message: "Venda n\xE3o encontrada" });
    return sale;
  }),
  history: protectedProcedure.input(z10.object({ id: z10.number().int(), organizationId: z10.number().int() })).query(async ({ input }) => {
    const sale = await saleModel.findById(input.id, input.organizationId);
    if (!sale) throw new TRPCError11({ code: "NOT_FOUND", message: "Venda n\xE3o encontrada" });
    return saleModel.listHistory(input.id);
  }),
  create: protectedWith("finance.write").input(createSaleSchema).mutation(async ({ ctx, input }) => {
    const amount = totalOf(input.items, input.amount);
    const createInput = {
      ...input,
      amount,
      attachmentUrl: input.attachmentUrl || void 0,
      createdBy: ctx.user.id,
      status: input.status
    };
    const sale = await saleModel.create(createInput);
    await saleModel.addHistory(sale.id, ctx.user.id, "CREATE", {
      amount: sale.amount,
      status: sale.status
    });
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "CREATE",
      entity: "sale",
      entityId: sale.id,
      newValues: { amount: sale.amount, status: sale.status },
      request: ctx.req
    });
    return sale;
  }),
  update: protectedWith("finance.write").input(updateSaleSchema).mutation(async ({ ctx, input }) => {
    const { id, organizationId, ...data } = input;
    const existing = await saleModel.findById(id, organizationId);
    if (!existing) throw new TRPCError11({ code: "NOT_FOUND", message: "Venda n\xE3o encontrada" });
    if (existing.status === "cancelada") {
      throw new TRPCError11({ code: "BAD_REQUEST", message: "Venda cancelada n\xE3o pode ser editada" });
    }
    const sale = await saleModel.update(id, organizationId, {
      id,
      ...data,
      amount: data.items ? totalOf(data.items, data.amount ?? existing.amount) : data.amount,
      attachmentUrl: data.attachmentUrl || void 0
    });
    await saleModel.addHistory(id, ctx.user.id, "UPDATE", data);
    await writeAuditLog({
      organizationId,
      userId: ctx.user.id,
      action: "UPDATE",
      entity: "sale",
      entityId: id,
      oldValues: { amount: existing.amount, status: existing.status },
      newValues: data,
      request: ctx.req
    });
    return sale;
  }),
  cancel: protectedWith("finance.write").input(
    z10.object({
      id: z10.number().int().positive(),
      organizationId: z10.number().int().positive(),
      reason: z10.string().min(3, "Motivo do cancelamento \xE9 obrigat\xF3rio")
    })
  ).mutation(async ({ ctx, input }) => {
    const sale = await saleModel.cancel(input.id, input.organizationId, ctx.user.id, input.reason);
    if (!sale) throw new TRPCError11({ code: "NOT_FOUND", message: "Venda n\xE3o encontrada" });
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "CANCEL",
      entity: "sale",
      entityId: input.id,
      newValues: { status: "cancelada", reason: input.reason },
      request: ctx.req
    });
    return sale;
  })
});

// server/controllers/payout.controller.ts
import { z as z11 } from "zod";
import { TRPCError as TRPCError12 } from "@trpc/server";

// server/models/payout.model.ts
init_supabase_server();
var PAYOUT_COLUMNS = "id, organization_id, professional_id, location_id, period_start, period_end, percentage, expected_amount, carryover_amount, amount, status, notes, created_by, created_at";
function fail10(context, error) {
  console.error(`[PayoutModel] ${context}:`, error?.message);
  throw new Error(`Falha ao ${context} repasse`);
}
function round2(value) {
  return Number(value.toFixed(2));
}
function toPayout(row, names) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    professionalId: row.professional_id,
    professionalName: names?.professionalName ?? null,
    locationId: row.location_id,
    locationName: names?.locationName ?? null,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    percentage: Number(row.percentage),
    expectedAmount: Number(row.expected_amount),
    carryoverAmount: Number(row.carryover_amount),
    amount: Number(row.amount),
    status: row.status ?? "confirmado",
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}
async function nameMaps(organizationId, rows) {
  const professionalIds = Array.from(new Set(rows.map((row) => row.professional_id)));
  const locationIds = Array.from(
    new Set(rows.map((row) => row.location_id).filter((id) => id !== null))
  );
  const professionals2 = /* @__PURE__ */ new Map();
  const locations2 = /* @__PURE__ */ new Map();
  if (professionalIds.length > 0) {
    const { data } = await getSupabaseAdmin().from("professionals").select("id, full_name").eq("organization_id", organizationId).in("id", professionalIds);
    for (const item of data ?? []) {
      const row = item;
      professionals2.set(row.id, row.full_name);
    }
  }
  if (locationIds.length > 0) {
    const { data } = await getSupabaseAdmin().from("locations").select("id, name").in("id", locationIds);
    for (const item of data ?? []) {
      const row = item;
      locations2.set(row.id, row.name);
    }
  }
  return { professionals: professionals2, locations: locations2 };
}
var payoutModel = financeGuarded({
  /** Percentual configurado no profissional (Cap. 15.3.1). */
  async getProfessionalPercentage(organizationId, professionalId) {
    const { data, error } = await getSupabaseAdmin().from("professionals").select("commission_percentage").eq("id", professionalId).eq("organization_id", organizationId).maybeSingle();
    if (error) fail10("consultar percentual do profissional", error);
    return Number(data?.commission_percentage ?? 0);
  },
  /**
   * Retroativo pendente: diferenças positivas de repasses anteriores ainda não
   * compensadas por um carryover já lançado.
   */
  async pendingCarryover(organizationId, professionalId, locationId) {
    let query = getSupabaseAdmin().from("payouts").select("expected_amount, carryover_amount, amount").eq("organization_id", organizationId).eq("professional_id", professionalId).eq("status", "confirmado");
    if (locationId) query = query.eq("location_id", locationId);
    const { data, error } = await query;
    if (error) fail10("calcular retroativo", error);
    let shortfall = 0;
    let compensated = 0;
    for (const item of data ?? []) {
      const row = item;
      const expected = Number(row.expected_amount);
      const carryover = Number(row.carryover_amount);
      const paid = Number(row.amount);
      const paidTowardExpected = Math.max(0, paid - carryover);
      shortfall += Math.max(0, expected - paidTowardExpected);
      compensated += carryover;
    }
    return round2(Math.max(0, shortfall - compensated));
  },
  /** Recebimentos elegíveis com marcação de já repassados (Cap. 15.3.1). */
  async listEligibleRevenues(input) {
    let query = getSupabaseAdmin().from("revenues").select("id, patient_id, description, amount, received_at").eq("organization_id", input.organizationId).eq("status", "recebido").eq("professional_id", input.professionalId).gte("received_at", `${input.from}T00:00:00`).lte("received_at", `${input.to}T23:59:59`).order("received_at", { ascending: true });
    if (input.locationId) query = query.eq("location_id", input.locationId);
    const { data, error } = await query;
    if (error) fail10("listar receitas eleg\xEDveis", error);
    const rows = data ?? [];
    const repassed = /* @__PURE__ */ new Set();
    if (rows.length > 0) {
      const { data: itemData, error: itemError } = await getSupabaseAdmin().from("payout_items").select("revenue_id, payouts!inner(status)").in("revenue_id", rows.map((row) => row.id));
      if (itemError) fail10("consultar repasses das receitas", itemError);
      for (const item of itemData ?? []) {
        const row = item;
        const payout = Array.isArray(row.payouts) ? row.payouts[0] : row.payouts;
        if (payout?.status === "confirmado") repassed.add(row.revenue_id);
      }
    }
    const patientIds = Array.from(
      new Set(rows.map((row) => row.patient_id).filter((id) => id !== null))
    );
    const patients2 = /* @__PURE__ */ new Map();
    if (patientIds.length > 0) {
      const { data: patientData } = await getSupabaseAdmin().from("patients").select("id, full_name").in("id", patientIds);
      for (const item of patientData ?? []) {
        const row = item;
        patients2.set(row.id, row.full_name);
      }
    }
    const status = input.status ?? "todos";
    return rows.map((row) => ({
      id: row.id,
      patientId: row.patient_id,
      patientName: row.patient_id ? patients2.get(row.patient_id) ?? null : null,
      description: row.description,
      amount: Number(row.amount),
      receivedAt: row.received_at,
      repassed: repassed.has(row.id)
    })).filter((row) => {
      if (status === "nao_repassado") return !row.repassed;
      if (status === "repassado") return row.repassed;
      return true;
    });
  },
  async create(data) {
    if (data.revenueIds.length === 0) {
      throw new Error("Selecione ao menos uma receita para repassar");
    }
    const { data: revenueData, error: revenueError } = await getSupabaseAdmin().from("revenues").select("id, amount").eq("organization_id", data.organizationId).eq("status", "recebido").eq("professional_id", data.professionalId).in("id", data.revenueIds);
    if (revenueError) fail10("validar receitas", revenueError);
    const revenues = revenueData ?? [];
    if (revenues.length !== data.revenueIds.length) {
      throw new Error("Uma ou mais receitas n\xE3o est\xE3o eleg\xEDveis para repasse");
    }
    const base = revenues.reduce((total, row2) => total + Number(row2.amount), 0);
    const expectedAmount = round2(base * data.percentage / 100);
    const carryoverAmount = await this.pendingCarryover(
      data.organizationId,
      data.professionalId,
      data.locationId
    );
    const amount = round2(data.amount ?? expectedAmount + carryoverAmount);
    const { data: row, error } = await getSupabaseAdmin().from("payouts").insert({
      organization_id: data.organizationId,
      professional_id: data.professionalId,
      location_id: data.locationId ?? null,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      percentage: data.percentage,
      expected_amount: expectedAmount,
      carryover_amount: carryoverAmount,
      amount,
      status: "confirmado",
      notes: data.notes ?? null,
      created_by: data.createdBy ?? null
    }).select(PAYOUT_COLUMNS).single();
    if (error || !row) fail10("criar", error);
    const { error: itemError } = await getSupabaseAdmin().from("payout_items").insert(
      revenues.map((revenue) => ({
        payout_id: row.id,
        revenue_id: revenue.id,
        amount: Number(revenue.amount)
      }))
    );
    if (itemError) fail10("criar itens do", itemError);
    await this.addHistory(row.id, data.createdBy ?? null, "CREATE", {
      percentage: data.percentage,
      expectedAmount,
      carryoverAmount,
      amount,
      revenueIds: data.revenueIds
    });
    return toPayout(row);
  },
  async list(filter) {
    let query = getSupabaseAdmin().from("payouts").select(PAYOUT_COLUMNS).eq("organization_id", filter.organizationId).order("created_at", { ascending: false });
    if (filter.professionalId) query = query.eq("professional_id", filter.professionalId);
    if (filter.from) query = query.gte("period_start", filter.from);
    if (filter.to) query = query.lte("period_end", filter.to);
    const { data, error } = await query.range(
      filter.offset ?? 0,
      (filter.offset ?? 0) + (filter.limit ?? 100) - 1
    );
    if (error) fail10("listar", error);
    const rows = data ?? [];
    const maps = await nameMaps(filter.organizationId, rows);
    return rows.map(
      (row) => toPayout(row, {
        professionalName: maps.professionals.get(row.professional_id) ?? null,
        locationName: row.location_id ? maps.locations.get(row.location_id) ?? null : null
      })
    );
  },
  async cancel(id, organizationId, userId, reason) {
    const { data: existing, error: findError } = await getSupabaseAdmin().from("payouts").select(PAYOUT_COLUMNS).eq("id", id).eq("organization_id", organizationId).maybeSingle();
    if (findError) fail10("consultar", findError);
    if (!existing) return null;
    if (existing.status === "cancelado") {
      throw new Error("Repasse j\xE1 est\xE1 cancelado");
    }
    const { data: updated, error } = await getSupabaseAdmin().from("payouts").update({ status: "cancelado", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("organization_id", organizationId).select(PAYOUT_COLUMNS).maybeSingle();
    if (error) fail10("cancelar", error);
    await this.addHistory(id, userId, "CANCEL", { status: "cancelado" }, reason);
    return updated ? toPayout(updated) : null;
  },
  async addHistory(payoutId, userId, action, changes, reason) {
    const { error } = await getSupabaseAdmin().from("payout_history").insert({
      payout_id: payoutId,
      changed_by: userId,
      action,
      changes,
      reason: reason ?? null
    });
    if (error) console.error("[PayoutModel] hist\xF3rico:", error.message);
  },
  async listHistory(payoutId) {
    const { data, error } = await getSupabaseAdmin().from("payout_history").select("id, action, reason, created_at").eq("payout_id", payoutId).order("created_at", { ascending: false });
    if (error) fail10("listar hist\xF3rico", error);
    return (data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      reason: row.reason ?? null,
      createdAt: row.created_at ?? null
    }));
  }
});

// server/controllers/payout.controller.ts
var payoutStatusSchema = z11.enum(["nao_repassado", "repassado", "todos"]);
function asTrpcError(error, fallback) {
  if (error instanceof TRPCError12) return error;
  return new TRPCError12({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : fallback
  });
}
var periodSchema = z11.object({
  organizationId: z11.number().int().positive(),
  professionalId: z11.number().int().positive(),
  locationId: z11.number().int().positive().optional(),
  from: z11.string().min(10, "Informe a data inicial"),
  to: z11.string().min(10, "Informe a data final")
});
var payoutRouter = router({
  /** Recebimentos elegíveis, com marcação de já repassados (Cap. 15.3.1). */
  eligibleRevenues: protectedProcedure.input(periodSchema.extend({ status: payoutStatusSchema.default("todos") })).query(async ({ input }) => {
    try {
      return await payoutModel.listEligibleRevenues(input);
    } catch (error) {
      throw asTrpcError(error, "Falha ao listar receitas eleg\xEDveis");
    }
  }),
  /** Percentual de repasse configurado no profissional. */
  professionalPercentage: protectedProcedure.input(
    z11.object({
      organizationId: z11.number().int().positive(),
      professionalId: z11.number().int().positive()
    })
  ).query(async ({ input }) => {
    try {
      return {
        percentage: await payoutModel.getProfessionalPercentage(
          input.organizationId,
          input.professionalId
        )
      };
    } catch (error) {
      throw asTrpcError(error, "Falha ao consultar percentual");
    }
  }),
  /** Retroativo pendente do profissional/local (Cap. 15.3.1). */
  carryover: protectedProcedure.input(
    z11.object({
      organizationId: z11.number().int().positive(),
      professionalId: z11.number().int().positive(),
      locationId: z11.number().int().positive().optional()
    })
  ).query(async ({ input }) => {
    try {
      return {
        amount: await payoutModel.pendingCarryover(
          input.organizationId,
          input.professionalId,
          input.locationId
        )
      };
    } catch (error) {
      throw asTrpcError(error, "Falha ao calcular retroativo");
    }
  }),
  list: protectedProcedure.input(
    z11.object({
      organizationId: z11.number().int().positive(),
      professionalId: z11.number().int().positive().optional(),
      from: z11.string().optional(),
      to: z11.string().optional(),
      limit: z11.number().int().min(1).max(200).default(100),
      offset: z11.number().int().min(0).default(0)
    })
  ).query(async ({ input }) => {
    try {
      return await payoutModel.list(input);
    } catch (error) {
      throw asTrpcError(error, "Falha ao listar repasses");
    }
  }),
  history: protectedProcedure.input(
    z11.object({
      id: z11.number().int().positive(),
      organizationId: z11.number().int().positive()
    })
  ).query(async ({ input }) => {
    try {
      return await payoutModel.listHistory(input.id);
    } catch (error) {
      throw asTrpcError(error, "Falha ao listar hist\xF3rico do repasse");
    }
  }),
  create: protectedProcedure.input(
    z11.object({
      organizationId: z11.number().int().positive(),
      professionalId: z11.number().int().positive(),
      locationId: z11.number().int().positive().optional(),
      periodStart: z11.string().min(10, "Informe o in\xEDcio do per\xEDodo"),
      periodEnd: z11.string().min(10, "Informe o fim do per\xEDodo"),
      percentage: z11.number().min(0).max(100),
      amount: z11.number().min(0).optional(),
      revenueIds: z11.array(z11.number().int().positive()).min(1, "Selecione ao menos uma receita"),
      notes: z11.string().max(500).optional()
    })
  ).mutation(async ({ ctx, input }) => {
    try {
      const payout = await payoutModel.create({
        ...input,
        createdBy: ctx.user.id
      });
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "payout",
        entityId: payout.id,
        newValues: {
          professionalId: payout.professionalId,
          percentage: payout.percentage,
          expectedAmount: payout.expectedAmount,
          carryoverAmount: payout.carryoverAmount,
          amount: payout.amount
        },
        request: ctx.req
      });
      return payout;
    } catch (error) {
      throw asTrpcError(error, "Falha ao registrar repasse");
    }
  }),
  /** Cancelamento com motivo; receitas voltam a ficar elegíveis (Cap. 15.3.2). */
  cancel: protectedProcedure.input(
    z11.object({
      id: z11.number().int().positive(),
      organizationId: z11.number().int().positive(),
      reason: z11.string().min(3, "Motivo do cancelamento \xE9 obrigat\xF3rio")
    })
  ).mutation(async ({ ctx, input }) => {
    try {
      const payout = await payoutModel.cancel(
        input.id,
        input.organizationId,
        ctx.user.id,
        input.reason
      );
      if (!payout) {
        throw new TRPCError12({ code: "NOT_FOUND", message: "Repasse n\xE3o encontrado" });
      }
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CANCEL",
        entity: "payout",
        entityId: input.id,
        newValues: { status: "cancelado", reason: input.reason },
        request: ctx.req
      });
      return payout;
    } catch (error) {
      throw asTrpcError(error, "Falha ao cancelar repasse");
    }
  })
});

// server/controllers/statement.controller.ts
import { z as z12 } from "zod";
import { TRPCError as TRPCError13 } from "@trpc/server";

// server/models/statement.model.ts
init_supabase_server();
function fail11(context, error) {
  console.error(`[StatementModel] ${context}:`, error?.message);
  throw new Error(`Falha ao ${context} extrato`);
}
function dateOnly(value) {
  if (!value) return null;
  return value.slice(0, 10);
}
function round22(value) {
  return Number(value.toFixed(2));
}
var statementModel = financeGuarded({
  async list(filter) {
    const entries = [];
    const [revenues, sales, expenses, payouts] = await Promise.all([
      getSupabaseAdmin().from("revenues").select("id, description, payer_name, amount, received_at, created_at").eq("organization_id", filter.organizationId).eq("status", "recebido"),
      getSupabaseAdmin().from("sales").select("id, description, payer_name, amount, received_at, issued_at").eq("organization_id", filter.organizationId).eq("status", "recebido"),
      getSupabaseAdmin().from("expenses").select("id, description, payee_name, amount, paid_at, due_date").eq("organization_id", filter.organizationId).eq("status", "pago"),
      getSupabaseAdmin().from("payouts").select("id, notes, amount, professional_id, created_at").eq("organization_id", filter.organizationId).eq("status", "confirmado")
    ]);
    if (revenues.error) fail11("listar receitas", revenues.error);
    if (sales.error) fail11("listar vendas", sales.error);
    if (expenses.error) fail11("listar despesas", expenses.error);
    if (payouts.error) fail11("listar repasses", payouts.error);
    for (const item of revenues.data ?? []) {
      const row = item;
      entries.push({
        id: `receita-${row.id}`,
        referenceId: row.id,
        type: "entrada",
        source: "receita",
        date: dateOnly(row.received_at ?? row.created_at),
        description: row.description || `Receita #${row.id}`,
        counterpart: row.payer_name ?? null,
        amount: Number(row.amount)
      });
    }
    for (const item of sales.data ?? []) {
      const row = item;
      entries.push({
        id: `venda-${row.id}`,
        referenceId: row.id,
        type: "entrada",
        source: "venda",
        date: dateOnly(row.received_at ?? row.issued_at),
        description: row.description || `Venda #${row.id}`,
        counterpart: row.payer_name ?? null,
        amount: Number(row.amount)
      });
    }
    for (const item of expenses.data ?? []) {
      const row = item;
      entries.push({
        id: `despesa-${row.id}`,
        referenceId: row.id,
        type: "saida",
        source: "despesa",
        date: dateOnly(row.paid_at ?? row.due_date),
        description: row.description || `Despesa #${row.id}`,
        counterpart: row.payee_name ?? null,
        amount: Number(row.amount)
      });
    }
    const professionalIds = Array.from(
      new Set(
        (payouts.data ?? []).map((item) => item.professional_id).filter((id) => typeof id === "number")
      )
    );
    const professionalNames = /* @__PURE__ */ new Map();
    if (professionalIds.length > 0) {
      const { data } = await getSupabaseAdmin().from("professionals").select("id, full_name").in("id", professionalIds);
      for (const item of data ?? []) {
        const row = item;
        professionalNames.set(row.id, row.full_name);
      }
    }
    for (const item of payouts.data ?? []) {
      const row = item;
      const professionalName = professionalNames.get(row.professional_id);
      entries.push({
        id: `repasse-${row.id}`,
        referenceId: row.id,
        type: "saida",
        source: "repasse",
        date: dateOnly(row.created_at),
        description: row.notes || `Repasse #${row.id}`,
        counterpart: professionalName ?? null,
        amount: Number(row.amount)
      });
    }
    const filtered = entries.filter((entry) => {
      if (filter.type && entry.type !== filter.type) return false;
      if (filter.source && entry.source !== filter.source) return false;
      if (filter.from && entry.date && entry.date < filter.from) return false;
      if (filter.to && entry.date && entry.date > filter.to) return false;
      return true;
    }).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const summary = filtered.reduce(
      (acc, entry) => {
        if (entry.type === "entrada") acc.entriesTotal += entry.amount;
        else acc.exitsTotal += entry.amount;
        return acc;
      },
      { entriesTotal: 0, exitsTotal: 0, balance: 0 }
    );
    summary.entriesTotal = round22(summary.entriesTotal);
    summary.exitsTotal = round22(summary.exitsTotal);
    summary.balance = round22(summary.entriesTotal - summary.exitsTotal);
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    return { entries: filtered.slice(offset, offset + limit), summary };
  }
});

// server/controllers/statement.controller.ts
var statementFilterSchema = z12.object({
  organizationId: z12.number().int().positive(),
  from: z12.string().optional(),
  to: z12.string().optional(),
  type: z12.enum(["entrada", "saida"]).optional(),
  source: z12.enum(["receita", "venda", "despesa", "repasse"]).optional(),
  limit: z12.number().int().min(1).max(500).default(100),
  offset: z12.number().int().min(0).default(0)
});
var statementRouter = router({
  list: protectedProcedure.input(statementFilterSchema).query(async ({ input }) => {
    try {
      return await statementModel.list(input);
    } catch (error) {
      throw new TRPCError13({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Falha ao gerar extrato"
      });
    }
  })
});

// server/controllers/receipt.controller.ts
import { z as z13 } from "zod";
import { TRPCError as TRPCError14 } from "@trpc/server";

// server/models/receipt.model.ts
init_supabase_server();
var RECEIPT_COLUMNS = "id, organization_id, revenue_id, sale_id, issuer_type, issuer_user_id, issuer_establishment_id, payer_name, amount, description, status, issued_at, created_by, created_at, updated_at";
function fail12(context, error) {
  console.error(`[ReceiptModel] ${context}:`, error?.message);
  throw new Error(`Falha ao ${context} recibo`);
}
function toReceipt(row, issuerName) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    revenueId: row.revenue_id,
    saleId: row.sale_id,
    issuerType: row.issuer_type ?? "usuario",
    issuerUserId: row.issuer_user_id,
    issuerEstablishmentId: row.issuer_establishment_id,
    issuerName: issuerName ?? null,
    payerName: row.payer_name,
    amount: Number(row.amount),
    description: row.description,
    status: row.status ?? "emitido",
    issuedAt: row.issued_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
async function resolveIssuerNames(rows) {
  const userIds = Array.from(
    new Set(rows.map((row) => row.issuer_user_id).filter((id) => id !== null))
  );
  const establishmentIds = Array.from(
    new Set(
      rows.map((row) => row.issuer_establishment_id).filter((id) => id !== null)
    )
  );
  const names = /* @__PURE__ */ new Map();
  if (userIds.length > 0) {
    const { data } = await getSupabaseAdmin().from("users").select("id, name").in("id", userIds);
    for (const item of data ?? []) {
      const row = item;
      names.set(row.id, row.name);
    }
  }
  if (establishmentIds.length > 0) {
    const { data } = await getSupabaseAdmin().from("establishments").select("id, name").in("id", establishmentIds);
    for (const item of data ?? []) {
      const row = item;
      names.set(row.id, row.name);
    }
  }
  return names;
}
function issuerNameOf(row, names) {
  const id = row.issuer_type === "estabelecimento" ? row.issuer_establishment_id : row.issuer_user_id;
  return id ? names.get(id) ?? null : null;
}
var receiptModel = financeGuarded({
  async create(data) {
    const { data: row, error } = await getSupabaseAdmin().from("receipts").insert({
      organization_id: data.organizationId,
      revenue_id: data.revenueId ?? null,
      sale_id: data.saleId ?? null,
      issuer_type: data.issuerType,
      issuer_user_id: data.issuerType === "usuario" ? data.issuerUserId ?? null : null,
      issuer_establishment_id: data.issuerType === "estabelecimento" ? data.issuerEstablishmentId ?? null : null,
      payer_name: data.payerName,
      amount: data.amount,
      description: data.description ?? null,
      status: "emitido",
      issued_at: data.issuedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
      created_by: data.createdBy ?? null
    }).select(RECEIPT_COLUMNS).single();
    if (error || !row) fail12("criar", error);
    const names = await resolveIssuerNames([row]);
    await this.addHistory(row.id, data.createdBy ?? null, "CREATE", {
      amount: data.amount,
      payerName: data.payerName
    });
    return toReceipt(row, issuerNameOf(row, names));
  },
  async findById(id, organizationId) {
    const { data: row, error } = await getSupabaseAdmin().from("receipts").select(RECEIPT_COLUMNS).eq("id", id).eq("organization_id", organizationId).maybeSingle();
    if (error) fail12("consultar", error);
    if (!row) return null;
    const names = await resolveIssuerNames([row]);
    return toReceipt(row, issuerNameOf(row, names));
  },
  async findMany(filter) {
    let query = getSupabaseAdmin().from("receipts").select(RECEIPT_COLUMNS).eq("organization_id", filter.organizationId).order("issued_at", { ascending: false });
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.from) query = query.gte("issued_at", `${filter.from}T00:00:00`);
    if (filter.to) query = query.lte("issued_at", `${filter.to}T23:59:59`);
    if (filter.search) {
      const term = filter.search.replace(/[%,()]/g, "").trim();
      if (term) query = query.or(`payer_name.ilike.%${term}%,description.ilike.%${term}%`);
    }
    const { data, error } = await query.range(
      filter.offset ?? 0,
      (filter.offset ?? 0) + (filter.limit ?? 100) - 1
    );
    if (error) fail12("listar", error);
    const rows = data ?? [];
    const names = await resolveIssuerNames(rows);
    return rows.map((row) => toReceipt(row, issuerNameOf(row, names)));
  },
  async update(id, organizationId, data) {
    const patch = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    if (data.revenueId !== void 0) patch.revenue_id = data.revenueId;
    if (data.saleId !== void 0) patch.sale_id = data.saleId;
    if (data.issuerType !== void 0) patch.issuer_type = data.issuerType;
    if (data.issuerUserId !== void 0) patch.issuer_user_id = data.issuerUserId;
    if (data.issuerEstablishmentId !== void 0) {
      patch.issuer_establishment_id = data.issuerEstablishmentId;
    }
    if (data.payerName !== void 0) patch.payer_name = data.payerName;
    if (data.amount !== void 0) patch.amount = data.amount;
    if (data.description !== void 0) patch.description = data.description;
    if (data.issuedAt !== void 0) patch.issued_at = data.issuedAt;
    const { error } = await getSupabaseAdmin().from("receipts").update(patch).eq("id", id).eq("organization_id", organizationId);
    if (error) fail12("atualizar", error);
    await this.addHistory(id, null, "UPDATE", data);
    return this.findById(id, organizationId);
  },
  async cancel(id, organizationId, userId, reason) {
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;
    if (existing.status === "cancelado") {
      throw new Error("Recibo j\xE1 est\xE1 cancelado");
    }
    const { error } = await getSupabaseAdmin().from("receipts").update({ status: "cancelado", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("organization_id", organizationId);
    if (error) fail12("cancelar", error);
    await this.addHistory(id, userId, "CANCEL", { status: "cancelado" }, reason);
    return this.findById(id, organizationId);
  },
  async addHistory(receiptId, userId, action, changes, reason) {
    const { error } = await getSupabaseAdmin().from("receipt_history").insert({
      receipt_id: receiptId,
      changed_by: userId,
      action,
      changes,
      reason: reason ?? null
    });
    if (error) console.error("[ReceiptModel] hist\xF3rico:", error.message);
  },
  async listHistory(receiptId) {
    const { data, error } = await getSupabaseAdmin().from("receipt_history").select("id, action, reason, created_at").eq("receipt_id", receiptId).order("created_at", { ascending: false });
    if (error) fail12("listar hist\xF3rico", error);
    return (data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      reason: row.reason ?? null,
      createdAt: row.created_at ?? null
    }));
  }
});

// server/controllers/receipt.controller.ts
init_supabase_server();
var issuerTypeSchema = z13.enum(["usuario", "estabelecimento"]);
function asTrpcError2(error, fallback) {
  if (error instanceof TRPCError14) return error;
  return new TRPCError14({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : fallback
  });
}
var createReceiptSchema = z13.object({
  organizationId: z13.number().int().positive(),
  revenueId: z13.number().int().positive().optional(),
  saleId: z13.number().int().positive().optional(),
  issuerType: issuerTypeSchema,
  issuerUserId: z13.number().int().positive().optional(),
  issuerEstablishmentId: z13.number().int().positive().optional(),
  payerName: z13.string().min(2, "Nome do pagador \xE9 obrigat\xF3rio").max(255),
  amount: z13.number().positive("Valor deve ser maior que zero"),
  description: z13.string().max(500).optional(),
  issuedAt: z13.string().optional()
});
var receiptRouter = router({
  /** Emitentes disponíveis: usuários da clínica e estabelecimentos (Cap. 15.5). */
  issuerOptions: protectedProcedure.input(z13.object({ organizationId: z13.number().int().positive() })).query(async ({ input }) => {
    const [users2, establishments2] = await Promise.all([
      getSupabaseAdmin().from("users").select("id, name").eq("organization_id", input.organizationId).order("name"),
      getSupabaseAdmin().from("establishments").select("id, name").eq("organization_id", input.organizationId).order("name")
    ]);
    if (users2.error) {
      throw new TRPCError14({ code: "INTERNAL_SERVER_ERROR", message: users2.error.message });
    }
    if (establishments2.error) {
      throw new TRPCError14({
        code: "INTERNAL_SERVER_ERROR",
        message: establishments2.error.message
      });
    }
    return {
      users: (users2.data ?? []).map((row) => ({
        id: row.id,
        name: row.name
      })),
      establishments: (establishments2.data ?? []).map((row) => ({
        id: row.id,
        name: row.name
      }))
    };
  }),
  list: protectedProcedure.input(
    z13.object({
      organizationId: z13.number().int().positive(),
      status: z13.enum(["emitido", "cancelado"]).optional(),
      search: z13.string().optional(),
      from: z13.string().optional(),
      to: z13.string().optional(),
      limit: z13.number().int().min(1).max(200).default(100),
      offset: z13.number().int().min(0).default(0)
    })
  ).query(async ({ input }) => {
    try {
      return await receiptModel.findMany(input);
    } catch (error) {
      throw asTrpcError2(error, "Falha ao listar recibos");
    }
  }),
  getById: protectedProcedure.input(
    z13.object({
      id: z13.number().int().positive(),
      organizationId: z13.number().int().positive()
    })
  ).query(async ({ input }) => {
    const receipt = await receiptModel.findById(input.id, input.organizationId);
    if (!receipt) {
      throw new TRPCError14({ code: "NOT_FOUND", message: "Recibo n\xE3o encontrado" });
    }
    return receipt;
  }),
  history: protectedProcedure.input(
    z13.object({
      id: z13.number().int().positive(),
      organizationId: z13.number().int().positive()
    })
  ).query(async ({ input }) => {
    const receipt = await receiptModel.findById(input.id, input.organizationId);
    if (!receipt) {
      throw new TRPCError14({ code: "NOT_FOUND", message: "Recibo n\xE3o encontrado" });
    }
    return receiptModel.listHistory(input.id);
  }),
  create: protectedProcedure.input(createReceiptSchema).mutation(async ({ ctx, input }) => {
    if (input.issuerType === "estabelecimento" && !input.issuerEstablishmentId) {
      throw new TRPCError14({
        code: "BAD_REQUEST",
        message: "Selecione o estabelecimento emitente"
      });
    }
    if (input.issuerType === "usuario" && !input.issuerUserId) {
      throw new TRPCError14({
        code: "BAD_REQUEST",
        message: "Selecione o usu\xE1rio emitente"
      });
    }
    try {
      const receipt = await receiptModel.create({
        ...input,
        issuerType: input.issuerType,
        createdBy: ctx.user.id
      });
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "receipt",
        entityId: receipt.id,
        newValues: { payerName: receipt.payerName, amount: receipt.amount },
        request: ctx.req
      });
      return receipt;
    } catch (error) {
      throw asTrpcError2(error, "Falha ao emitir recibo");
    }
  }),
  update: protectedProcedure.input(
    createReceiptSchema.omit({ organizationId: true }).partial().extend({
      id: z13.number().int().positive(),
      organizationId: z13.number().int().positive()
    })
  ).mutation(async ({ ctx, input }) => {
    const { id, organizationId, ...data } = input;
    const existing = await receiptModel.findById(id, organizationId);
    if (!existing) {
      throw new TRPCError14({ code: "NOT_FOUND", message: "Recibo n\xE3o encontrado" });
    }
    if (existing.status === "cancelado") {
      throw new TRPCError14({
        code: "BAD_REQUEST",
        message: "Recibo cancelado n\xE3o pode ser editado"
      });
    }
    try {
      const receipt = await receiptModel.update(id, organizationId, data);
      await writeAuditLog({
        organizationId,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "receipt",
        entityId: id,
        oldValues: { payerName: existing.payerName, amount: existing.amount },
        newValues: data,
        request: ctx.req
      });
      return receipt;
    } catch (error) {
      throw asTrpcError2(error, "Falha ao atualizar recibo");
    }
  }),
  /** Cancelamento com motivo obrigatório no histórico (Cap. 15.5). */
  cancel: protectedProcedure.input(
    z13.object({
      id: z13.number().int().positive(),
      organizationId: z13.number().int().positive(),
      reason: z13.string().min(3, "Motivo do cancelamento \xE9 obrigat\xF3rio")
    })
  ).mutation(async ({ ctx, input }) => {
    try {
      const receipt = await receiptModel.cancel(
        input.id,
        input.organizationId,
        ctx.user.id,
        input.reason
      );
      if (!receipt) {
        throw new TRPCError14({ code: "NOT_FOUND", message: "Recibo n\xE3o encontrado" });
      }
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CANCEL",
        entity: "receipt",
        entityId: input.id,
        newValues: { status: "cancelado", reason: input.reason },
        request: ctx.req
      });
      return receipt;
    } catch (error) {
      throw asTrpcError2(error, "Falha ao cancelar recibo");
    }
  })
});

// server/controllers/google-calendar.controller.ts
import { z as z14 } from "zod";
import { TRPCError as TRPCError15 } from "@trpc/server";
var MAX_SYNC_BATCH = 300;
function asTrpcError3(error, fallback) {
  if (error instanceof TRPCError15) return error;
  const message = error instanceof Error ? error.message : fallback;
  const code = /migração|não configurado|conecte/i.test(message) ? "PRECONDITION_FAILED" : "BAD_REQUEST";
  return new TRPCError15({ code, message });
}
function assertOrganization(userOrganizationId, organizationId) {
  if (userOrganizationId && userOrganizationId !== organizationId) {
    throw new TRPCError15({
      code: "FORBIDDEN",
      message: "Voc\xEA n\xE3o tem acesso a esta organiza\xE7\xE3o"
    });
  }
}
function parseRange(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new TRPCError15({ code: "BAD_REQUEST", message: "Per\xEDodo inv\xE1lido" });
  }
  if (end <= start) {
    throw new TRPCError15({
      code: "BAD_REQUEST",
      message: "A data final deve ser posterior \xE0 inicial"
    });
  }
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}
function syncVersion2(appointment) {
  const updatedAt = appointment.updatedAt ?? appointment.createdAt;
  return updatedAt ? String(updatedAt) : `${appointment.startsAt}|${appointment.endsAt}|${appointment.status}`;
}
async function requireAuth(organizationId, userId) {
  const auth = await googleCalendarModel.getAccessToken(organizationId, userId);
  if (!auth) {
    throw new TRPCError15({
      code: "PRECONDITION_FAILED",
      message: 'Google Calendar n\xE3o conectado. Clique em "Conectar Google" na Agenda para autorizar o acesso.'
    });
  }
  return auth;
}
var googleAgendaRouter = router({
  /** Situação da conexão do usuário (não expõe tokens). */
  status: protectedProcedure.input(z14.object({ organizationId: z14.number().int().positive() })).query(async ({ ctx, input }) => {
    assertOrganization(ctx.user.organizationId, input.organizationId);
    const caps = await getSchemaCapabilities();
    const config = getGoogleConfig();
    const base = {
      provider: "google",
      configured: isGoogleCalendarConfigured(),
      redirectUri: config.redirectUri,
      timeZone: config.timeZone,
      userEmail: ctx.user.email ?? null,
      migrationRequired: !caps.googleCalendar,
      hint: caps.googleCalendar ? null : MIGRATION_0004_HINT
    };
    if (!caps.googleCalendar) {
      return {
        ...base,
        connected: false,
        calendarId: null,
        connectedAt: null,
        scope: null
      };
    }
    const account = await googleCalendarModel.findActive(
      input.organizationId,
      ctx.user.id
    );
    return {
      ...base,
      connected: Boolean(account),
      calendarId: account?.calendarId ?? null,
      connectedAt: account?.connectedAt ?? null,
      scope: account?.scope ?? null
    };
  }),
  /** URL de consentimento do Google (state assinado, validade de 10 min). */
  connectUrl: protectedWith("google_calendar.connect").input(z14.object({ organizationId: z14.number().int().positive() })).query(async ({ ctx, input }) => {
    assertOrganization(ctx.user.organizationId, input.organizationId);
    const caps = await getSchemaCapabilities();
    if (!caps.googleCalendar) {
      throw new TRPCError15({
        code: "PRECONDITION_FAILED",
        message: MIGRATION_0004_HINT
      });
    }
    if (!isGoogleCalendarConfigured()) {
      throw new TRPCError15({
        code: "PRECONDITION_FAILED",
        message: "Google Calendar n\xE3o configurado: informe credenciais reais (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET) no .env do servidor."
      });
    }
    const state = createOAuthState({
      userId: ctx.user.id,
      organizationId: input.organizationId
    });
    return {
      url: buildAuthUrl(state),
      redirectUri: getGoogleConfig().redirectUri
    };
  }),
  /** Desconecta a conta Google e revoga o token (LGPD). */
  disconnect: protectedWith("google_calendar.connect").input(z14.object({ organizationId: z14.number().int().positive() })).mutation(async ({ ctx, input }) => {
    assertOrganization(ctx.user.organizationId, input.organizationId);
    await googleCalendarModel.disconnect(input.organizationId, ctx.user.id);
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "DELETE",
      entity: "google_calendar_account",
      newValues: { revoked: true },
      request: ctx.req
    });
    return { connected: false };
  }),
  /** Eventos do Google no período (somente leitura). */
  listEvents: protectedProcedure.input(
    z14.object({
      organizationId: z14.number().int().positive(),
      from: z14.string().min(10, "Informe a data inicial"),
      to: z14.string().min(10, "Informe a data final"),
      max_results: z14.number().int().min(1).max(2500).optional()
    })
  ).query(async ({ ctx, input }) => {
    assertOrganization(ctx.user.organizationId, input.organizationId);
    const { timeMin, timeMax } = parseRange(input.from, input.to);
    try {
      const auth = await requireAuth(input.organizationId, ctx.user.id);
      const events = await listEvents(auth.accessToken, {
        timeMin,
        timeMax,
        calendarId: auth.calendarId,
        maxResults: input.max_results
      });
      return events.map((event) => ({
        id: event.id,
        summary: event.summary ?? "(sem t\xEDtulo)",
        description: event.description ?? null,
        location: event.location ?? null,
        status: event.status ?? null,
        htmlLink: event.htmlLink ?? null,
        start: event.start,
        end: event.end
      }));
    } catch (error) {
      throw asTrpcError3(error, "Falha ao listar eventos do Google Calendar");
    }
  }),
  /**
   * Enfileira sincronização de um agendamento no Google Calendar (Fase 2).
   * A operação (create/update/delete) é derivada do estado do agendamento.
   */
  syncAppointment: protectedWith("google_calendar.connect").input(
    z14.object({
      organizationId: z14.number().int().positive(),
      appointmentId: z14.number().int().positive()
    })
  ).mutation(async ({ ctx, input }) => {
    assertOrganization(ctx.user.organizationId, input.organizationId);
    try {
      const appointment = await appointmentModel.findById(
        input.appointmentId,
        input.organizationId
      );
      if (!appointment) {
        throw new TRPCError15({
          code: "NOT_FOUND",
          message: "Agendamento n\xE3o encontrado"
        });
      }
      if (appointment.status === "desmarcado") {
        throw new TRPCError15({
          code: "BAD_REQUEST",
          message: "Agendamento desmarcado n\xE3o pode ser sincronizado"
        });
      }
      const operation = appointment.googleCalendarEventId === null ? "create" : "update";
      const job = await enqueueAppointmentSync({
        organizationId: input.organizationId,
        appointmentId: appointment.id,
        userId: ctx.user.id,
        operation,
        version: syncVersion2(appointment)
      });
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "appointment",
        entityId: appointment.id,
        newValues: {
          googleSyncOperation: job.operation,
          googleSyncStatus: job.status
        },
        request: ctx.req
      });
      return {
        appointmentId: appointment.id,
        queued: true,
        job: {
          id: job.id,
          status: job.status,
          operation: job.operation,
          idempotencyKey: job.idempotencyKey,
          attempts: job.attempts
        }
      };
    } catch (error) {
      throw asTrpcError3(error, "Falha ao enfileirar sincroniza\xE7\xE3o com o Google Calendar");
    }
  }),
  /** Remove o evento do Google e desfaz o vínculo com o agendamento (via fila). */
  removeAppointment: protectedProcedure.input(
    z14.object({
      organizationId: z14.number().int().positive(),
      appointmentId: z14.number().int().positive()
    })
  ).mutation(async ({ ctx, input }) => {
    assertOrganization(ctx.user.organizationId, input.organizationId);
    try {
      const appointment = await appointmentModel.findById(
        input.appointmentId,
        input.organizationId
      );
      if (!appointment) {
        throw new TRPCError15({
          code: "NOT_FOUND",
          message: "Agendamento n\xE3o encontrado"
        });
      }
      const job = await enqueueAppointmentSync({
        organizationId: input.organizationId,
        appointmentId: appointment.id,
        userId: ctx.user.id,
        operation: "delete",
        version: syncVersion2(appointment)
      });
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "appointment",
        entityId: appointment.id,
        newValues: { googleCalendarEventId: null, googleSyncOperation: "delete" },
        request: ctx.req
      });
      return { appointmentId: appointment.id, queued: true, job };
    } catch (error) {
      throw asTrpcError3(error, "Falha ao enfileirar remo\xE7\xE3o do Google Calendar");
    }
  }),
  /**
   * Enfileira sincronização em lote de um período (OllCLin → Google).
   * Agendamentos desmarcadados geram job de remoção (delete).
   */
  syncRange: protectedWith("google_calendar.connect").input(
    z14.object({
      organizationId: z14.number().int().positive(),
      from: z14.string().min(10, "Informe a data inicial"),
      to: z14.string().min(10, "Informe a data final")
    })
  ).mutation(async ({ ctx, input }) => {
    assertOrganization(ctx.user.organizationId, input.organizationId);
    parseRange(input.from, input.to);
    try {
      const appointments2 = await appointmentModel.findByPeriod(
        input.organizationId,
        input.from,
        input.to
      );
      const batch = appointments2.slice(0, MAX_SYNC_BATCH);
      let queued = 0;
      let skipped = 0;
      for (const appointment of batch) {
        const operation = appointment.status === "desmarcado" ? "delete" : appointment.googleCalendarEventId === null ? "create" : "update";
        const job = await enqueueAppointmentSync({
          organizationId: input.organizationId,
          appointmentId: appointment.id,
          userId: ctx.user.id,
          operation,
          version: syncVersion2(appointment)
        });
        queued += 1;
        if (operation === "delete") skipped += 1;
      }
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "appointment",
        newValues: {
          googleSyncRange: { from: input.from, to: input.to },
          queued,
          skipped
        },
        request: ctx.req
      });
      return { requested: appointments2.length, queued, skipped };
    } catch (error) {
      throw asTrpcError3(error, "Falha ao enfileirar sincroniza\xE7\xE3o do per\xEDodo");
    }
  }),
  /** Histórico recente de jobs de sincronização (estados: pending/processing/done/failed). */
  syncJobs: protectedWith("google_calendar.connect").input(
    z14.object({
      organizationId: z14.number().int().positive(),
      limit: z14.number().int().min(1).max(100).default(50)
    })
  ).query(async ({ ctx, input }) => {
    assertOrganization(ctx.user.organizationId, input.organizationId);
    const jobs = await googleCalendarSyncModel.findByOrganization(
      input.organizationId,
      input.limit
    );
    return jobs.map((job) => ({
      id: job.id,
      organizationId: job.organizationId,
      appointmentId: job.appointmentId,
      userId: job.userId,
      operation: job.operation,
      idempotencyKey: job.idempotencyKey,
      attempts: job.attempts,
      status: job.status,
      nextAttemptAt: job.nextAttemptAt,
      lastError: job.lastError,
      createdAt: job.createdAt ?? void 0,
      updatedAt: job.updatedAt ?? void 0
    }));
  }),
  /** Reconcile alterações feitas diretamente no Google Calendar → OllCLin. */
  pullRange: protectedProcedure.input(
    z14.object({
      organizationId: z14.number().int().positive(),
      from: z14.string().min(10),
      to: z14.string().min(10)
    })
  ).mutation(async ({ ctx, input }) => {
    assertOrganization(ctx.user.organizationId, input.organizationId);
    parseRange(input.from, input.to);
    try {
      const result = await pullGoogleRangeForUser({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        from: input.from,
        to: input.to
      });
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "appointment",
        newValues: { googlePullRange: input, result },
        request: ctx.req
      });
      return result;
    } catch (error) {
      throw asTrpcError3(error, "Falha ao importar altera\xE7\xF5es do Google Calendar");
    }
  })
});

// server/controllers/chat.controller.ts
import { z as z15 } from "zod";

// server/models/chat.model.ts
init_supabase_server();
var CHAT_COLUMNS = "id, organization_id, sender_id, recipient_id, body, created_at, expires_at, read_at";
function toMessage(row) {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    senderId: Number(row.sender_id),
    recipientId: Number(row.recipient_id),
    body: String(row.body),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    readAt: row.read_at ? String(row.read_at) : null
  };
}
function fail13(context, error) {
  console.error(`[ChatModel] ${context}:`, error?.message);
  throw new Error(`Falha ao ${context} as mensagens`);
}
async function cleanupExpired(organizationId) {
  const { error } = await getSupabaseAdmin().from("chat_messages").delete().eq("organization_id", organizationId).lte("expires_at", (/* @__PURE__ */ new Date()).toISOString());
  if (error) fail13("limpar", error);
}
var chatModel = {
  async listContacts(organizationId, currentUserId) {
    await cleanupExpired(organizationId);
    const { data, error } = await getSupabaseAdmin().from("users").select("id, name, email, role").eq("organization_id", organizationId).neq("id", currentUserId).order("name", { ascending: true });
    if (error) fail13("listar contatos", error);
    return (data ?? []).map((row) => ({
      id: Number(row.id),
      name: String(row.name || "Usu\xE1rio OllCLin"),
      email: row.email ? String(row.email) : null,
      role: String(row.role || "user")
    }));
  },
  async listMessages(organizationId, currentUserId, counterpartId) {
    await cleanupExpired(organizationId);
    const { data, error } = await getSupabaseAdmin().from("chat_messages").select(CHAT_COLUMNS).eq("organization_id", organizationId).or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${counterpartId}),and(sender_id.eq.${counterpartId},recipient_id.eq.${currentUserId})`).gt("expires_at", (/* @__PURE__ */ new Date()).toISOString()).order("created_at", { ascending: true }).limit(200);
    if (error) fail13("listar", error);
    return (data ?? []).map(toMessage);
  },
  async listThreads(organizationId, currentUserId) {
    await cleanupExpired(organizationId);
    const [contacts, messagesResult] = await Promise.all([
      this.listContacts(organizationId, currentUserId),
      getSupabaseAdmin().from("chat_messages").select(CHAT_COLUMNS).eq("organization_id", organizationId).or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`).gt("expires_at", (/* @__PURE__ */ new Date()).toISOString()).order("created_at", { ascending: false }).limit(500)
    ]);
    if (messagesResult.error) fail13("listar conversas", messagesResult.error);
    const messages = (messagesResult.data ?? []).map(toMessage);
    return contacts.map((contact) => {
      const conversation = messages.filter(
        (message) => message.senderId === contact.id || message.recipientId === contact.id
      );
      const latest = conversation[0];
      return {
        ...contact,
        lastMessage: latest?.body ?? null,
        lastMessageAt: latest?.createdAt ?? null,
        unreadCount: conversation.filter(
          (message) => message.senderId === contact.id && message.recipientId === currentUserId && !message.readAt
        ).length
      };
    }).sort((a, b) => {
      if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
      return (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "");
    });
  },
  async sendMessage(input) {
    await cleanupExpired(input.organizationId);
    const body = input.body.trim();
    if (!body || body.length > 2e3) throw new Error("A mensagem deve ter entre 1 e 2.000 caracteres");
    const { data: recipient, error: recipientError } = await getSupabaseAdmin().from("users").select("id").eq("id", input.recipientId).eq("organization_id", input.organizationId).maybeSingle();
    if (recipientError) fail13("validar destinat\xE1rio", recipientError);
    if (!recipient) throw new Error("Destinat\xE1rio n\xE3o encontrado nesta organiza\xE7\xE3o");
    const { data, error } = await getSupabaseAdmin().from("chat_messages").insert({
      organization_id: input.organizationId,
      sender_id: input.senderId,
      recipient_id: input.recipientId,
      body,
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1e3).toISOString()
    }).select(CHAT_COLUMNS).single();
    if (error) fail13("enviar", error);
    return toMessage(data);
  },
  async markRead(organizationId, currentUserId, counterpartId) {
    const { error } = await getSupabaseAdmin().from("chat_messages").update({ read_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("organization_id", organizationId).eq("sender_id", counterpartId).eq("recipient_id", currentUserId).is("read_at", null).gt("expires_at", (/* @__PURE__ */ new Date()).toISOString());
    if (error) fail13("marcar mensagens como lidas", error);
  }
};

// server/controllers/chat.controller.ts
function organizationIdOf(user) {
  return user.organizationId ?? 1;
}
var chatRouter = router({
  contacts: protectedProcedure.query(
    ({ ctx }) => chatModel.listContacts(organizationIdOf(ctx.user), ctx.user.id)
  ),
  threads: protectedProcedure.query(
    ({ ctx }) => chatModel.listThreads(organizationIdOf(ctx.user), ctx.user.id)
  ),
  messages: protectedProcedure.input(z15.object({ counterpartId: z15.number().int().positive() })).query(
    ({ ctx, input }) => chatModel.listMessages(organizationIdOf(ctx.user), ctx.user.id, input.counterpartId)
  ),
  send: protectedProcedure.input(
    z15.object({
      recipientId: z15.number().int().positive(),
      body: z15.string().trim().min(1).max(2e3)
    })
  ).mutation(
    ({ ctx, input }) => chatModel.sendMessage({
      organizationId: organizationIdOf(ctx.user),
      senderId: ctx.user.id,
      recipientId: input.recipientId,
      body: input.body
    })
  ),
  markRead: protectedProcedure.input(z15.object({ counterpartId: z15.number().int().positive() })).mutation(
    ({ ctx, input }) => chatModel.markRead(organizationIdOf(ctx.user), ctx.user.id, input.counterpartId)
  )
});

// server/controllers/import.controller.ts
import { z as z16 } from "zod";
import { TRPCError as TRPCError16 } from "@trpc/server";

// server/services/import-export.service.ts
init_supabase_server();
import { csvParse, tsvParse } from "d3-dsv";

// server/models/import.model.ts
init_supabase_server();
var BATCH_COLUMNS = "id, organization_id, user_id, file_name, file_type, status, total_rows, imported_rows, rejected_rows, errors, created_at, updated_at";
var importBatchModel = {
  async create(input) {
    const { data, error } = await getSupabaseAdmin().from("import_batches").insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      file_name: input.fileName,
      file_type: input.fileType,
      status: input.status,
      total_rows: input.totalRows,
      imported_rows: input.importedRows,
      rejected_rows: input.rejectedRows,
      errors: input.errors,
      ...input.fileContent ? { file_content: input.fileContent } : {}
    }).select(BATCH_COLUMNS).single();
    if (error || !data) return null;
    return toBatch(data);
  },
  async update(id, patch) {
    const { data, error } = await getSupabaseAdmin().from("import_batches").update(patch).eq("id", id).select(BATCH_COLUMNS).single();
    if (error || !data) return null;
    return toBatch(data);
  },
  async findById(id) {
    const { data, error } = await getSupabaseAdmin().from("import_batches").select(BATCH_COLUMNS).eq("id", id).maybeSingle();
    if (error || !data) return null;
    return toBatch(data);
  },
  async findByOrganization(organizationId, limit = 20) {
    const { data, error } = await getSupabaseAdmin().from("import_batches").select(BATCH_COLUMNS).eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 50));
    if (error) return [];
    return (data ?? []).map(toBatch);
  }
};
function toBatch(row) {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    userId: Number(row.user_id),
    fileName: String(row.file_name ?? ""),
    fileType: String(row.file_type ?? ""),
    status: String(row.status ?? "pending"),
    totalRows: Number(row.total_rows ?? 0),
    importedRows: Number(row.imported_rows ?? 0),
    rejectedRows: Number(row.rejected_rows ?? 0),
    errors: row.errors ?? null,
    fileContent: row.file_content ? String(row.file_content) : null
  };
}

// server/services/import-export.service.ts
var ALLOWED_IMPORT_TYPES = ["csv", "tsv", "txt"];
var FIELD_ALIASES = {
  nome: "fullName",
  nomecompleto: "fullName",
  fullname: "fullName",
  patientname: "fullName",
  paciente: "fullName",
  cliente: "fullName",
  titular: "fullName",
  socialname: "socialName",
  cpf: "cpf",
  rg: "rg",
  documento: "rg",
  nascimento: "birthDate",
  datanascimento: "birthDate",
  birthdate: "birthDate",
  dob: "birthDate",
  sexo: "gender",
  telefone: "phone",
  phone: "phone",
  celular: "phone",
  cellphone: "phone",
  fone: "phone",
  email: "email",
  emailaddress: "email",
  mail: "email",
  endereco: "address",
  address: "address",
  cidade: "city",
  uf: "state",
  estado: "state",
  state: "state",
  cep: "zipCode",
  postal: "zipCode",
  zipcode: "zipCode",
  zip: "zipCode",
  contatoemergencia: "emergencyContact",
  contato: "emergencyContact",
  emergencia: "emergencyContact",
  emergencycontact: "emergencyContact",
  responsavel: "guardianName",
  responsavelnome: "guardianName",
  guardian: "guardianName",
  nomeresponsavel: "guardianName",
  responsaveldo: "guardianName",
  cpfresponsavel: "guardianDocument",
  guardiancpf: "guardianDocument"
};
function normalizeKey(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function text2(value) {
  if (value === null || value === void 0) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}
function toImportRow(columns, raw) {
  const mapped = {};
  for (const column of columns) {
    const canonical = FIELD_ALIASES[normalizeKey(column)];
    if (canonical) mapped[canonical] = raw[column];
  }
  const fullName = text2(mapped.fullName) ?? text2(mapped.patientName) ?? "";
  const birthDate = text2(mapped.birthDate) ?? text2(mapped.dob) ?? null;
  const isMinor = isMinorByBirthDate(birthDate);
  return {
    fullName,
    socialName: text2(mapped.socialName),
    cpf: text2(mapped.cpf),
    rg: text2(mapped.rg) ?? text2(mapped.documento),
    birthDate,
    gender: text2(mapped.gender),
    phone: text2(mapped.phone) ?? text2(mapped.celular),
    email: text2(mapped.email),
    address: text2(mapped.address),
    city: text2(mapped.city),
    state: text2(mapped.state),
    zipCode: text2(mapped.zipCode) ?? text2(mapped.cep),
    emergencyContact: text2(mapped.emergencyContact),
    emergencyPhone: text2(mapped.emergencyPhone) ?? text2(mapped.telefone),
    consentDataSharing: Boolean(mapped.consentDataSharing ?? mapped.consent ?? false),
    consentMarketing: Boolean(mapped.consentMarketing ?? mapped.consent ?? false),
    isMinor,
    guardianPatientId: null,
    guardianName: text2(mapped.guardianName) ?? text2(mapped.responsavel),
    guardianDocument: text2(mapped.guardianDocument) ?? text2(mapped.cpfResponsavel),
    consentStatus: text2(mapped.consentStatus) ?? "pending"
  };
}
function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}
function isCpfValid(value) {
  return /^\d{11}$/.test(value);
}
function isMinorByBirthDate(birthDate) {
  if (!birthDate) return false;
  const date = /* @__PURE__ */ new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const now = /* @__PURE__ */ new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || monthDiff === 0 && now.getDate() < date.getDate()) age -= 1;
  return age < 18;
}
function validateImportRow(row) {
  if (!row.fullName) {
    return { valid: false, error: { row: 0, field: "fullName", message: "Nome completo \xE9 obrigat\xF3rio." } };
  }
  if (row.cpf && !isCpfValid(row.cpf)) {
    return { valid: false, error: { row: 0, field: "cpf", message: "CPF inv\xE1lido." } };
  }
  if (row.birthDate && !isValidDate(row.birthDate)) {
    return { valid: false, error: { row: 0, field: "birthDate", message: "Data de nascimento inv\xE1lida." } };
  }
  if (row.isMinor && (!row.guardianName || !row.guardianDocument)) {
    return { valid: false, error: { row: 0, field: "guardian", message: "Respons\xE1vel \xE9 obrigat\xF3rio para menor de idade." } };
  }
  return { valid: true };
}
function parseImportContent(input) {
  const fileTypeNormalized = input.fileType.toLowerCase();
  if (!ALLOWED_IMPORT_TYPES.includes(fileTypeNormalized)) {
    throw new Error(
      `Formato n\xE3o suportado nesta fase da Fase 3: ${input.fileType}. Suportados: CSV, TSV e TXT.`
    );
  }
  const parsed = fileTypeNormalized === "tsv" ? tsvParse(input.content) : csvParse(input.content);
  const columns = parsed.length > 0 ? Object.keys(parsed[0]) : [];
  const rawRows = parsed;
  const rows = [];
  const errors = [];
  rawRows.forEach((raw, index2) => {
    const rowNumber = index2 + 1;
    const row = toImportRow(columns, raw);
    const result = validateImportRow(row);
    if (result.valid) {
      rows.push(row);
    } else {
      errors.push({ row: rowNumber, field: result.error?.field, message: result.error?.message ?? "Linha inv\xE1lida." });
    }
  });
  return {
    fileName: input.fileName,
    fileType: input.fileType,
    columns,
    rows,
    errors,
    totalRows: rawRows.length,
    validRows: rows.length,
    rejectedRows: errors.length
  };
}
async function storeImportFile(input) {
  const supabase = getSupabaseAdmin();
  const bucketName = "patient_imports";
  await supabase.storage.createBucket(bucketName);
  const path3 = `imports/${input.organizationId}/${input.userId}/${input.fileName}`;
  const { error } = await supabase.storage.from(bucketName).upload(path3, input.content, { upsert: true });
  if (error) throw new Error(`Falha ao armazenar arquivo de importa\xE7\xE3o: ${error.message}`);
  return path3;
}
async function createImportBatch(input) {
  const preview = parseImportContent(input);
  const errors = {};
  for (const error of preview.errors) errors[String(error.row)] = error;
  await storeImportFile({
    organizationId: input.organizationId,
    userId: input.userId,
    fileName: input.fileName,
    fileType: input.fileType,
    content: input.content
  });
  const batch = await importBatchModel.create({
    organizationId: input.organizationId,
    userId: input.userId,
    fileName: input.fileName,
    fileType: input.fileType,
    status: "preview",
    totalRows: preview.totalRows,
    importedRows: preview.validRows,
    rejectedRows: preview.rejectedRows,
    errors,
    fileContent: input.content
  });
  if (!batch) throw new Error("Falha ao registrar lote de importa\xE7\xE3o");
  const batchId = batch.id;
  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: "CREATE",
    entity: "import_batch",
    newValues: { fileName: input.fileName, fileType: input.fileType, status: "preview", totalRows: preview.totalRows, validRows: preview.validRows, rejectedRows: preview.rejectedRows }
  });
  return { ...preview, batchId, status: "preview" };
}
async function confirmImportBatch(input) {
  const batch = await importBatchModel.findById(input.batchId);
  if (!batch) throw new Error("Falha ao buscar lote de importa\xE7\xE3o");
  if (batch.organizationId !== input.organizationId) {
    throw new Error("Acesso negado para este lote de importa\xE7\xE3o");
  }
  const status = batch.status;
  if (status !== "preview") {
    return { batchId: input.batchId, status, importedRows: batch.importedRows, rejectedRows: batch.rejectedRows };
  }
  const content = batch.fileContent ?? "";
  if (!content.trim()) {
    throw new Error("Conte\xFAdo do arquivo de importa\xE7\xE3o n\xE3o est\xE1 dispon\xEDvel. Reenvie o arquivo.");
  }
  const preview = parseImportContent({
    fileName: batch.fileName,
    fileType: batch.fileType,
    content
  });
  let importedRows = 0;
  let rejectedRows = preview.errors.length;
  for (const row of preview.rows) {
    if (row.cpf) {
      const exists = await patientModel.existsByCpf(row.cpf, input.organizationId);
      if (exists) {
        rejectedRows += 1;
        continue;
      }
    }
    await patientModel.create({
      organizationId: input.organizationId,
      fullName: row.fullName,
      socialName: row.socialName ?? void 0,
      cpf: row.cpf ?? void 0,
      rg: row.rg ?? void 0,
      birthDate: row.birthDate ?? void 0,
      gender: row.gender ?? void 0,
      phone: row.phone ?? void 0,
      email: row.email ?? void 0,
      address: row.address ?? void 0,
      city: row.city ?? void 0,
      state: row.state ?? void 0,
      zipCode: row.zipCode ?? void 0,
      emergencyContact: row.emergencyContact ?? void 0,
      emergencyPhone: row.emergencyPhone ?? void 0,
      consentDataSharing: row.consentDataSharing,
      consentMarketing: row.consentMarketing,
      isMinor: row.isMinor,
      guardianPatientId: row.guardianPatientId ?? void 0,
      guardianName: row.guardianName ?? void 0,
      guardianDocument: row.guardianDocument ?? void 0,
      consentStatus: row.consentStatus
    });
    importedRows += 1;
  }
  const updated = await importBatchModel.update(input.batchId, {
    status: "confirmed",
    imported_rows: importedRows,
    rejected_rows: rejectedRows,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (!updated) throw new Error("Falha ao atualizar lote de importa\xE7\xE3o");
  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: "CREATE",
    entity: "import_batch",
    entityId: input.batchId,
    newValues: { status: "confirmed", importedRows, rejectedRows }
  });
  return { batchId: input.batchId, status: "confirmed", importedRows, rejectedRows };
}
async function listImportBatches(input) {
  return importBatchModel.findByOrganization(input.organizationId, input.limit ?? 20);
}
async function buildAppointmentsExportCsv(input) {
  const appointments2 = await appointmentModel.findMany({
    organizationId: input.organizationId,
    professionalId: input.professionalId,
    patientId: input.patientId,
    status: input.status,
    startsAtFrom: input.from,
    startsAtTo: input.to,
    limit: 1e3,
    offset: 0
  });
  const header = [
    "ID",
    "Data",
    "Hora inicial",
    "Hora final",
    "Paciente",
    "CPF",
    "Profissional",
    "Procedimento",
    "Status",
    "Observa\xE7\xF5es",
    "Criado em"
  ];
  const escapeCell = (value) => {
    const safe = value ?? "";
    if (/[",\n\r]/.test(safe)) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
  };
  const lines = [header.map(escapeCell).join(",")];
  for (const appointment of appointments2) {
    const start = new Date(appointment.startsAt);
    const end = new Date(appointment.endsAt);
    const row = [
      String(appointment.id),
      appointment.startsAt ? start.toISOString().slice(0, 10) : "",
      appointment.startsAt ? start.toTimeString().slice(0, 8) : "",
      appointment.endsAt ? end.toTimeString().slice(0, 8) : "",
      appointment.patient?.fullName ?? "",
      appointment.patient?.cpf ?? "",
      appointment.professional?.fullName ?? "",
      appointment.procedure?.name ?? "",
      appointment.status,
      appointment.notes ?? "",
      appointment.createdAt ?? ""
    ];
    lines.push(row.map(escapeCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

// server/controllers/import.controller.ts
var importRouter = router({
  /** Recebe o arquivo (base64), processa e retorna o preview de validação. */
  createBatch: protectedWith("patients.write").input(
    z16.object({
      organizationId: z16.number().int().positive(),
      fileName: z16.string().min(1).max(255),
      fileType: z16.string().min(1).max(64),
      contentBase64: z16.string().min(1).max(25e5)
    })
  ).mutation(async ({ ctx, input }) => {
    try {
      const content = Buffer.from(input.contentBase64, "base64").toString("utf8");
      const preview = await createImportBatch({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        fileName: input.fileName,
        fileType: input.fileType,
        content
      });
      return preview;
    } catch (error) {
      throw new TRPCError16({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Falha ao processar arquivo de importa\xE7\xE3o"
      });
    }
  }),
  /** Confirma a importação do lote (aplica as linhas validadas). */
  confirm: protectedWith("patients.write").input(
    z16.object({
      batchId: z16.number().int().positive(),
      organizationId: z16.number().int().positive()
    })
  ).mutation(async ({ ctx, input }) => {
    const result = await confirmImportBatch({
      batchId: input.batchId,
      organizationId: input.organizationId,
      userId: ctx.user.id
    });
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "CREATE",
      entity: "import_batch",
      entityId: input.batchId,
      newValues: result
    });
    return result;
  }),
  /** Histórico de lotes de importação da organização. */
  list: protectedWith("patients.read").input(
    z16.object({
      organizationId: z16.number().int().positive(),
      limit: z16.number().int().min(1).max(50).default(20)
    })
  ).query(async ({ ctx, input }) => {
    return listImportBatches({ organizationId: input.organizationId, limit: input.limit });
  })
});

// server/controllers/report.controller.ts
import { z as z17 } from "zod";
var reportRouter = router({
  /** Exporta histórico de consultas/agendamentos em CSV (UTF-8 com BOM). */
  appointmentsCsv: protectedWith("reports.export").input(
    z17.object({
      organizationId: z17.number().int().positive(),
      from: z17.string().optional(),
      to: z17.string().optional(),
      professionalId: z17.number().int().optional(),
      patientId: z17.number().int().optional(),
      status: z17.string().optional(),
      procedureId: z17.number().int().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const csv = await buildAppointmentsExportCsv({
      organizationId: input.organizationId,
      from: input.from,
      to: input.to,
      professionalId: input.professionalId,
      patientId: input.patientId,
      status: input.status,
      procedureId: input.procedureId
    });
    await writeAuditLog({
      organizationId: input.organizationId,
      userId: ctx.user.id,
      action: "READ",
      entity: "appointment_export",
      newValues: {
        from: input.from ?? null,
        to: input.to ?? null,
        professionalId: input.professionalId ?? null,
        patientId: input.patientId ?? null,
        status: input.status ?? null,
        procedureId: input.procedureId ?? null
      },
      request: ctx.req
    });
    return { csv };
  })
});

// server/controllers/payment.controller.ts
import { z as z18 } from "zod";
import { TRPCError as TRPCError17 } from "@trpc/server";

// server/lib/payment-mock.ts
var STATUS_FLOW = [
  "created",
  "pending",
  "authorized",
  "captured",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded"
];
var store = /* @__PURE__ */ new Map();
var MockPaymentProvider = class {
  name = "mock";
  assertAmount(amountCents) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new Error("Valor deve ser um inteiro positivo em centavos");
    }
  }
  async createPayment(input) {
    this.assertAmount(input.amountCents);
    const existing = store.get(input.idempotencyKey);
    if (existing) return existing;
    const capture = input.capture ?? true;
    const status = capture ? "captured" : "authorized";
    const result = {
      status,
      providerTransactionId: `mock_${crypto.randomUUID()}`,
      paymentIntentId: `pi_${crypto.randomUUID()}`,
      providerName: this.name,
      amountCents: input.amountCents,
      extra: {
        nsu: Math.floor(Math.random() * 1e6).toString().padStart(6, "0"),
        authorizationCode: crypto.randomUUID().slice(0, 6).toUpperCase(),
        installments: input.installments ?? 1,
        method: input.method,
        reference: `${input.referenceType}:${input.referenceId}`
      }
    };
    store.set(input.idempotencyKey, result);
    store.set(result.paymentIntentId, result);
    return result;
  }
  async getPayment(id) {
    return store.get(id) ?? null;
  }
  async cancelPayment(id) {
    const payment = store.get(id);
    if (!payment) throw new Error("Pagamento n\xE3o encontrado");
    if (!STATUS_FLOW.includes(payment.status)) throw new Error("Status inv\xE1lido");
    if (payment.status === "refunded" || payment.status === "cancelled") return payment;
    const updated = { ...payment, status: "cancelled" };
    store.set(id, updated);
    store.set(payment.paymentIntentId, updated);
    return updated;
  }
  async refundPayment(id, amountCents) {
    const payment = store.get(id);
    if (!payment) throw new Error("Pagamento n\xE3o encontrado");
    if (payment.status !== "captured" && payment.status !== "partially_refunded") {
      throw new Error("Somente pagamentos capturados podem ser estornados");
    }
    if (amountCents !== void 0) this.assertAmount(amountCents);
    const partial = amountCents !== void 0 && amountCents < payment.amountCents;
    const updated = {
      ...payment,
      status: partial ? "partially_refunded" : "refunded"
    };
    store.set(id, updated);
    store.set(payment.paymentIntentId, updated);
    return updated;
  }
  verifyWebhookSignature(rawBody, signature) {
    return signature === "mock-ok" && rawBody.length >= 0;
  }
};
var activePaymentProvider = new MockPaymentProvider();

// server/models/payment.model.ts
init_supabase_server();
var INTENT_COLUMNS = "id, organization_id, idempotency_key, reference_type, reference_id, amount_cents, currency, method, installments, status, provider_name, provider_transaction_id, description, created_at, updated_at";
var TX_COLUMNS = "id, payment_intent_id, organization_id, from_status, to_status, amount_cents, payload, created_at";
function toIntent(row) {
  return {
    id: String(row.id),
    organizationId: Number(row.organization_id),
    idempotencyKey: String(row.idempotency_key ?? ""),
    referenceType: String(row.reference_type ?? ""),
    referenceId: Number(row.reference_id ?? 0),
    amountCents: Number(row.amount_cents ?? 0),
    currency: String(row.currency ?? "BRL"),
    method: String(row.method ?? ""),
    installments: Number(row.installments ?? 1),
    status: row.status ?? "created",
    providerName: String(row.provider_name ?? ""),
    providerTransactionId: row.provider_transaction_id ? String(row.provider_transaction_id) : null,
    description: row.description ? String(row.description) : null,
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null
  };
}
function toTransaction(row) {
  return {
    id: Number(row.id),
    paymentIntentId: String(row.payment_intent_id),
    organizationId: Number(row.organization_id),
    fromStatus: row.from_status ? String(row.from_status) : null,
    toStatus: String(row.to_status ?? ""),
    amountCents: row.amount_cents === null || row.amount_cents === void 0 ? null : Number(row.amount_cents),
    payload: row.payload ?? null,
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null
  };
}
var paymentModel = {
  /** Busca intenção por chave de idempotência (idempotência global). */
  async findByIdempotencyKey(idempotencyKey) {
    const { data, error } = await getSupabaseAdmin().from("payment_intents").select(INTENT_COLUMNS).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (error || !data) return null;
    return toIntent(data);
  },
  async findById(id, organizationId) {
    const { data, error } = await getSupabaseAdmin().from("payment_intents").select(INTENT_COLUMNS).eq("id", id).eq("organization_id", organizationId).maybeSingle();
    if (error || !data) return null;
    return toIntent(data);
  },
  async listByOrganization(organizationId, limit = 50) {
    const { data, error } = await getSupabaseAdmin().from("payment_intents").select(INTENT_COLUMNS).eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 200));
    if (error) return [];
    return (data ?? []).map(toIntent);
  },
  async createIntent(input) {
    const { data, error } = await getSupabaseAdmin().from("payment_intents").insert({
      id: input.id,
      organization_id: input.organizationId,
      idempotency_key: input.idempotencyKey,
      reference_type: input.referenceType,
      reference_id: input.referenceId,
      amount_cents: input.amountCents,
      currency: "BRL",
      method: input.method,
      installments: input.installments,
      status: input.status,
      provider_name: input.providerName,
      provider_transaction_id: input.providerTransactionId,
      description: input.description
    }).select(INTENT_COLUMNS).single();
    if (error || !data) throw new Error(`Falha ao criar inten\xE7\xE3o de pagamento: ${error?.message ?? "?"}`);
    return toIntent(data);
  },
  /** Atualiza status e registra a transição em payment_transactions. */
  async updateStatus(input) {
    const patch = {
      status: input.toStatus,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (input.providerTransactionId) patch.provider_transaction_id = input.providerTransactionId;
    const { data, error } = await getSupabaseAdmin().from("payment_intents").update(patch).eq("id", input.id).eq("organization_id", input.organizationId).select(INTENT_COLUMNS).single();
    if (error || !data) return null;
    await getSupabaseAdmin().from("payment_transactions").insert({
      payment_intent_id: input.id,
      organization_id: input.organizationId,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      amount_cents: input.amountCents ?? null,
      payload: input.payload ?? {}
    });
    return toIntent(data);
  },
  async listTransactions(paymentIntentId, organizationId) {
    const { data, error } = await getSupabaseAdmin().from("payment_transactions").select(TX_COLUMNS).eq("payment_intent_id", paymentIntentId).eq("organization_id", organizationId).order("created_at", { ascending: true });
    if (error) return [];
    return (data ?? []).map(toTransaction);
  },
  /** Registra evento de webhook (idempotente por event_id da adquirente). */
  async recordWebhookEvent(input) {
    const { error } = await getSupabaseAdmin().from("payment_webhook_events").insert({
      organization_id: input.organizationId,
      provider_name: input.providerName,
      event_id: input.eventId,
      payload: input.payload
    });
    return !error;
  }
};

// server/controllers/payment.controller.ts
var PAYMENT_METHODS = ["card_credit", "card_debit", "pix", "cash", "voucher"];
var methodSchema = z18.enum(["card_credit", "card_debit", "pix", "cash", "voucher"]);
var statusSchema2 = z18.enum([
  "created",
  "pending",
  "authorized",
  "captured",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded"
]);
function asTrpcError4(error, fallback) {
  if (error instanceof TRPCError17) return error;
  return new TRPCError17({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : fallback
  });
}
var paymentRouter = router({
  /** Cria intenção de pagamento (idempotente por chave derivada da referência). */
  create: protectedWith("finance.write").input(
    z18.object({
      organizationId: z18.number().int().positive(),
      referenceType: z18.enum(["sale", "revenue", "appointment"]),
      referenceId: z18.number().int().positive(),
      amountCents: z18.number().int().positive().max(1e8),
      method: methodSchema,
      installments: z18.number().int().min(1).max(24).default(1),
      capture: z18.boolean().default(true),
      cardToken: z18.string().max(512).optional(),
      referenceVersion: z18.string().max(80).optional()
    })
  ).mutation(async ({ ctx, input }) => {
    try {
      const idempotencyKey = `payment:${input.referenceType}:${input.referenceId}:v${input.referenceVersion ?? Date.now()}`;
      const existing = await paymentModel.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (existing.organizationId !== input.organizationId) {
          throw new TRPCError17({ code: "FORBIDDEN", message: "Acesso negado para este tenant" });
        }
        return existing;
      }
      const providerInput = {
        organizationId: input.organizationId,
        idempotencyKey,
        amountCents: input.amountCents,
        currency: "BRL",
        method: input.method,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        description: `OllCLin ${input.referenceType} #${input.referenceId}`,
        cardToken: input.cardToken,
        installments: input.installments,
        capture: input.capture
      };
      const result = await activePaymentProvider.createPayment(providerInput);
      const intent = await paymentModel.createIntent({
        id: result.paymentIntentId,
        organizationId: input.organizationId,
        idempotencyKey,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        amountCents: input.amountCents,
        method: input.method,
        installments: input.installments,
        status: result.status,
        providerName: result.providerName,
        providerTransactionId: result.providerTransactionId,
        description: providerInput.description
      });
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "payment_intent",
        newValues: {
          id: intent.id,
          amountCents: intent.amountCents,
          method: intent.method,
          status: intent.status,
          provider: result.providerName
        },
        request: ctx.req
      });
      return intent;
    } catch (error) {
      throw asTrpcError4(error, "Falha ao criar pagamento");
    }
  }),
  /** Consulta o status atual de um pagamento. */
  get: protectedWith("finance.read").input(z18.object({ organizationId: z18.number().int().positive(), paymentIntentId: z18.string().min(1) })).query(async ({ ctx, input }) => {
    const intent = await paymentModel.findById(input.paymentIntentId, input.organizationId);
    if (!intent) {
      throw new TRPCError17({ code: "NOT_FOUND", message: "Pagamento n\xE3o encontrado" });
    }
    return intent;
  }),
  /** Lista pagamentos da organização. */
  list: protectedWith("finance.read").input(
    z18.object({
      organizationId: z18.number().int().positive(),
      limit: z18.number().int().min(1).max(200).default(50)
    })
  ).query(async ({ input }) => paymentModel.listByOrganization(input.organizationId, input.limit)),
  /** Cancela um pagamento ainda não capturado. */
  cancel: protectedWith("finance.write").input(z18.object({ organizationId: z18.number().int().positive(), paymentIntentId: z18.string().min(1) })).mutation(async ({ ctx, input }) => {
    try {
      const intent = await paymentModel.findById(input.paymentIntentId, input.organizationId);
      if (!intent) throw new TRPCError17({ code: "NOT_FOUND", message: "Pagamento n\xE3o encontrado" });
      const providerResult = await activePaymentProvider.cancelPayment(intent.providerTransactionId ?? intent.id);
      const updated = await paymentModel.updateStatus({
        id: intent.id,
        organizationId: input.organizationId,
        fromStatus: intent.status,
        toStatus: providerResult.status
      });
      if (!updated) throw new Error("Falha ao atualizar status do pagamento");
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CANCEL",
        entity: "payment_intent",
        entityId: null,
        newValues: { id: intent.id, from: intent.status, to: providerResult.status },
        request: ctx.req
      });
      return updated;
    } catch (error) {
      throw asTrpcError4(error, "Falha ao cancelar pagamento");
    }
  }),
  /** Estorna total ou parcialmente um pagamento capturado. */
  refund: protectedWith("finance.write").input(
    z18.object({
      organizationId: z18.number().int().positive(),
      paymentIntentId: z18.string().min(1),
      amountCents: z18.number().int().positive().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    try {
      const intent = await paymentModel.findById(input.paymentIntentId, input.organizationId);
      if (!intent) throw new TRPCError17({ code: "NOT_FOUND", message: "Pagamento n\xE3o encontrado" });
      const providerResult = await activePaymentProvider.refundPayment(
        intent.providerTransactionId ?? intent.id,
        input.amountCents
      );
      const updated = await paymentModel.updateStatus({
        id: intent.id,
        organizationId: input.organizationId,
        fromStatus: intent.status,
        toStatus: providerResult.status,
        amountCents: input.amountCents ?? intent.amountCents
      });
      if (!updated) throw new Error("Falha ao atualizar status do pagamento");
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "payment_intent",
        entityId: null,
        newValues: {
          id: intent.id,
          refundCents: input.amountCents ?? intent.amountCents,
          from: intent.status,
          to: providerResult.status
        },
        request: ctx.req
      });
      return updated;
    } catch (error) {
      throw asTrpcError4(error, "Falha ao estornar pagamento");
    }
  }),
  /** Histórico de transições de estado de um pagamento. */
  transactions: protectedWith("finance.read").input(z18.object({ organizationId: z18.number().int().positive(), paymentIntentId: z18.string().min(1) })).query(async ({ input }) => {
    const intent = await paymentModel.findById(input.paymentIntentId, input.organizationId);
    if (!intent) throw new TRPCError17({ code: "NOT_FOUND", message: "Pagamento n\xE3o encontrado" });
    return paymentModel.listTransactions(intent.id, input.organizationId);
  }),
  /** Catálogo de métodos de pagamento suportados (para o frontend). */
  methods: protectedProcedure.query(() => PAYMENT_METHODS.map((m) => ({ id: m }))),
  statusList: protectedProcedure.query(() => statusSchema2.options)
});

// server/controllers/saas.controller.ts
import { z as z19 } from "zod";
import { TRPCError as TRPCError18 } from "@trpc/server";

// server/models/saas.model.ts
init_supabase_server();
var TRIAL_DAYS = 10;
async function listPermissionAreas() {
  const { data, error } = await getSupabaseAdmin().from("permission_areas").select("key, label, description, sort_order").order("sort_order", { ascending: true });
  if (error) throw new Error(`permission_areas: ${error.message}`);
  return (data ?? []).map((row) => ({
    key: String(row.key),
    label: String(row.label),
    description: row.description ?? null,
    sortOrder: Number(row.sort_order ?? 0)
  }));
}
async function listOrganizationMembersWithPermissions(organizationId) {
  const admin = getSupabaseAdmin();
  const { data: members, error: membersError } = await admin.from("organization_members").select("user_id, role, status, users!inner(id, name, email, is_owner)").eq("organization_id", organizationId).order("created_at", { ascending: true });
  if (membersError) throw new Error(`organization_members: ${membersError.message}`);
  const memberRows = members ?? [];
  const userIds = memberRows.map((m) => Number(m.user_id));
  const { data: perms, error: permsError } = await admin.from("member_permissions").select("user_id, area_key, access_level, updated_at").eq("organization_id", organizationId);
  if (permsError) throw new Error(`member_permissions: ${permsError.message}`);
  const permsByUser = /* @__PURE__ */ new Map();
  for (const row of perms ?? []) {
    const uid = Number(row.user_id);
    const list = permsByUser.get(uid) ?? [];
    list.push({
      userId: uid,
      areaKey: String(row.area_key),
      accessLevel: row.access_level ?? "none",
      updatedAt: row.updated_at ?? null
    });
    permsByUser.set(uid, list);
  }
  return memberRows.map((m) => ({
    userId: Number(m.user_id),
    name: m.users?.name ?? null,
    email: m.users?.email ?? null,
    isOwner: Boolean(m.users?.is_owner),
    role: String(m.role ?? "assistant"),
    status: String(m.status ?? "active"),
    permissions: permsByUser.get(Number(m.user_id)) ?? []
  }));
}
async function setMemberPermission(input) {
  const { error } = await getSupabaseAdmin().from("member_permissions").upsert(
    {
      organization_id: input.organizationId,
      user_id: input.userId,
      area_key: input.areaKey,
      access_level: input.accessLevel,
      granted_by: input.grantedBy,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    },
    { onConflict: "organization_id,user_id,area_key" }
  );
  if (error) throw new Error(`member_permissions: ${error.message}`);
}
async function getOrganizationTrial(organizationId) {
  const { data, error } = await getSupabaseAdmin().from("organizations").select("id, name, plan, trial_started_at, trial_ends_at").eq("id", organizationId).maybeSingle();
  if (error) throw new Error(`organizations: ${error.message}`);
  if (!data) return null;
  const trialEndsAt = data.trial_ends_at ?? null;
  const trialStartedAt = data.trial_started_at ?? null;
  let trialDaysLeft = null;
  let trialExpired = false;
  if (trialEndsAt) {
    const diffMs = new Date(trialEndsAt).getTime() - Date.now();
    trialDaysLeft = Math.max(0, Math.ceil(diffMs / 864e5));
    trialExpired = diffMs <= 0;
  }
  return {
    organizationId: Number(data.id),
    name: String(data.name ?? ""),
    plan: String(data.plan ?? "trial"),
    trialStartedAt,
    trialEndsAt,
    trialDaysLeft,
    trialExpired
  };
}
async function createOrganizationWithTrial(input) {
  const now = /* @__PURE__ */ new Date();
  const ends = new Date(now.getTime() + TRIAL_DAYS * 864e5);
  const { data, error } = await getSupabaseAdmin().from("organizations").insert({
    name: input.name,
    is_active: true,
    plan: "trial",
    trial_started_at: now.toISOString(),
    trial_ends_at: ends.toISOString()
  }).select("id").single();
  if (error) throw new Error(`organizations: ${error.message}`);
  return { organizationId: Number(data.id) };
}

// server/controllers/saas.controller.ts
init_supabase_server();
var ACCESS_LEVELS = ["none", "partial", "full"];
function isAccessLevel(value) {
  return typeof value === "string" && ACCESS_LEVELS.includes(value);
}
async function findLocalUserIdByEmail2(email) {
  const { data } = await getSupabaseAdmin().from("users").select("id").ilike("email", email).limit(1).maybeSingle();
  return data ? Number(data.id) : null;
}
var signupSchema = z19.object({
  organizationName: z19.string().min(2, "Informe o nome da cl\xEDnica").max(120),
  name: z19.string().min(2, "Informe seu nome").max(120),
  email: z19.string().email("E-mail inv\xE1lido"),
  password: z19.string().min(8, "Senha deve ter no m\xEDnimo 8 caracteres").max(72)
});
var saasRouter = router({
  /** Catálogo de áreas de permissão (para a página Permissões). */
  permissionAreas: protectedProcedure.query(async () => {
    return listPermissionAreas();
  }),
  /**
   * Permissões de todos os membros da organização + estado do trial.
   * Somente o TITULAR acessa (área restrita da conta contratante).
   */
  permissionsOverview: protectedProcedure.query(async ({ ctx }) => {
    const user = ctx.user;
    if (!user.organizationId) {
      throw new TRPCError18({ code: "FORBIDDEN", message: "Usu\xE1rio sem organiza\xE7\xE3o." });
    }
    const localId = await findLocalUserIdByEmail2(user.email ?? "");
    const localUser = localId ? await getSupabaseAdmin().from("users").select("is_owner").eq("id", localId).maybeSingle() : null;
    if (!localUser?.data?.is_owner) {
      throw new TRPCError18({
        code: "FORBIDDEN",
        message: "\xC1rea restrita ao titular da conta."
      });
    }
    const [members, trial] = await Promise.all([
      listOrganizationMembersWithPermissions(user.organizationId),
      getOrganizationTrial(user.organizationId)
    ]);
    return { members, trial };
  }),
  /**
   * Ativa/desativa permissão (none|partial|full) de um colaborador numa área.
   * Somente o titular; titular não altera a si mesmo.
   */
  setPermission: protectedProcedure.input(
    z19.object({
      userId: z19.number().int().positive(),
      areaKey: z19.string().min(1),
      accessLevel: z19.enum(ACCESS_LEVELS)
    })
  ).mutation(async ({ ctx, input }) => {
    const user = ctx.user;
    if (!user.organizationId) {
      throw new TRPCError18({ code: "FORBIDDEN", message: "Usu\xE1rio sem organiza\xE7\xE3o." });
    }
    const localId = await findLocalUserIdByEmail2(user.email ?? "");
    const localUser = localId ? await getSupabaseAdmin().from("users").select("is_owner").eq("id", localId).maybeSingle() : null;
    if (!localUser?.data?.is_owner) {
      throw new TRPCError18({
        code: "FORBIDDEN",
        message: "Somente o titular da conta pode alterar permiss\xF5es."
      });
    }
    if (localId === input.userId) {
      throw new TRPCError18({
        code: "FORBIDDEN",
        message: "O titular n\xE3o pode alterar as pr\xF3prias permiss\xF5es."
      });
    }
    const { data: member } = await getSupabaseAdmin().from("organization_members").select("id").eq("organization_id", user.organizationId).eq("user_id", input.userId).maybeSingle();
    if (!member) {
      throw new TRPCError18({
        code: "FORBIDDEN",
        message: "Usu\xE1rio n\xE3o pertence \xE0 sua organiza\xE7\xE3o."
      });
    }
    if (!isAccessLevel(input.accessLevel)) {
      throw new TRPCError18({ code: "BAD_REQUEST", message: "N\xEDvel de acesso inv\xE1lido." });
    }
    await setMemberPermission({
      organizationId: user.organizationId,
      userId: input.userId,
      areaKey: input.areaKey,
      accessLevel: input.accessLevel,
      grantedBy: localId ?? 0
    });
    await writeAuditLog({
      organizationId: user.organizationId,
      userId: localId,
      action: "UPDATE",
      entity: "member_permissions",
      entityId: input.userId,
      newValues: {
        targetUserId: input.userId,
        areaKey: input.areaKey,
        accessLevel: input.accessLevel
      },
      request: ctx.req
    });
    return { success: true };
  }),
  /** Estado do trial da organização do usuário logado. */
  trialStatus: protectedProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.user?.organizationId;
    if (!organizationId) return null;
    return getOrganizationTrial(organizationId);
  }),
  /** Catálogo público de planos (landing page). */
  plans: publicProcedure.query(async () => {
    const { listPlans: listPlans2 } = await Promise.resolve().then(() => (init_provisioning_model(), provisioning_model_exports));
    return listPlans2();
  }),
  /**
   * Cadastro público (titular): cria usuário no Supabase Auth, organização com
   * trial de 10 dias, registro local e vínculos. O primeiro cadastro da conta
   * é sempre o titular (is_owner=true, role=owner).
   */
  signup: publicProcedure.input(signupSchema).mutation(async ({ input }) => {
    const email = input.email.trim().toLowerCase();
    const existing = await findLocalUserIdByEmail2(email);
    if (existing) {
      throw new TRPCError18({
        code: "CONFLICT",
        message: "J\xE1 existe uma conta com este e-mail. Fa\xE7a login."
      });
    }
    const admin = getSupabaseAdmin();
    const authClient = (await import("@supabase/supabase-js")).createClient(
      process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "",
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
    const { error: authError } = await authClient.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name, full_name: input.name }
    });
    if (authError) {
      const msg = authError.message ?? String(authError);
      if (!/already|registered|exists/i.test(msg)) {
        throw new TRPCError18({ code: "BAD_REQUEST", message: msg });
      }
    }
    const { organizationId } = await createOrganizationWithTrial({
      name: input.organizationName.trim()
    });
    const { data: maxRow } = await admin.from("users").select("id").order("id", { ascending: false }).limit(1);
    const nextUserId2 = Number(maxRow?.[0]?.id ?? 0) + 1;
    const { data: localUser, error: userError } = await admin.from("users").insert({
      id: nextUserId2,
      open_id: `supabase:${email}`,
      name: input.name.trim(),
      email,
      login_method: "supabase",
      role: "owner",
      organization_id: organizationId,
      is_owner: true
    }).select("id").single();
    if (userError) throw new TRPCError18({ code: "INTERNAL_SERVER_ERROR", message: userError.message });
    const { error: memberError } = await admin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: localUser.id,
      role: "owner",
      status: "active"
    });
    if (memberError) {
      throw new TRPCError18({ code: "INTERNAL_SERVER_ERROR", message: memberError.message });
    }
    await writeAuditLog({
      organizationId,
      userId: localUser.id,
      action: "CREATE",
      entity: "organizations",
      entityId: organizationId,
      newValues: { email, trialDays: 10 }
    });
    return {
      success: true,
      organizationId,
      trialDays: 10,
      message: "Conta criada! Voc\xEA tem 10 dias gr\xE1tis. Fa\xE7a login para acessar seu painel."
    };
  })
});

// server/controllers/onboarding.controller.ts
import { z as z20 } from "zod";
import { TRPCError as TRPCError19 } from "@trpc/server";
init_provisioning_model();
init_supabase_server();
var rateBuckets = /* @__PURE__ */ new Map();
var RATE_LIMIT = 20;
var RATE_WINDOW_MS = 6e4;
function checkRateLimit(key2) {
  const now = Date.now();
  const bucket = rateBuckets.get(key2);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key2, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT;
}
var onboardingRouter = router({
  /** Valida o token do convite (público). Retorna e-mail + nome da org. */
  validateToken: publicProcedure.input(z20.object({ token: z20.string().min(10) })).query(async ({ input }) => {
    if (!checkRateLimit("onboarding:validate")) {
      throw new TRPCError19({ code: "TOO_MANY_REQUESTS", message: "Tente novamente em instantes." });
    }
    const invitation = await findValidInvitationByHash(hashToken(input.token));
    if (!invitation) {
      return { valid: false, reason: "Link inv\xE1lido, expirado ou j\xE1 utilizado." };
    }
    return {
      valid: true,
      email: invitation.email,
      organizationName: invitation.organizationName,
      role: invitation.role,
      expiresAt: invitation.expiresAt
    };
  }),
  /**
   * Define a senha do owner (via convite owner_activation) e conclui o
   * onboarding mínimo. Sem logo (upload fica no passo opcional da view).
   */
  activateWithPassword: publicProcedure.input(
    z20.object({
      token: z20.string().min(10),
      password: z20.string().min(8, "Senha deve ter no m\xEDnimo 8 caracteres").max(72).regex(/[a-z]/, "Senha deve conter letra min\xFAscula").regex(/[A-Z]/, "Senha deve conter letra mai\xFAscula").regex(/[0-9]/, "Senha deve conter n\xFAmero"),
      organizationName: z20.string().min(2).max(120).optional(),
      logoUrl: z20.string().url().max(2048).optional()
    })
  ).mutation(async ({ input }) => {
    if (!checkRateLimit("onboarding:activate")) {
      throw new TRPCError19({ code: "TOO_MANY_REQUESTS", message: "Tente novamente em instantes." });
    }
    const tokenHash = hashToken(input.token);
    const invitation = await findValidInvitationByHash(tokenHash);
    if (!invitation) {
      throw new TRPCError19({
        code: "BAD_REQUEST",
        message: "Link inv\xE1lido, expirado ou j\xE1 utilizado. Solicite um novo convite."
      });
    }
    const admin = getSupabaseAdmin();
    const authKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
    const { createClient: createClient3 } = await import("@supabase/supabase-js");
    const auth = createClient3(process.env.SUPABASE_URL ?? "", authKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data: authUser } = await admin.auth.admin.listUsers();
    const target = authUser?.users?.find(
      (u) => (u.email ?? "").toLowerCase() === invitation.email.toLowerCase()
    );
    if (target) {
      const { error } = await auth.auth.admin.updateUserById(target.id, {
        password: input.password,
        email_confirm: true
      });
      if (error) throw new TRPCError19({ code: "BAD_REQUEST", message: error.message });
    } else {
      const { error } = await auth.auth.admin.createUser({
        email: invitation.email,
        password: input.password,
        email_confirm: true,
        user_metadata: { name: invitation.email.split("@")[0] }
      });
      if (error && !/already/i.test(error.message)) {
        throw new TRPCError19({ code: "BAD_REQUEST", message: error.message });
      }
    }
    let localUserId = await findLocalUserIdByEmail(invitation.email);
    if (!localUserId) {
      localUserId = await createLocalUser({
        email: invitation.email,
        name: invitation.email.split("@")[0],
        organizationId: invitation.organizationId,
        role: invitation.role,
        isOwner: invitation.type === "owner_activation"
      });
    }
    await upsertMembership({
      organizationId: invitation.organizationId,
      userId: localUserId,
      role: invitation.role,
      status: "active"
    });
    const orgUpdate = { onboarding_completed_at: (/* @__PURE__ */ new Date()).toISOString() };
    if (input.organizationName) orgUpdate.name = input.organizationName.trim();
    if (input.logoUrl) orgUpdate.logo_url = input.logoUrl;
    await admin.from("organizations").update(orgUpdate).eq("id", invitation.organizationId);
    await markInvitationUsed(invitation.id);
    await writeAuditLog({
      organizationId: invitation.organizationId,
      userId: localUserId,
      action: "UPDATE",
      entity: "owner_activation",
      entityId: invitation.organizationId,
      newValues: { email: invitation.email, type: invitation.type }
    });
    return { success: true, organizationId: invitation.organizationId };
  }),
  /** Aceite de convite de equipe (staff_invite): define senha e ativa membro. */
  acceptInvite: publicProcedure.input(
    z20.object({
      token: z20.string().min(10),
      password: z20.string().min(8).max(72).regex(/[a-z]/, "min\xFAscula").regex(/[A-Z]/, "mai\xFAscula").regex(/[0-9]/, "n\xFAmero")
    })
  ).mutation(async ({ input }) => {
    if (!checkRateLimit("onboarding:accept")) {
      throw new TRPCError19({ code: "TOO_MANY_REQUESTS", message: "Tente novamente em instantes." });
    }
    const tokenHash = hashToken(input.token);
    const invitation = await findValidInvitationByHash(tokenHash);
    if (!invitation) {
      throw new TRPCError19({
        code: "BAD_REQUEST",
        message: "Convite inv\xE1lido, expirado ou j\xE1 utilizado. Pe\xE7a um reenvio ao titular."
      });
    }
    const authKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
    const { createClient: createClient3 } = await import("@supabase/supabase-js");
    const auth = createClient3(process.env.SUPABASE_URL ?? "", authKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const admin = getSupabaseAdmin();
    const { data: authUser } = await admin.auth.admin.listUsers();
    const target = authUser?.users?.find(
      (u) => (u.email ?? "").toLowerCase() === invitation.email.toLowerCase()
    );
    if (target) {
      const { error } = await auth.auth.admin.updateUserById(target.id, {
        password: input.password,
        email_confirm: true
      });
      if (error) throw new TRPCError19({ code: "BAD_REQUEST", message: error.message });
    } else {
      const { error } = await auth.auth.admin.createUser({
        email: invitation.email,
        password: input.password,
        email_confirm: true
      });
      if (error && !/already/i.test(error.message)) {
        throw new TRPCError19({ code: "BAD_REQUEST", message: error.message });
      }
    }
    let localUserId = await findLocalUserIdByEmail(invitation.email);
    if (!localUserId) {
      localUserId = await createLocalUser({
        email: invitation.email,
        name: invitation.email.split("@")[0],
        organizationId: invitation.organizationId,
        role: invitation.role,
        isOwner: false
      });
    }
    await upsertMembership({
      organizationId: invitation.organizationId,
      userId: localUserId,
      role: invitation.role,
      status: "active"
    });
    await markInvitationUsed(invitation.id);
    await writeAuditLog({
      organizationId: invitation.organizationId,
      userId: localUserId,
      action: "UPDATE",
      entity: "invite_accepted",
      entityId: invitation.id,
      newValues: { email: invitation.email, role: invitation.role }
    });
    return { success: true };
  })
});

// server/controllers/equipe.controller.ts
import { z as z21 } from "zod";
import { TRPCError as TRPCError20 } from "@trpc/server";
init_provisioning_model();
init_supabase_server();

// server/lib/email.ts
var SupabaseEmailService = class {
  async sendInvitationEmail(input) {
    const { createClient: createClient3 } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL ?? "";
    const key2 = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
    if (!url || !key2) throw new Error("Supabase n\xE3o configurado para envio de convite");
    const supabase = createClient3(url, key2, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data: existing } = await supabase.auth.admin.listUsers();
    const alreadyExists = existing?.users?.some(
      (u) => (u.email ?? "").toLowerCase() === input.to.toLowerCase()
    );
    if (alreadyExists) {
      const { error } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email: input.to,
        options: { redirectTo: input.linkUrl }
      });
      if (error) throw new Error(`Falha ao enviar link de acesso: ${error.message}`);
    } else {
      const { error } = await supabase.auth.admin.inviteUserByEmail(input.to, {
        redirectTo: input.linkUrl,
        data: { organization_name: input.organizationName, invited_role: input.role }
      });
      if (error) throw new Error(`Falha ao enviar convite: ${error.message}`);
    }
  }
};
function getEmailService() {
  return new SupabaseEmailService();
}

// server/lib/public-url.ts
var PUBLIC_URL_FALLBACK = "http://localhost:3000";

// server/controllers/equipe.controller.ts
var ROLES = ["admin", "doctor", "receptionist", "financial", "assistant", "readonly"];
function requireManager(ctx) {
  const user = ctx.user;
  if (!user) throw new TRPCError20({ code: "UNAUTHORIZED", message: "Fa\xE7a login." });
  if (!user.organizationId) throw new TRPCError20({ code: "FORBIDDEN", message: "Sem organiza\xE7\xE3o ativa." });
  if (!user.isOwner && user.role !== "admin" && user.role !== "owner") {
    throw new TRPCError20({ code: "FORBIDDEN", message: "Somente titular/admin gerenciam a equipe." });
  }
  return user;
}
async function localIdFor(email) {
  if (!email) return null;
  return findLocalUserIdByEmail(email);
}
async function countActiveOwners(organizationId) {
  const { count } = await getSupabaseAdmin().from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("role", "owner").eq("status", "active");
  return count ?? 0;
}
var equipeRouter = router({
  /** Lista membros + convites pendentes da organização. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const manager = requireManager(ctx);
    const admin = getSupabaseAdmin();
    const members = await listOrganizationMembersWithPermissions2(manager.organizationId);
    const { data: invites } = await admin.from("account_invitations").select("id, email, role, type, expires_at, created_at").eq("organization_id", manager.organizationId).is("used_at", null).order("created_at", { ascending: false });
    return {
      members,
      invites: (invites ?? []).map((i) => ({
        id: Number(i.id),
        email: String(i.email),
        role: String(i.role),
        type: String(i.type),
        expiresAt: String(i.expires_at)
      }))
    };
  }),
  /** Convida um colaborador (staff_invite) — 72h de validade. */
  invite: protectedProcedure.input(
    z21.object({
      email: z21.string().email(),
      role: z21.enum(ROLES)
    })
  ).mutation(async ({ ctx, input }) => {
    const manager = requireManager(ctx);
    const email = input.email.trim().toLowerCase();
    const admin = getSupabaseAdmin();
    const existingUserId = await findLocalUserIdByEmail(email);
    if (existingUserId) {
      const { data: member } = await admin.from("organization_members").select("id, status").eq("organization_id", manager.organizationId).eq("user_id", existingUserId).maybeSingle();
      if (member?.status === "active") {
        throw new TRPCError20({ code: "CONFLICT", message: "Este e-mail j\xE1 \xE9 membro ativo da equipe." });
      }
    }
    const { data: pending } = await admin.from("account_invitations").select("id, token_hash, expires_at").eq("organization_id", manager.organizationId).ilike("email", email).is("used_at", null).maybeSingle();
    if (pending) {
      const token2 = generateToken();
      const { error } = await admin.from("account_invitations").update({
        token_hash: hashToken(token2),
        expires_at: new Date(Date.now() + 72 * 36e5).toISOString()
      }).eq("id", pending.id);
      if (error) throw new TRPCError20({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      const managerLocal2 = await localIdFor(manager.email);
      await createInvitation;
      await writeAuditLog({
        organizationId: manager.organizationId,
        userId: managerLocal2,
        action: "UPDATE",
        entity: "invite_resent",
        entityId: pending.id,
        newValues: { email }
      });
      const base2 = process.env.PUBLIC_URL || PUBLIC_URL_FALLBACK;
      try {
        await getEmailService().sendInvitationEmail({
          to: email,
          linkUrl: `${base2}/aceitar-convite?token=${encodeURIComponent(token2)}`,
          organizationName: "",
          role: input.role,
          expiresInHours: 72
        });
      } catch (error2) {
        console.error("[Equipe] Falha ao reenviar convite:", error2);
      }
      return { success: true, resent: true };
    }
    const token = generateToken();
    const managerLocal = await localIdFor(manager.email);
    await createInvitation({
      organizationId: manager.organizationId,
      email,
      role: input.role,
      type: "staff_invite",
      expiresAt: new Date(Date.now() + 72 * 36e5),
      invitedBy: managerLocal,
      tokenHash: hashToken(token)
    });
    await writeAuditLog({
      organizationId: manager.organizationId,
      userId: managerLocal,
      action: "CREATE",
      entity: "staff_invited",
      newValues: { email, role: input.role }
    });
    const base = process.env.PUBLIC_URL || PUBLIC_URL_FALLBACK;
    try {
      await getEmailService().sendInvitationEmail({
        to: email,
        linkUrl: `${base}/aceitar-convite?token=${encodeURIComponent(token)}`,
        organizationName: "",
        role: input.role,
        expiresInHours: 72
      });
    } catch (error) {
      console.error("[Equipe] Falha ao enviar convite:", error);
    }
    return { success: true, resent: false };
  }),
  /** Revoga convite pendente. */
  revokeInvite: protectedProcedure.input(z21.object({ invitationId: z21.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const manager = requireManager(ctx);
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("account_invitations").delete().eq("id", input.invitationId).eq("organization_id", manager.organizationId).is("used_at", null);
    if (error) throw new TRPCError20({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    const managerLocal = await localIdFor(manager.email);
    await writeAuditLog({
      organizationId: manager.organizationId,
      userId: managerLocal,
      action: "DELETE",
      entity: "invite_revoked",
      entityId: input.invitationId
    });
    return { success: true };
  }),
  /** Altera papel. Admin não altera owner; último owner protegido. */
  updateRole: protectedProcedure.input(
    z21.object({
      userId: z21.number().int().positive(),
      role: z21.enum(ROLES)
    })
  ).mutation(async ({ ctx, input }) => {
    const manager = requireManager(ctx);
    const admin = getSupabaseAdmin();
    const { data: target } = await admin.from("organization_members").select("id, role, status").eq("organization_id", manager.organizationId).eq("user_id", input.userId).maybeSingle();
    if (!target) throw new TRPCError20({ code: "NOT_FOUND", message: "Membro n\xE3o encontrado." });
    if (!manager.isOwner && target.role === "owner") {
      throw new TRPCError20({ code: "FORBIDDEN", message: "Somente o titular altera outro titular." });
    }
    if (target.role === "owner" && target.status === "active") {
      const owners = await countActiveOwners(manager.organizationId);
      if (owners <= 1) {
        throw new TRPCError20({
          code: "FORBIDDEN",
          message: "A organiza\xE7\xE3o precisa de pelo menos 1 titular ativo."
        });
      }
    }
    const { error } = await admin.from("organization_members").update({ role: input.role }).eq("id", target.id);
    if (error) throw new TRPCError20({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    await admin.from("users").update({ role: input.role }).eq("id", input.userId);
    const managerLocal = await localIdFor(manager.email);
    await writeAuditLog({
      organizationId: manager.organizationId,
      userId: managerLocal,
      action: "UPDATE",
      entity: "role_changed",
      entityId: input.userId,
      oldValues: { role: target.role },
      newValues: { role: input.role }
    });
    return { success: true };
  }),
  /** Desativa membro (soft). Último owner protegido. */
  disable: protectedProcedure.input(z21.object({ userId: z21.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const manager = requireManager(ctx);
    const admin = getSupabaseAdmin();
    if (manager.email) {
      const self = await localIdFor(manager.email);
      if (self === input.userId) {
        throw new TRPCError20({ code: "FORBIDDEN", message: "Voc\xEA n\xE3o pode desativar a si mesmo." });
      }
    }
    const { data: target } = await admin.from("organization_members").select("id, role, status").eq("organization_id", manager.organizationId).eq("user_id", input.userId).maybeSingle();
    if (!target) throw new TRPCError20({ code: "NOT_FOUND", message: "Membro n\xE3o encontrado." });
    if (!manager.isOwner && target.role === "owner") {
      throw new TRPCError20({ code: "FORBIDDEN", message: "Somente o titular desativa outro titular." });
    }
    if (target.role === "owner" && target.status === "active") {
      const owners = await countActiveOwners(manager.organizationId);
      if (owners <= 1) {
        throw new TRPCError20({
          code: "FORBIDDEN",
          message: "A organiza\xE7\xE3o precisa de pelo menos 1 titular ativo."
        });
      }
    }
    const { error } = await admin.from("organization_members").update({ status: "disabled" }).eq("id", target.id);
    if (error) throw new TRPCError20({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    const managerLocal = await localIdFor(manager.email);
    await writeAuditLog({
      organizationId: manager.organizationId,
      userId: managerLocal,
      action: "UPDATE",
      entity: "member_disabled",
      entityId: input.userId
    });
    return { success: true };
  }),
  /** Reativa membro. */
  enable: protectedProcedure.input(z21.object({ userId: z21.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const manager = requireManager(ctx);
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("organization_members").update({ status: "active" }).eq("organization_id", manager.organizationId).eq("user_id", input.userId);
    if (error) throw new TRPCError20({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    const managerLocal = await localIdFor(manager.email);
    await writeAuditLog({
      organizationId: manager.organizationId,
      userId: managerLocal,
      action: "UPDATE",
      entity: "member_enabled",
      entityId: input.userId
    });
    return { success: true };
  })
  /** Catálogo de planos (público para a landing). */
  // (planos expostos em saas.plans abaixo)
});

// server/routers.ts
var appRouter = router({
  // Sistema / Saúde
  system: systemRouter,
  // Autenticação
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  // === MÓDULOS MVC ===
  // Pacientes
  pacientes: patientRouter,
  // Agendamentos (com integração Google Calendar)
  agendamentos: appointmentRouter,
  // Profissionais de Saúde
  profissionais: professionalRouter,
  // Procedimentos
  procedimentos: procedureRouter,
  // Convênios (Configurações Gerais)
  convenios: healthPlanRouter,
  // Financeiro — Receitas
  receitas: revenueRouter,
  // Financeiro — Despesas + categorias
  despesas: expenseRouter,
  // Financeiro — Vendas (Cap. 15.1.2)
  vendas: saleRouter,
  // Financeiro — Repasse (Cap. 15.3)
  repasses: payoutRouter,
  // Financeiro — Extrato derivado (Cap. 15.4)
  extrato: statementRouter,
  // Financeiro — Recibos (Cap. 15.5)
  recibos: receiptRouter,
  // Configurações: locais/salas + campos obrigatórios
  configuracoes: settingsRouter,
  // Integração Google Calendar (OAuth no servidor + sincronização de eventos)
  googleAgenda: googleAgendaRouter,
  // Comunicação interna temporária entre usuários da mesma organização
  chat: chatRouter,
  // Dados — Importação (lotes/preview/validação/confirm) e Exportação (CSV)
  imports: importRouter,
  relatorios: reportRouter,
  // Fase 5 (SaaS) — Pagamentos (maquininhas de cartão via PaymentProvider)
  pagamentos: paymentRouter,
  // SaaS — cadastro público (titular + trial 10 dias) e Permissões
  saas: saasRouter,
  // Onboarding do owner (/primeiro-acesso) e aceite de convite (/aceitar-convite)
  onboarding: onboardingRouter,
  // Equipe (RBAC team.manage)
  equipe: equipeRouter
  // TODO: Prontuário, Exames, Cirurgias, Despesas, Repasse, TISS, Telessaúde, Marketing, Relatórios
  // exemplo:
  // prontuario: prontuarioRouter,
  // exames: examesRouter,
});

// server/lib/supabase-auth.ts
init_supabase_server();
import { createClient as createClient2 } from "@supabase/supabase-js";
function getSupabaseAuthClient() {
  const url = process.env.SUPABASE_URL ?? "";
  const key2 = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
  if (!url || !key2) {
    throw new Error("Supabase n\xE3o configurado: defina SUPABASE_URL e SUPABASE_SECRET_KEY no .env");
  }
  return createClient2(url, key2, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}
async function getSupabaseAuthUser(accessToken) {
  if (!accessToken) return null;
  try {
    const supabase = getSupabaseAuthClient();
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user) return null;
    const email = data.user.email ?? null;
    const name = data.user.user_metadata?.name ?? data.user.user_metadata?.full_name ?? email;
    return { id: data.user.id, email, name: name ?? null };
  } catch (error) {
    console.warn(
      "[Supabase Auth] Falha ao validar access token:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
async function findLocalUserByEmail(email) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  const { data, error } = await getSupabaseAdmin().from("users").select(
    "id, open_id, name, email, login_method, role, organization_id, created_at, updated_at, last_signed_in"
  ).ilike("email", normalized).limit(1).maybeSingle();
  if (error || !data) return null;
  const row = data;
  const organizationId = typeof row.organization_id === "number" ? row.organization_id : Number(row.organization_id) || null;
  const user = {
    id: Number(row.id),
    openId: String(row.open_id ?? ""),
    name: row.name ?? null,
    email: row.email ?? null,
    loginMethod: row.login_method ?? null,
    role: row.role ?? "user",
    organizationId,
    createdAt: row.created_at ? new Date(String(row.created_at)) : /* @__PURE__ */ new Date(),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)) : /* @__PURE__ */ new Date(),
    lastSignedIn: row.last_signed_in ? new Date(String(row.last_signed_in)) : /* @__PURE__ */ new Date()
  };
  return user;
}
async function resolveUserFromSupabaseAccessToken(accessToken) {
  const supabaseUser = await getSupabaseAuthUser(accessToken);
  if (!supabaseUser) return null;
  const localUser = await findLocalUserByEmail(supabaseUser.email);
  if (!localUser) return null;
  return localUser;
}

// server/lib/tenant-access.ts
init_supabase_server();
async function resolveTenantAccessByUserId(userId) {
  const { data, error } = await getSupabaseAdmin().from("organization_members").select("organization_id, role, status, created_at").eq("user_id", userId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) {
    const local = await getSupabaseAdmin().from("users").select("organization_id, role").eq("id", userId).limit(1).maybeSingle();
    if (local.error || !local.data) return null;
    const organizationId2 = typeof local.data.organization_id === "number" ? local.data.organization_id : Number(local.data.organization_id) || null;
    if (!organizationId2) return null;
    return { organizationId: organizationId2, role: local.data.role ?? "assistant" };
  }
  const organizationId = typeof data.organization_id === "number" ? data.organization_id : Number(data.organization_id) || null;
  if (!organizationId) return null;
  return { organizationId, role: data.role ?? "assistant" };
}
async function resolveTenantAccessByEmail(email) {
  const localUser = await findLocalUserByEmail(email);
  if (!localUser) return null;
  return resolveTenantAccessByUserId(localUser.id);
}

// server/_core/context.ts
init_supabase_server();
var DEV_USER = {
  id: 1,
  openId: "dev-local",
  name: "Administrador (dev)",
  email: "dev@ollclin.local",
  loginMethod: "dev",
  role: "admin",
  organizationId: 1,
  createdAt: /* @__PURE__ */ new Date(),
  updatedAt: /* @__PURE__ */ new Date(),
  lastSignedIn: /* @__PURE__ */ new Date()
};
function devAuthEnabled() {
  return process.env.ALLOW_DEV_AUTH === "true" && process.env.NODE_ENV !== "production";
}
function getBearerToken(req) {
  const header = req.headers?.authorization;
  if (typeof header !== "string") return null;
  const [scheme, token] = header.split(" ");
  if (!token || scheme?.toLowerCase() !== "bearer") return null;
  const trimmed = token.trim();
  return trimmed || null;
}
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  if (!user) {
    const bearerToken = getBearerToken(opts.req);
    if (bearerToken) {
      try {
        user = await resolveUserFromSupabaseAccessToken(bearerToken);
      } catch (error) {
        console.warn(
          "[Auth] Falha ao resolver usu\xE1rio do Supabase:",
          error instanceof Error ? error.message : error
        );
      }
    }
  }
  if (!user && devAuthEnabled()) {
    user = DEV_USER;
  }
  let isOwner = false;
  let areaPermissions;
  if (user) {
    const tenant = user.openId === DEV_USER.openId ? { organizationId: DEV_USER.organizationId, role: DEV_USER.role } : await resolveTenantAccessByEmail(user.email);
    if (tenant) {
      user = {
        ...user,
        organizationId: tenant.organizationId,
        role: tenant.role
      };
    }
    if (user.organizationId && user.openId !== DEV_USER.openId) {
      try {
        const admin = getSupabaseAdmin();
        const local = await admin.from("users").select("id, is_owner").ilike("email", user.email ?? "").limit(1).maybeSingle();
        if (local.data) {
          isOwner = Boolean(local.data.is_owner);
          const { data: perms } = await admin.from("member_permissions").select("area_key, access_level").eq("organization_id", user.organizationId).eq("user_id", local.data.id);
          if (perms) {
            areaPermissions = {};
            for (const row of perms) {
              areaPermissions[row.area_key] = row.access_level === "full" ? "full" : row.access_level === "partial" ? "partial" : "none";
            }
          }
        }
      } catch (error) {
        console.warn(
          "[Auth] Falha ao carregar permiss\xF5es granulares:",
          error instanceof Error ? error.message : error
        );
      }
    }
  }
  return {
    req: opts.req,
    res: opts.res,
    user,
    isOwner,
    areaPermissions
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js"
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
function vitePluginPublicPlatformConfig() {
  return {
    name: "manus-public-platform-config",
    configureServer(server) {
      server.middlewares.use("/api/platform/config.js", (_req, res) => {
        res.setHeader("Content-Type", "application/javascript");
        res.setHeader("Cache-Control", "no-store");
        res.end(publicPlatformScript());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "api/platform/config.js", source: publicPlatformScript() });
    }
  };
}
var plugins = [vitePluginPublicPlatformConfig(), react(), tailwindcss(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.get("/404", (_req, res) => {
    res.status(404).sendFile(path2.resolve(distPath, "index.html"));
  });
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/routes/google-calendar.ts
function agendaRedirect(params) {
  const url = new URL(`${getGoogleConfig().publicUrl}/agenda`);
  for (const [key2, value] of Object.entries(params)) {
    url.searchParams.set(key2, value);
  }
  return url.toString();
}
function friendlyError(error) {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  console.error("[Google Calendar] Falha no callback:", message);
  return message.slice(0, 300);
}
function registerGoogleCalendarRoutes(app) {
  app.get("/api/google-calendar/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      const message = error === "access_denied" ? "Acesso ao Google Calendar n\xE3o foi autorizado." : `Erro do Google: ${String(error).slice(0, 120)}`;
      res.redirect(agendaRedirect({ google_error: message }));
      return;
    }
    if (!code || typeof code !== "string") {
      res.redirect(
        agendaRedirect({ google_error: "C\xF3digo de autoriza\xE7\xE3o n\xE3o fornecido." })
      );
      return;
    }
    if (!state || typeof state !== "string") {
      res.redirect(agendaRedirect({ google_error: "State OAuth ausente." }));
      return;
    }
    try {
      const owner = verifyOAuthState(state);
      const caps = await getSchemaCapabilities();
      if (!caps.googleCalendar) {
        throw new Error(MIGRATION_0004_HINT);
      }
      const tokens = await exchangeCode(code);
      if (!tokens.access_token) {
        throw new Error("O Google n\xE3o retornou um access token.");
      }
      await googleCalendarModel.saveTokens({
        organizationId: owner.organizationId,
        userId: owner.userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
        scope: tokens.scope
      });
      await writeAuditLog({
        organizationId: owner.organizationId,
        userId: owner.userId,
        action: "CREATE",
        entity: "google_calendar_account",
        newValues: { connected: true, scope: tokens.scope ?? null },
        request: req
      });
      res.redirect(agendaRedirect({ google_connected: "true" }));
    } catch (err) {
      res.redirect(agendaRedirect({ google_error: friendlyError(err) }));
    }
  });
}

// server/lib/provisioning.ts
init_provisioning_model();
var INVITE_EXPIRY_HOURS = 72;
async function provisionTenant(input, req) {
  const email = input.buyerEmail.trim().toLowerCase();
  let organizationId;
  let created = false;
  const existing = await findOrganizationByGatewayRef(
    input.gatewayCustomerId ?? null,
    input.gatewaySubscriptionId ?? null
  );
  if (existing) {
    await setOrganizationStatus(existing.id, "active");
    organizationId = existing.id;
  } else {
    const orgName = input.organizationName?.trim() || input.buyerName?.trim() || email.split("@")[0].replace(/[._-]/g, " ");
    organizationId = await createProvisionedOrganization({
      name: orgName,
      email,
      planKey: input.planKey,
      provider: input.provider,
      gatewayCustomerId: input.gatewayCustomerId ?? null,
      gatewaySubscriptionId: input.gatewaySubscriptionId ?? null
    });
    created = true;
  }
  let localUserId = await findLocalUserIdByEmail(email);
  if (localUserId) {
    await upsertMembership({
      organizationId,
      userId: localUserId,
      role: "owner",
      status: "active"
    });
  } else {
    localUserId = await createLocalUser({
      email,
      name: input.buyerName?.trim() || email.split("@")[0],
      organizationId,
      role: "owner",
      isOwner: true
    });
    await upsertMembership({
      organizationId,
      userId: localUserId,
      role: "owner",
      status: "active"
    });
  }
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 36e5);
  await createInvitation({
    organizationId,
    email,
    role: "owner",
    type: "owner_activation",
    expiresAt,
    invitedBy: localUserId,
    tokenHash
  });
  const base = process.env.PUBLIC_URL || PUBLIC_URL_FALLBACK;
  const linkUrl = `${base}/primeiro-acesso?token=${encodeURIComponent(token)}`;
  let invitationSent = false;
  try {
    const org = created ? { name: input.organizationName ?? "" } : null;
    await getEmailService().sendInvitationEmail({
      to: email,
      linkUrl,
      organizationName: org?.name ?? "",
      role: "owner",
      expiresInHours: INVITE_EXPIRY_HOURS
    });
    invitationSent = true;
  } catch (error) {
    console.error(
      "[Provisionamento] Falha ao enviar e-mail de ativa\xE7\xE3o:",
      error instanceof Error ? error.message : error
    );
  }
  await writeAuditLog({
    organizationId,
    userId: localUserId,
    action: "CREATE",
    entity: "tenant_provisioning",
    entityId: organizationId,
    newValues: {
      provider: input.provider,
      eventId: input.eventId,
      planKey: input.planKey,
      created,
      invitationSent,
      expiresAt: expiresAt.toISOString()
    },
    request: req ?? void 0
  });
  return { organizationId, created, invitationSent };
}
async function suspendTenantByGatewayRef(gatewayCustomerId, gatewaySubscriptionId, reason, req) {
  const org = await findOrganizationByGatewayRef(gatewayCustomerId, gatewaySubscriptionId);
  if (!org) return false;
  await setOrganizationStatus(org.id, "suspended");
  await writeAuditLog({
    organizationId: org.id,
    action: "UPDATE",
    entity: "tenant_suspension",
    entityId: org.id,
    newValues: { status: "suspended", reason },
    request: req ?? void 0
  });
  return true;
}

// server/routes/payments.ts
var OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "OllCLin Payments API",
    version: "1.0.0",
    description: "API de pagamentos do OllCLin para integra\xE7\xE3o com maquininhas de cart\xE3o e adquirentes. Valores sempre em centavos (BRL). Autentica\xE7\xE3o via Bearer JWT do Supabase (service) ou assinatura HMAC no webhook. Nenhum dado de cart\xE3o (PAN/CVV) transita ou \xE9 armazenado \u2014 somente tokens da adquirente (PCI-DSS SAQ-A).",
    contact: { name: "OllCLin", email: "dev@ollclin.local" }
  },
  servers: [{ url: "{publicUrl}/api/payments", variables: { publicUrl: { default: "http://localhost:3000" } } }],
  paths: {
    "/v1/payments/intents": {
      post: {
        summary: "Cria inten\xE7\xE3o de pagamento",
        description: "Idempotente via header `Idempotency-Key`. Retorna o estado atual da inten\xE7\xE3o.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreatePaymentIntent" }
            }
          }
        },
        responses: {
          "201": { description: "Criada", content: { "application/json": { schema: { $ref: "#/components/schemas/PaymentIntent" } } } },
          "409": { description: "Idempot\xEAncia: j\xE1 existe (retorna a inten\xE7\xE3o original)" }
        }
      }
    },
    "/v1/payments/{id}": {
      get: {
        summary: "Consulta pagamento",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/PaymentIntent" } } } },
          "404": { description: "N\xE3o encontrado" }
        }
      }
    },
    "/v1/payments/{id}/cancel": {
      post: {
        summary: "Cancela pagamento autorizado (antes da captura)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Cancelado" } }
      }
    },
    "/v1/payments/{id}/refund": {
      post: {
        summary: "Estorna total ou parcialmente um pagamento capturado",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { amountCents: { type: "integer", minimum: 1, description: "Omitir = estorno total" } }
              }
            }
          }
        },
        responses: { "200": { description: "Estornado (total ou parcial)" } }
      }
    },
    "/v1/payments/{id}/transactions": {
      get: {
        summary: "Hist\xF3rico de transi\xE7\xF5es de estado",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } }
      }
    },
    "/v1/payments/webhooks/{provider}": {
      post: {
        summary: "Webhook de adquirente",
        description: "Validado por assinatura HMAC-SHA256 no header `x-signature`. Deduplicado por `event_id`. Estados aceitos: authorized, captured, failed, cancelled, refunded.",
        parameters: [{ name: "provider", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "200": { description: "Recebido" }, "401": { description: "Assinatura inv\xE1lida" } }
      }
    }
  },
  components: {
    schemas: {
      CreatePaymentIntent: {
        type: "object",
        required: ["amountCents", "method", "referenceType", "referenceId"],
        properties: {
          amountCents: { type: "integer", minimum: 1, description: "Valor em centavos (ex.: R$ 150,00 = 15000)" },
          method: { type: "string", enum: ["card_credit", "card_debit", "pix", "cash", "voucher"] },
          installments: { type: "integer", minimum: 1, maximum: 24, default: 1 },
          capture: { type: "boolean", default: true },
          cardToken: { type: "string", description: "Token do cart\xE3o gerado pela adquirente (nunca PAN)" },
          referenceType: { type: "string", enum: ["sale", "revenue", "appointment"] },
          referenceId: { type: "integer" }
        }
      },
      PaymentIntent: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["created", "pending", "authorized", "captured", "failed", "cancelled", "refunded", "partially_refunded"] },
          amountCents: { type: "integer" },
          currency: { type: "string", enum: ["BRL"] },
          method: { type: "string" },
          installments: { type: "integer" },
          providerName: { type: "string" },
          providerTransactionId: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      }
    }
  }
};
var DOCS_HTML = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>OllCLin Payments API</title>
<style>body{font-family:system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#172022}
h1{color:#075e63}code,pre{background:#f1f5f4;border-radius:6px;padding:2px 6px}pre{padding:12px;overflow-x:auto}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #d9e0df;padding:6px 10px;text-align:left}</style>
</head><body>
<h1>OllCLin Payments API</h1>
<p>Contrato OpenAPI 3.1 para integra\xE7\xE3o com maquininhas de cart\xE3o.</p>
<p>Baixe o spec: <code><a href="/api/payments/openapi.json">/api/payments/openapi.json</a></code></p>
<h2>Endpoints</h2>
<table>
<tr><th>M\xE9todo</th><th>Rota</th><th>Descri\xE7\xE3o</th></tr>
<tr><td>POST</td><td>/v1/payments/intents</td><td>Cria inten\xE7\xE3o de pagamento (idempotente)</td></tr>
<tr><td>GET</td><td>/v1/payments/{id}</td><td>Consulta status</td></tr>
<tr><td>POST</td><td>/v1/payments/{id}/cancel</td><td>Cancela antes da captura</td></tr>
<tr><td>POST</td><td>/v1/payments/{id}/refund</td><td>Estorno total/parcial</td></tr>
<tr><td>GET</td><td>/v1/payments/{id}/transactions</td><td>Hist\xF3rico de estados</td></tr>
<tr><td>POST</td><td>/v1/payments/webhooks/{provider}</td><td>Webhook assinado (HMAC)</td></tr>
</table>
<h2>Estados</h2>
<p><code>created \u2192 pending \u2192 authorized \u2192 captured</code>; falhas: <code>failed</code>, <code>cancelled</code>; p\xF3s-captura: <code>refunded</code>, <code>partially_refunded</code>.</p>
<h2>Seguran\xE7a</h2>
<ul><li>Valores em <b>centavos</b> (inteiros) \u2014 nunca float.</li>
<li>Nenhum PAN/CVV armazenado \u2014 apenas tokens da adquirente (PCI SAQ-A).</li>
<li>Webhook validado por HMAC-SHA256 (<code>x-signature</code>) + dedupe por <code>event_id</code>.</li>
<li>Isolamento total por <code>organization_id</code> (RLS + service role).</li></ul>
</body></html>`;
function registerPaymentRoutes(app) {
  app.get("/api/payments/openapi.json", (_req, res) => {
    res.json(OPENAPI_SPEC);
  });
  app.get("/api/payments/docs", (_req, res) => {
    res.type("text/html").send(DOCS_HTML);
  });
  app.post("/api/payments/webhooks/:provider", async (req, res) => {
    const provider = String(req.params.provider ?? "").toLowerCase();
    const signature = String(req.headers["x-signature"] ?? "");
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    if (!activePaymentProvider.verifyWebhookSignature(rawBody, signature)) {
      res.status(401).json({ error: "Assinatura inv\xE1lida" });
      return;
    }
    const payload = typeof req.body === "object" && req.body !== null ? req.body : {};
    const eventId = String(payload.event_id ?? `evt_${Date.now()}`);
    const providerTransactionId = payload.transaction_id ? String(payload.transaction_id) : null;
    const toStatus = payload.status ? String(payload.status) : null;
    const inserted = await paymentModel.recordWebhookEvent({
      organizationId: 0,
      // resolvido pelo provider real em produção
      providerName: provider,
      eventId,
      payload
    });
    if (!inserted) {
      res.json({ received: true, duplicated: true });
      return;
    }
    const planKey = payload.plan_key ? String(payload.plan_key) : null;
    const buyerEmail = payload.buyer_email ? String(payload.buyer_email) : null;
    if (planKey && buyerEmail) {
      try {
        if (toStatus === "captured" || toStatus === "authorized") {
          const result = await provisionTenant(
            {
              provider,
              eventId,
              buyerEmail,
              buyerName: payload.buyer_name ? String(payload.buyer_name) : null,
              organizationName: payload.organization_name ? String(payload.organization_name) : null,
              planKey,
              gatewayCustomerId: payload.customer_id ? String(payload.customer_id) : null,
              gatewaySubscriptionId: payload.subscription_id ? String(payload.subscription_id) : null
            },
            req
          );
          res.json({ received: true, provisioned: result });
          return;
        }
        if (["failed", "cancelled", "refunded"].includes(toStatus ?? "")) {
          const suspended = await suspendTenantByGatewayRef(
            payload.customer_id ? String(payload.customer_id) : null,
            payload.subscription_id ? String(payload.subscription_id) : null,
            `webhook:${provider}:${toStatus}`,
            req
          );
          res.json({ received: true, suspended });
          return;
        }
      } catch (error) {
        console.error(
          "[Webhook] Falha no provisionamento:",
          error instanceof Error ? error.message : error
        );
        res.status(500).json({ received: true, error: "provisioning_failed" });
        return;
      }
    }
    if (providerTransactionId && toStatus) {
      const intent = await paymentModel.findByIdempotencyKey(
        `payment:webhook:${provider}:${providerTransactionId}`
      );
      if (intent) {
        await paymentModel.updateStatus({
          id: intent.id,
          organizationId: intent.organizationId,
          fromStatus: intent.status,
          toStatus,
          payload: { webhook: eventId }
        });
      }
    }
    await writeAuditLog({
      organizationId: null,
      userId: null,
      action: "UPDATE",
      entity: "payment_webhook",
      newValues: { provider, eventId },
      request: req
    });
    res.json({ received: true });
  });
}

// server/_core/index.ts
init_supabase_server();

// server/services/google-sync.worker.ts
var GOOGLE_SYNC_BACKOFF_BASE_MS = 3e4;
var GOOGLE_SYNC_BACKOFF_MAX_MS = 24 * 60 * 60 * 1e3;
async function claimDueJobs(limit = 10) {
  const jobs = await googleCalendarSyncModel.findDueJobs(limit);
  const claimed = [];
  for (const job of jobs) {
    const current = await googleCalendarSyncModel.findById(job.id);
    if (!current || current.status !== "pending") continue;
    const updated = await googleCalendarSyncModel.updateJobStatus(current.id, "processing", {
      attempts: current.attempts + 1
    });
    if (updated) claimed.push(updated);
  }
  return claimed;
}
function nextAttemptAt(attempts) {
  const backoffMs = Math.min(
    GOOGLE_SYNC_BACKOFF_BASE_MS * Math.pow(2, Math.max(attempts - 1, 0)),
    GOOGLE_SYNC_BACKOFF_MAX_MS
  );
  return new Date(Date.now() + backoffMs).toISOString();
}
async function findAppointmentForJob(job) {
  return appointmentModel.findById(job.appointmentId, job.organizationId);
}
async function processSyncJob(job) {
  const appointment = await findAppointmentForJob(job);
  switch (job.operation) {
    case "create":
    case "update": {
      if (!appointment) {
        return { status: "skipped" };
      }
      return syncAppointmentForUser(appointment, job.userId);
    }
    case "delete": {
      if (!appointment) {
        return { status: "skipped" };
      }
      return removeAppointmentForUser(appointment, job.userId);
    }
    case "pull":
    case "reconcile": {
      const from = typeof job.payload?.from === "string" ? job.payload.from : null;
      const to = typeof job.payload?.to === "string" ? job.payload.to : null;
      if (!from || !to) {
        return { status: "skipped" };
      }
      return pullGoogleRangeForUser({
        organizationId: job.organizationId,
        userId: job.userId,
        from,
        to
      });
    }
    default:
      throw new Error(`[google_sync] Opera\xE7\xE3o desconhecida: ${String(job.operation)}`);
  }
}
async function processDueSyncJobs(options = {}) {
  const limit = options.limit ?? 10;
  const jobs = await claimDueJobs(limit);
  const results = [];
  for (const job of jobs) {
    const base = {
      jobId: job.id,
      appointmentId: job.appointmentId,
      userId: job.userId,
      operation: job.operation
    };
    try {
      const result = await processSyncJob(job);
      await googleCalendarSyncModel.updateJobStatus(job.id, "done", { lastError: null });
      results.push({ ...base, status: "done", result });
    } catch (error) {
      const attempts = (job.attempts ?? 0) + 1;
      const message = error instanceof Error ? error.message : "Erro desconhecido no worker";
      await googleCalendarSyncModel.updateJobStatus(job.id, "failed", {
        attempts,
        nextAttemptAt: nextAttemptAt(attempts),
        lastError: message
      });
      results.push({ ...base, status: "failed", error: message });
    }
  }
  return { processed: results.length, results };
}
var workerTimer = null;
function startGoogleSyncWorker(intervalMs = 15e3) {
  if (workerTimer) return () => void 0;
  workerTimer = setInterval(() => {
    void processDueSyncJobs().catch((error) => {
      console.error("[google_sync] Falha no worker de sincroniza\xE7\xE3o:", error);
    });
  }, intervalMs);
  workerTimer.unref?.();
  return () => {
    if (workerTimer) {
      clearInterval(workerTimer);
      workerTimer = null;
    }
  };
}

// server/_core/index.ts
async function createApp() {
  const app = express2();
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/health/db", async (_req, res) => {
    const result = await checkSupabaseConnection();
    res.status(result.ok ? 200 : 503).json(result);
  });
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  app.get("/manus-routes.json", (_req, res) => {
    const routesPath = join(process.cwd(), "public", "manus-routes.json");
    if (!existsSync(routesPath)) {
      res.status(404).json({ routes: [] });
      return;
    }
    res.type("application/json").send(readFileSync(routesPath, "utf8"));
  });
  registerOAuthRoutes(app);
  registerGoogleCalendarRoutes(app);
  registerPaymentRoutes(app);
  if (!process.env.VERCEL) startGoogleSyncWorker();
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (!process.env.VERCEL) {
    const server = createServer(app);
    if (process.env.NODE_ENV !== "production") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }
  }
  return app;
}
async function startServer() {
  const app = await createApp();
  const server = createServer(app);
  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", (error) => {
    console.error("Server failed:", error.message);
    process.exit(1);
  });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}
if (!process.env.VERCEL) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
export {
  createApp
};
