/**
 * OllCLin - Camada Model
 * Modelo de dados para lotes de importação/exportação (Fase 3 — SaaS)
 */

import { getSupabaseAdmin } from "../lib/supabase-server";

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

export type ImportBatchRecord = {
  id: number;
  organizationId: number;
  userId: number;
  fileName: string;
  fileType: string;
  status: string;
  totalRows: number;
  importedRows: number;
  rejectedRows: number;
  errors: Record<string, unknown> | null;
  fileContent: string | null;
};

const BATCH_COLUMNS =
  "id, organization_id, user_id, file_name, file_type, status, total_rows, imported_rows, rejected_rows, errors, created_at, updated_at";

export const importBatchModel = {
  async create(input: {
    organizationId: number;
    userId: number;
    fileName: string;
    fileType: string;
    status: string;
    totalRows: number;
    importedRows: number;
    rejectedRows: number;
    errors: Record<string, unknown>;
    fileContent?: string;
  }): Promise<ImportBatchRecord | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("import_batches")
      .insert({
        organization_id: input.organizationId,
        user_id: input.userId,
        file_name: input.fileName,
        file_type: input.fileType,
        status: input.status,
        total_rows: input.totalRows,
        imported_rows: input.importedRows,
        rejected_rows: input.rejectedRows,
        errors: input.errors,
        ...(input.fileContent ? { file_content: input.fileContent } : {}),
      })
      .select(BATCH_COLUMNS)
      .single<Record<string, unknown>>();
    if (error || !data) return null;
    return toBatch(data);
  },

  async update(id: number, patch: Record<string, unknown>): Promise<ImportBatchRecord | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("import_batches")
      .update(patch)
      .eq("id", id)
      .select(BATCH_COLUMNS)
      .single<Record<string, unknown>>();
    if (error || !data) return null;
    return toBatch(data);
  },

  async findById(id: number): Promise<ImportBatchRecord | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("import_batches")
      .select(BATCH_COLUMNS)
      .eq("id", id)
      .maybeSingle<Record<string, unknown>>();
    if (error || !data) return null;
    return toBatch(data);
  },

  async findByOrganization(organizationId: number, limit = 20): Promise<ImportBatchRecord[]> {
    const { data, error } = await getSupabaseAdmin()
      .from("import_batches")
      .select(BATCH_COLUMNS)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 50));
    if (error) return [];
    return (data ?? []).map(toBatch);
  },
};

function toBatch(row: Record<string, unknown>): ImportBatchRecord {
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
    errors: (row.errors ?? null) as Record<string, unknown> | null,
    fileContent: row.file_content ? String(row.file_content) : null,
  };
}
