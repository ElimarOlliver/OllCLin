/**
 * OllCLin - Regras de campos obrigatórios do paciente (REQ-05-015..019)
 *
 * A clínica escolhe quais campos do cadastro de paciente são obrigatórios em
 * Configurações > Gerais. Antes deste helper a configuração só era exibida;
 * agora ela é aplicada de verdade na criação e na atualização do paciente.
 *
 * O campo Nome nunca pode ser desabilitado (REQ-05-019).
 */

import { getSupabaseAdmin } from "./supabase-server";

/** Campos que podem ser configurados como obrigatórios. */
export const PATIENT_FIELD_LABELS: Record<string, string> = {
  fullName: "Nome completo",
  cpf: "CPF",
  rg: "RG",
  birthDate: "Data de nascimento",
  gender: "Gênero",
  phone: "Telefone",
  email: "E-mail",
  address: "Endereço",
  emergencyContact: "Contato de emergência",
};

export type PatientFieldKey = keyof typeof PATIENT_FIELD_LABELS;

/** REQ-05-019: Nome é sempre obrigatório. */
export const ALWAYS_REQUIRED_FIELDS: readonly PatientFieldKey[] = ["fullName"];

/** Estado padrão (usado quando a clínica ainda não salvou a configuração). */
export const DEFAULT_PATIENT_FIELDS: Record<PatientFieldKey, boolean> = {
  fullName: true,
  cpf: false,
  rg: false,
  birthDate: false,
  gender: false,
  phone: false,
  email: false,
  address: false,
  emergencyContact: false,
};

/**
 * Lê a configuração salva em org_settings e devolve sempre um objeto completo
 * (todos os campos conhecidos), com Nome forçado a `true`.
 */
export async function getRequiredPatientFields(
  organizationId: number,
): Promise<Record<PatientFieldKey, boolean>> {
  const { data, error } = await getSupabaseAdmin()
    .from("org_settings")
    .select("required_patient_fields")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao consultar campos obrigatórios: ${error.message}`);
  }

  const stored =
    (data?.required_patient_fields as Record<string, boolean> | null) ?? {};

  const merged = { ...DEFAULT_PATIENT_FIELDS };
  for (const key of Object.keys(merged) as PatientFieldKey[]) {
    if (key in stored) merged[key] = stored[key];
  }
  for (const always of ALWAYS_REQUIRED_FIELDS) merged[always] = true;
  return merged;
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

/**
 * Devolve os rótulos dos campos obrigatórios que estão vazios.
 * Recebe os dados já mesclados (no update: registro atual + alterações), de
 * modo que um campo obrigatório também não possa ser apagado depois.
 */
export function missingRequiredPatientFields(
  required: Record<string, boolean>,
  data: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  for (const [field, label] of Object.entries(PATIENT_FIELD_LABELS)) {
    if (!required[field]) continue;
    if (isBlank(data[field])) missing.push(label);
  }
  return missing;
}

/** Mensagem única pronta para o formulário/TRPCError. */
export function requiredFieldsMessage(missing: string[]): string {
  if (missing.length === 0) return "";
  const list = missing.join(", ");
  return missing.length === 1
    ? `O campo ${list} é obrigatório`
    : `Preencha os campos obrigatórios: ${list}`;
}
