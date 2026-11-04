/**
 * OllCLin - Servico de Importacao e Exportacao de Dados (Fase 3 - SaaS)
 *
 * Pipeline de importacao (OllCLin -> arquivo externo):
 *   Upload (base64 via tRPC) -> armazenamento privado -> deteccao ->
 *   leitura (CSV/TSV via d3-dsv) -> mapeamento de colunas -> validacao ->
 *   preview -> confirmacao -> persistencia.
 *
 * Exportacao: CSV UTF-8 com BOM gerado no servidor a partir dos agendamentos
 * do tenant, com filtros opcionais.
 */

import { csvParse, tsvParse } from "d3-dsv";
import { getSupabaseAdmin } from "../lib/supabase-server";
import { writeAuditLog } from "../lib/audit";
import { patientModel } from "../models/patient.model";
import { appointmentModel } from "../models/appointment.model";
import { importBatchModel, type ImportBatchRecord } from "../models/import.model";

export type ImportConsentStatus = "pending" | "withdrawn";

export type ImportPatientRow = {
  fullName: string;
  socialName: string | null;
  cpf: string | null;
  rg: string | null;
  birthDate: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  consentDataSharing: boolean;
  consentMarketing: boolean;
  isMinor: boolean;
  guardianPatientId: number | null;
  guardianName: string | null;
  guardianDocument: string | null;
  consentStatus: string;
};

export type ImportRowError = { row: number; field?: string; message: string };

export type ImportPreview = {
  batchId: number | null;
  fileName: string;
  fileType: string;
  status: string;
  columns: string[];
  rows: ImportPatientRow[];
  errors: ImportRowError[];
  totalRows: number;
  validRows: number;
  rejectedRows: number;
};

const ALLOWED_IMPORT_TYPES = ["csv", "tsv", "txt"];

const CANONICAL_FIELDS = [
  "fullName",
  "socialName",
  "cpf",
  "rg",
  "birthDate",
  "gender",
  "phone",
  "email",
  "address",
  "city",
  "state",
  "zipCode",
  "emergencyContact",
  "emergencyPhone",
  "guardianName",
  "guardianDocument",
] as const;

type CanonicalField = (typeof CANONICAL_FIELDS)[number];

const FIELD_ALIASES: Record<string, CanonicalField> = {
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
  guardiancpf: "guardianDocument",
};

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toImportRow(columns: string[], raw: Record<string, unknown>): ImportPatientRow {
  const mapped: Record<string, unknown> = {};
  for (const column of columns) {
    const canonical = FIELD_ALIASES[normalizeKey(column)];
    if (canonical) mapped[canonical] = raw[column];
  }

  const fullName = text(mapped.fullName as string) ?? text(mapped.patientName as string) ?? "";
  const birthDate = text(mapped.birthDate as string) ?? text(mapped.dob as string) ?? null;
  const isMinor = isMinorByBirthDate(birthDate);

  return {
    fullName,
    socialName: text(mapped.socialName as string),
    cpf: text(mapped.cpf as string),
    rg: text(mapped.rg as string) ?? text(mapped.documento as string),
    birthDate,
    gender: text(mapped.gender as string),
    phone: text(mapped.phone as string) ?? text(mapped.celular as string),
    email: text(mapped.email as string),
    address: text(mapped.address as string),
    city: text(mapped.city as string),
    state: text(mapped.state as string),
    zipCode: text(mapped.zipCode as string) ?? text(mapped.cep as string),
    emergencyContact: text(mapped.emergencyContact as string),
    emergencyPhone: text(mapped.emergencyPhone as string) ?? text(mapped.telefone as string),
    consentDataSharing: Boolean(mapped.consentDataSharing ?? mapped.consent ?? false),
    consentMarketing: Boolean(mapped.consentMarketing ?? mapped.consent ?? false),
    isMinor,
    guardianPatientId: null,
    guardianName: text(mapped.guardianName as string) ?? text(mapped.responsavel as string),
    guardianDocument: text(mapped.guardianDocument as string) ?? text(mapped.cpfResponsavel as string),
    consentStatus: text(mapped.consentStatus as string) ?? "pending",
  };
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function isCpfValid(value: string): boolean {
  return /^\d{11}$/.test(value);
}

function isMinorByBirthDate(birthDate: string | null): boolean {
  if (!birthDate) return false;
  const date = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) age -= 1;
  return age < 18;
}

