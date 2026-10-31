/**
 * OllCLin - Capacidades do schema (rollout seguro de migrações)
 *
 * A migração 0003 adiciona colunas e tabelas usadas pelos módulos financeiros.
 * Enquanto ela não é aplicada, as telas antigas (Profissionais, Receitas)
 * precisam continuar funcionando e os módulos novos precisam falhar com uma
 * mensagem clara — em vez de estourar um erro cru do PostgREST.
 *
 * As sondagens são feitas uma única vez por processo e ficam em cache.
 */

import { getSupabaseAdmin } from "./supabase-server";

export type SchemaCapabilities = {
  /** professionals.commission_percentage */
  professionalCommission: boolean;
  /** revenues.professional_id / revenues.location_id */
  revenueLinks: boolean;
  /** Tabelas sales, payouts e receipts (migração 0003) */
  financeModules: boolean;
};

const MISSING_TABLE_CODES = new Set(["PGRST205", "42P01"]);
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);

function errorCode(error: { code?: string } | null): string {
  return error?.code ?? "";
}

/** A coluna existe? Erros que não indicam ausência contam como "existe". */
async function columnExists(table: string, column: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin().from(table).select(column).limit(1);
  if (!error) return true;
  return !MISSING_COLUMN_CODES.has(errorCode(error));
}

/** A tabela existe? */
async function tableExists(table: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin().from(table).select("id").limit(1);
  if (!error) return true;
  return !MISSING_TABLE_CODES.has(errorCode(error));
}

async function detect(): Promise<SchemaCapabilities> {
  const [professionalCommission, revenueLinks, sales, payouts, receipts] =
    await Promise.all([
      columnExists("professionals", "commission_percentage"),
      columnExists("revenues", "professional_id"),
      tableExists("sales"),
      tableExists("payouts"),
      tableExists("receipts"),
    ]);

  return {
    professionalCommission,
    revenueLinks,
    financeModules: sales && payouts && receipts,
  };
}

let cached: Promise<SchemaCapabilities> | null = null;
let cachedAt = 0;

/** Por quanto tempo a detecção fica memorizada (ms). */
const CACHE_TTL_MS = 60_000;

/**
 * Lê (e memoriza por 60s) as capacidades do schema atual. O TTL curto permite
 * aplicar a migração 0003 com o servidor rodando: a próxima operação já
 * enxerga as novas colunas/tabelas.
 */
export function getSchemaCapabilities(): Promise<SchemaCapabilities> {
  if (!cached || Date.now() - cachedAt > CACHE_TTL_MS) {
    cached = detect();
    cachedAt = Date.now();
  }
  return cached;
}

/** Limpa o cache (usado após aplicar uma migração em tempo de execução). */
export function resetSchemaCapabilities(): void {
  cached = null;
  cachedAt = 0;
}

export const MIGRATION_0003_HINT =
  "Módulo financeiro indisponível: aplique a migração drizzle/migrations/0003_financeiro_completo.sql no Supabase (SQL Editor).";

export const MIGRATION_0003_FIELDS_HINT =
  "Recurso indisponível: aplique a migração drizzle/migrations/0003_financeiro_completo.sql no Supabase (SQL Editor).";

/** Garante que as tabelas da migração 0003 existem. */
export async function requireFinanceModules(): Promise<void> {
  const caps = await getSchemaCapabilities();
  if (!caps.financeModules) throw new Error(MIGRATION_0003_HINT);
}

/**
 * Envolve um model inteiro com a checagem de migração.
 *
 * Cada método público dos módulos financeiros passa a falhar com
 * `MIGRATION_0003_HINT` enquanto as tabelas não existirem. Chamadas internas
 * (`this.outroMetodo`) continuam no objeto original, então a chave é verificada
 * apenas uma vez por operação.
 */
export function financeGuarded<T extends object>(model: T): T {
  const wrapped: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(model)) {
    if (typeof value !== "function") {
      wrapped[name] = value;
      continue;
    }
    wrapped[name] = async function (...args: unknown[]) {
      await requireFinanceModules();
      return (value as (...innerArgs: unknown[]) => unknown).apply(model, args);
    };
  }
  return wrapped as T;
}