function validateImportRow(row: ImportPatientRow): { valid: boolean; error?: ImportRowError } {
  if (!row.fullName) {
    return { valid: false, error: { row: 0, field: "fullName", message: "Nome completo é obrigatório." } };
  }
  if (row.cpf && !isCpfValid(row.cpf)) {
    return { valid: false, error: { row: 0, field: "cpf", message: "CPF inválido." } };
  }
  if (row.birthDate && !isValidDate(row.birthDate)) {
    return { valid: false, error: { row: 0, field: "birthDate", message: "Data de nascimento inválida." } };
  }
  if (row.isMinor && (!row.guardianName || !row.guardianDocument)) {
    return { valid: false, error: { row: 0, field: "guardian", message: "Responsável é obrigatório para menor de idade." } };
  }
  return { valid: true };
}

/**
 * Faz o parse do conteúdo do arquivo (CSV/TSV/TXT) e normaliza as linhas.
 */
export function parseImportContent(input: {
  fileName: string;
  fileType: string;
  content: string;
}): Omit<ImportPreview, "batchId" | "status"> {
  const fileTypeNormalized = input.fileType.toLowerCase();
  if (!ALLOWED_IMPORT_TYPES.includes(fileTypeNormalized)) {
    throw new Error(
      `Formato não suportado nesta fase da Fase 3: ${input.fileType}. Suportados: CSV, TSV e TXT.`,
    );
  }

  const parsed = (fileTypeNormalized === "tsv" ? tsvParse(input.content) : csvParse(input.content)) as unknown as Array<Record<string, string>>;
  const columns = parsed.length > 0 ? Object.keys(parsed[0]) : [];
  const rawRows = parsed;

  const rows: ImportPatientRow[] = [];
  const errors: ImportRowError[] = [];

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 1;
    const row = toImportRow(columns, raw as Record<string, unknown>);
    const result = validateImportRow(row);
    if (result.valid) {
      rows.push(row);
    } else {
      errors.push({ row: rowNumber, field: result.error?.field, message: result.error?.message ?? "Linha inválida." });
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
    rejectedRows: errors.length,
  };
}

/** Armazena o arquivo de importação em bucket privado (Supabase Storage). */
export async function storeImportFile(input: {
  organizationId: number;
  userId: number;
  fileName: string;
  fileType: string;
  content: string;
}): Promise<string> {
  const supabase = getSupabaseAdmin();
  const bucketName = "patient_imports";
  await supabase.storage.createBucket(bucketName);
  const path = `imports/${input.organizationId}/${input.userId}/${input.fileName}`;
  const { error } = await supabase.storage.from(bucketName).upload(path, input.content, { upsert: true });
  if (error) throw new Error(`Falha ao armazenar arquivo de importação: ${error.message}`);
  return path;
}

/** Cria um lote de importação a partir do conteúdo do arquivo. */
export async function createImportBatch(input: {
  organizationId: number;
  userId: number;
  fileName: string;
  fileType: string;
  content: string;
}): Promise<ImportPreview> {
  const preview = parseImportContent(input);
  const errors: Record<string, unknown> = {};
  for (const error of preview.errors) errors[String(error.row)] = error;

  await storeImportFile({
    organizationId: input.organizationId,
    userId: input.userId,
    fileName: input.fileName,
    fileType: input.fileType,
    content: input.content,
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
    fileContent: input.content,
  });
  if (!batch) throw new Error("Falha ao registrar lote de importação");

  const batchId = batch.id;
  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: "CREATE",
    entity: "import_batch",
    newValues: { fileName: input.fileName, fileType: input.fileType, status: "preview", totalRows: preview.totalRows, validRows: preview.validRows, rejectedRows: preview.rejectedRows },
  });

  return { ...preview, batchId, status: "preview" };
}

/** Confirma a importação do lote (aplica as linhas validadas). */
export async function confirmImportBatch(input: {
  batchId: number;
  organizationId: number;
  userId: number;
}): Promise<{ batchId: number; status: string; importedRows: number; rejectedRows: number }> {
  const batch = await importBatchModel.findById(input.batchId);
  if (!batch) throw new Error("Falha ao buscar lote de importação");
  if (batch.organizationId !== input.organizationId) {
    throw new Error("Acesso negado para este lote de importação");
  }
  const status = batch.status;
  if (status !== "preview") {
    return { batchId: input.batchId, status, importedRows: batch.importedRows, rejectedRows: batch.rejectedRows };
  }

  const content = batch.fileContent ?? "";
  if (!content.trim()) {
    throw new Error("Conteúdo do arquivo de importação não está disponível. Reenvie o arquivo.");
  }
  const preview = parseImportContent({
    fileName: batch.fileName,
    fileType: batch.fileType,
    content,
  });

  let importedRows = 0;
  let rejectedRows = preview.errors.length;
  for (const row of preview.rows) {
    if (row.cpf) {
      const exists = await patientModel.existsByCpf(row.cpf, input.organizationId);
      if (exists) {
        // CPF já cadastrado no tenant: não sobrescreve, apenas rejeita a linha.
        rejectedRows += 1;
        continue;
      }
    }
    await patientModel.create({
      organizationId: input.organizationId,
      fullName: row.fullName,
      socialName: row.socialName ?? undefined,
      cpf: row.cpf ?? undefined,
      rg: row.rg ?? undefined,
      birthDate: row.birthDate ?? undefined,
      gender: (row.gender as "M" | "F" | "O" | undefined) ?? undefined,
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
      address: row.address ?? undefined,
      city: row.city ?? undefined,
      state: row.state ?? undefined,
      zipCode: row.zipCode ?? undefined,
      emergencyContact: row.emergencyContact ?? undefined,
      emergencyPhone: row.emergencyPhone ?? undefined,
      consentDataSharing: row.consentDataSharing,
      consentMarketing: row.consentMarketing,
      isMinor: row.isMinor,
      guardianPatientId: row.guardianPatientId ?? undefined,
      guardianName: row.guardianName ?? undefined,
      guardianDocument: row.guardianDocument ?? undefined,
      consentStatus: row.consentStatus as ImportConsentStatus,
    });
    importedRows += 1;
  }

  const updated = await importBatchModel.update(input.batchId, {
    status: "confirmed",
    imported_rows: importedRows,
    rejected_rows: rejectedRows,
    updated_at: new Date().toISOString(),
  });
  if (!updated) throw new Error("Falha ao atualizar lote de importação");

  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: "CREATE",
    entity: "import_batch",
    entityId: input.batchId,
    newValues: { status: "confirmed", importedRows, rejectedRows },
  });

  return { batchId: input.batchId, status: "confirmed", importedRows, rejectedRows };
}

/** Lista lotes de importação de uma organização. */
export async function listImportBatches(input: {
  organizationId: number;
  limit?: number;
}): Promise<ImportBatchRecord[]> {
  return importBatchModel.findByOrganization(input.organizationId, input.limit ?? 20);
}

/** Gera CSV (UTF-8 com BOM) com histórico de consultas/agendamentos. */
export async function buildAppointmentsExportCsv(input: {
  organizationId: number;
  from?: string;
  to?: string;
  professionalId?: number;
  patientId?: number;
  status?: string;
  procedureId?: number;
}): Promise<string> {
  const appointments = await appointmentModel.findMany({
    organizationId: input.organizationId,
    professionalId: input.professionalId,
    patientId: input.patientId,
    status: input.status,
    startsAtFrom: input.from,
    startsAtTo: input.to,
    limit: 1000,
    offset: 0,
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
    "Observações",
    "Criado em",
  ];

  const escapeCell = (value: string): string => {
    const safe = value ?? "";
    if (/[",\n\r]/.test(safe)) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
  };

  const lines = [header.map(escapeCell).join(",")];
  for (const appointment of appointments) {
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
      appointment.createdAt ?? "",
    ];
    lines.push(row.map(escapeCell).join(","));
  }

  return `\uFEFF${lines.join("\r\n")}`;
}
