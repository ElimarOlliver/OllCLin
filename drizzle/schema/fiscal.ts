/**
 * OllCLin — Schema Drizzle do módulo fiscal (FISCAL.md §6).
 *
 * Tabelas isoladas do domínio clínico. Todo registro fiscal tem
 * `organization_id` (a "empresaId" da especificação), sem exceção (R01).
 *
 * Projeto usa MySQL — as proteções do R03 (RLS Supabase) são substituídas por:
 * 1. helper obrigatório `fiscalQuery()` (R02) em server/fiscal/db.ts;
 * 2. verificação de escopo no router tRPC (server/routers/fiscal.ts).
 */

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
  uniqueIndex,
  json,
  bigint,
} from "drizzle-orm/mysql-core";
import { organizations } from "../schema";

/* -------------------------------------------------------------------------- */
/*  EMPRESAS FISCAIS (dados do emitente)                                      */
/* -------------------------------------------------------------------------- */

export const empresasFiscais = mysqlTable(
  "empresas_fiscais",
  {
    id: int("id").autoincrement().primaryKey(),
    /** FK 1:1 com organizations — a "empresaId" do FISCAL.md. */
    organizationId: int("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" })
      .unique(),
    cnpj: varchar("cnpj", { length: 18 }).notNull().unique(),
    razaoSocial: varchar("razao_social", { length: 255 }).notNull(),
    nomeFantasia: varchar("nome_fantasia", { length: 255 }),
    ie: varchar("ie", { length: 20 }),
    im: varchar("im", { length: 20 }),
    regimeTributario: varchar("regime_tributario", { length: 50 }).notNull(),
    cnaePrincipal: varchar("cnae_principal", { length: 7 }),
    enderecoCompleto: json("endereco_completo"),
    municipioIbge: varchar("municipio_ibge", { length: 7 }).notNull(),
    uf: varchar("uf", { length: 2 }).notNull(),
    emailFiscal: varchar("email_fiscal", { length: 320 }).notNull(),
    ativo: boolean("ativo").default(true).notNull(),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
    atualizadoEm: timestamp("atualizado_em").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgIdx: index("ef_org_idx").on(table.organizationId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  TOMADORES FISCAIS (quem paga — reutilizável entre agendamentos)           */
/* -------------------------------------------------------------------------- */

export const tomadoresFiscais = mysqlTable(
  "tomadores_fiscais",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tipoPessoa: mysqlEnum("tipo_pessoa", ["FISICA", "JURIDICA"]).notNull(),
    cpfCnpj: varchar("cpf_cnpj", { length: 18 }).notNull(),
    nomeParaNota: varchar("nome_para_nota", { length: 255 }).notNull(),
    email: varchar("email", { length: 320 }),
    celular: varchar("celular", { length: 20 }),
    logradouro: varchar("logradouro", { length: 255 }),
    numero: varchar("numero", { length: 20 }),
    complemento: varchar("complemento", { length: 255 }),
    bairro: varchar("bairro", { length: 100 }),
    cidade: varchar("cidade", { length: 100 }),
    uf: varchar("uf", { length: 2 }),
    cep: varchar("cep", { length: 9 }),
    codigoIbge: varchar("codigo_ibge", { length: 7 }),
    inscricaoEstadual: varchar("inscricao_estadual", { length: 20 }),
    ativo: boolean("ativo").default(true).notNull(),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
    atualizadoEm: timestamp("atualizado_em").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    // UNIQUE (organizationId, cpfCnpj) — FISCAL.md §6
    orgDocIdx: uniqueIndex("tf_org_doc_idx").on(table.organizationId, table.cpfCnpj),
  }),
);

/* -------------------------------------------------------------------------- */
/*  CERTIFICADOS (metadados — NUNCA o segredo, R07)                           */
/* -------------------------------------------------------------------------- */

export const certificados = mysqlTable(
  "certificados",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tipo: mysqlEnum("tipo", ["A1", "A3", "TOKEN_GATEWAY"]).notNull(),
    titularCnpj: varchar("titular_cnpj", { length: 18 }).notNull(),
    thumbprint: varchar("thumbprint", { length: 128 }),
    validoDe: timestamp("valido_de"),
    validoAte: timestamp("valido_ate").notNull(),
    /** Referência ao registro cifrado no cofre (R05) — nunca o material. */
    segredoRef: varchar("segredo_ref", { length: 64 }).notNull(),
    provedor: varchar("provedor", { length: 50 }),
    ambiente: mysqlEnum("ambiente", ["HOMOLOGACAO", "PRODUCAO"]).notNull(),
    ativo: boolean("ativo").default(true).notNull(),
    revogadoEm: timestamp("revogado_em"),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("cert_org_idx").on(table.organizationId),
    validadeIdx: index("cert_validade_idx").on(table.validoAte),
  }),
);

/* -------------------------------------------------------------------------- */
/*  COFRE FISCAL (ciphertexts — nada legível aqui, R05)                       */
/* -------------------------------------------------------------------------- */

export const cofreFiscal = mysqlTable(
  "cofre_fiscal",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** AES-256-GCM: ciphertext + iv + tag em base64, mesma convenção do token-crypto. */
    ciphertext: text("ciphertext").notNull(),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
    revogadoEm: timestamp("revogado_em"),
  },
  (table) => ({
    orgIdx: index("cofre_org_idx").on(table.organizationId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  CONFIGURAÇÕES FISCAIS                                                     */
/* -------------------------------------------------------------------------- */

export const configuracoesFiscais = mysqlTable(
  "configuracoes_fiscais",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tipoDocumento: mysqlEnum("tipo_documento", ["NFS_E", "NF_E", "NFC_E"]).notNull(),
    ambiente: mysqlEnum("ambiente", ["HOMOLOGACAO", "PRODUCAO"]).notNull(),
    provedor: varchar("provedor", { length: 50 }).notNull(),
    serie: varchar("serie", { length: 10 }).notNull(),
    proximoNumero: bigint("proximo_numero", { mode: "number" }).notNull(),
    codigoMunicipio: varchar("codigo_municipio", { length: 7 }).notNull(),
    itemListaServico: varchar("item_lista_servico", { length: 10 }).notNull(),
    aliquotaIssPadrao: decimal("aliquota_iss_padrao", { precision: 5, scale: 2 }).notNull(),
    regimeEspecialTributacao: int("regime_especial_tributacao"),
    permiteEmissaoRetroativa: boolean("permite_emissao_retroativa").default(false).notNull(),
    diasLimiteRetroativo: int("dias_limite_retroativo").default(0).notNull(),
    ativo: boolean("ativo").default(true).notNull(),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
  },
  (table) => ({
    orgDocIdx: uniqueIndex("cf_org_doc_idx").on(
      table.organizationId,
      table.tipoDocumento,
      table.ambiente,
      table.serie,
    ),
  }),
);

/* -------------------------------------------------------------------------- */
/*  NUMERAÇÃO FISCAL (reserva atômica — SELECT ... FOR UPDATE)                */
/* -------------------------------------------------------------------------- */

export const numeracaoFiscal = mysqlTable(
  "numeracao_fiscal",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tipoDocumento: mysqlEnum("tipo_documento", ["NFS_E", "NF_E", "NFC_E"]).notNull(),
    ambiente: mysqlEnum("ambiente", ["HOMOLOGACAO", "PRODUCAO"]).notNull(),
    serie: varchar("serie", { length: 10 }).notNull(),
    ultimoNumero: bigint("ultimo_numero", { mode: "number" }).default(0).notNull(),
  },
  (table) => ({
    orgDocIdx: uniqueIndex("nf_org_doc_idx").on(
      table.organizationId,
      table.tipoDocumento,
      table.ambiente,
      table.serie,
    ),
  }),
);

/* -------------------------------------------------------------------------- */
/*  NOTAS FISCAIS (documento legal — XML autorizado imutável, R26/R28)        */
/* -------------------------------------------------------------------------- */

export const notasFiscais = mysqlTable(
  "notas_fiscais",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tipoDocumento: mysqlEnum("tipo_documento", ["NFS_E", "NF_E", "NFC_E"]).notNull(),
    ambiente: mysqlEnum("ambiente", ["HOMOLOGACAO", "PRODUCAO"]).notNull(),
    serie: varchar("serie", { length: 10 }).notNull(),
    numero: bigint("numero", { mode: "number" }).notNull(),
    /** Rejeitada sem protocolo não tem chave — nullable + unique parcial via índice de aplicação (§6). */
    chaveAcesso: varchar("chave_acesso", { length: 44 }),
    status: mysqlEnum("status", [
      "RASCUNHO",
      "VALIDADA",
      "ENFILEIRADA",
      "ENVIANDO",
      "AUTORIZADA",
      "REJEITADA",
      "ERRO_TRANSITORIO",
      "DENEGADA",
      "CANCELADA",
      "SUBSTITUIDA",
      "EM_CONTINGENCIA",
    ]).notNull(),
    agendamentoId: int("agendamento_id").notNull(),
    notaSubstituidaId: int("nota_substituida_id"),

    /* snapshot do tomador — congelado na emissão (V3) */
    tomadorTipoPessoa: mysqlEnum("tomador_tipo_pessoa", ["FISICA", "JURIDICA"]).notNull(),
    tomadorNome: varchar("tomador_nome", { length: 255 }).notNull(),
    tomadorCpfCnpj: varchar("tomador_cpf_cnpj", { length: 18 }).notNull(),
    tomadorEmail: varchar("tomador_email", { length: 320 }),
    tomadorCelular: varchar("tomador_celular", { length: 20 }),
    tomadorLogradouro: varchar("tomador_logradouro", { length: 255 }),
    tomadorNumero: varchar("tomador_numero", { length: 20 }),
    tomadorComplemento: varchar("tomador_complemento", { length: 255 }),
    tomadorBairro: varchar("tomador_bairro", { length: 100 }),
    tomadorCidade: varchar("tomador_cidade", { length: 100 }),
    tomadorUf: varchar("tomador_uf", { length: 2 }),
    tomadorCep: varchar("tomador_cep", { length: 9 }),

    /* snapshot do serviço e do profissional (V3) */
    nomeMedico: varchar("nome_medico", { length: 255 }),
    crmMedico: varchar("crm_medico", { length: 50 }),
    ufCrm: varchar("uf_crm", { length: 2 }),
    tipoConselho: varchar("tipo_conselho", { length: 50 }),
    codigoServico: varchar("codigo_servico", { length: 10 }).notNull(),
    descricaoServico: text("descricao_servico").notNull(),
    dataCompetencia: timestamp("data_competencia").notNull(),

    /* valores — snapshot no momento da gravação ENFILEIRADA */
    valorServicos: decimal("valor_servicos", { precision: 12, scale: 2 }).notNull(),
    valorIss: decimal("valor_iss", { precision: 12, scale: 2 }).notNull(),
    valorTotal: decimal("valor_total", { precision: 12, scale: 2 }).notNull(),
    aliquotaIss: decimal("aliquota_iss", { precision: 5, scale: 2 }).notNull(),

    /* resultado */
    xmlEnviado: text("xml_enviado"),
    xmlAutorizado: text("xml_autorizado"),
    protocolo: varchar("protocolo", { length: 64 }),
    cStat: varchar("c_stat", { length: 10 }),
    xMotivo: varchar("x_motivo", { length: 500 }),
    hashXml: varchar("hash_xml", { length: 64 }),
    tentativas: int("tentativas").default(0).notNull(),
    criadoPor: int("criado_por"),
    enfileiradoEm: timestamp("enfileirado_em"),
    enviadoEm: timestamp("enviado_em"),
    autorizadoEm: timestamp("autorizado_em"),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
  },
  (table) => ({
    // UNIQUE (organizationId, tipoDocumento, ambiente, serie, numero) — §6
    chaveNaturalIdx: uniqueIndex("nota_chave_natural_idx").on(
      table.organizationId,
      table.tipoDocumento,
      table.ambiente,
      table.serie,
      table.numero,
    ),
    orgIdx: index("nota_org_idx").on(table.organizationId),
    statusIdx: index("nota_status_idx").on(table.status),
    agendamentoIdx: index("nota_agendamento_idx").on(table.agendamentoId),
    chaveAcessoIdx: index("nota_chave_acesso_idx").on(table.chaveAcesso),
  }),
);

/* -------------------------------------------------------------------------- */
/*  EVENTOS FISCAIS (cancelamento, CCe, manifestação...)                      */
/* -------------------------------------------------------------------------- */

export const eventosFiscais = mysqlTable(
  "eventos_fiscais",
  {
    id: int("id").autoincrement().primaryKey(),
    notaId: int("nota_id")
      .notNull()
      .references(() => notasFiscais.id, { onDelete: "cascade" }),
    organizationId: int("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tipo: mysqlEnum("tipo", [
      "CANCELAMENTO",
      "CCE",
      "SUBSTITUICAO",
      "MANIFESTACAO",
      "INUTILIZACAO",
    ]).notNull(),
    sequencia: int("sequencia").notNull(),
    motivo: varchar("motivo", { length: 255 }).notNull(),
    xmlEvento: text("xml_evento"),
    protocolo: varchar("protocolo", { length: 64 }),
    status: varchar("status", { length: 50 }).notNull(),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
  },
  (table) => ({
    notaIdx: index("ev_nota_idx").on(table.notaId),
    orgIdx: index("ev_org_idx").on(table.organizationId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  LOGS FISCAIS (12 meses — LGPD; CPF/CNPJ mascarado; sem XML completo)      */
/* -------------------------------------------------------------------------- */

export const logsFiscais = mysqlTable(
  "logs_fiscais",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    notaId: int("nota_id"),
    adapter: varchar("adapter", { length: 50 }).notNull(),
    operacao: varchar("operacao", { length: 50 }).notNull(),
    /** Resumos com documento mascarado — NUNCA XML completo (LGPD). */
    requestResumo: varchar("request_resumo", { length: 500 }),
    responseResumo: varchar("response_resumo", { length: 500 }),
    cStat: varchar("c_stat", { length: 10 }),
    duracaoMs: int("duracao_ms"),
    erro: varchar("erro", { length: 500 }),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("lf_org_idx").on(table.organizationId),
    notaIdx: index("lf_nota_idx").on(table.notaId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  FILA FISCAL (Postgres-tabela — pendência 3: Redis não confirmado)         */
/* -------------------------------------------------------------------------- */

export const filaFiscal = mysqlTable(
  "fila_fiscal",
  {
    id: int("id").autoincrement().primaryKey(),
    /** fila:fiscal:nfse:{provedor} — FISCAL.md §7, R12 */
    destino: varchar("destino", { length: 100 }).notNull(),
    notaId: int("nota_id").notNull(),
    organizationId: int("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    operacao: mysqlEnum("operacao", ["EMITIR", "CONSULTAR", "EVENTO"]).notNull(),
    tentativas: int("tentativas").default(0).notNull(),
    disponivelEm: timestamp("disponivel_em").defaultNow().notNull(),
    processadoEm: timestamp("processado_em"),
    erro: varchar("erro", { length: 500 }),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
  },
  (table) => ({
    destinoIdx: index("ff_destino_idx").on(table.destino, table.disponivelEm),
    notaIdx: index("ff_nota_idx").on(table.notaId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  TIPOS                                                                     */
/* -------------------------------------------------------------------------- */

export type EmpresaFiscal = typeof empresasFiscais.$inferSelect;
export type InsertEmpresaFiscal = typeof empresasFiscais.$inferInsert;

export type TomadorFiscal = typeof tomadoresFiscais.$inferSelect;
export type InsertTomadorFiscal = typeof tomadoresFiscais.$inferInsert;

export type Certificado = typeof certificados.$inferSelect;
export type InsertCertificado = typeof certificados.$inferInsert;

export type CofreFiscalRow = typeof cofreFiscal.$inferSelect;
export type InsertCofreFiscalRow = typeof cofreFiscal.$inferInsert;

export type ConfiguracaoFiscal = typeof configuracoesFiscais.$inferSelect;
export type InsertConfiguracaoFiscal = typeof configuracoesFiscais.$inferInsert;

export type NumeracaoFiscal = typeof numeracaoFiscal.$inferSelect;
export type InsertNumeracaoFiscal = typeof numeracaoFiscal.$inferInsert;

export type NotaFiscal = typeof notasFiscais.$inferSelect;
export type InsertNotaFiscal = typeof notasFiscais.$inferInsert;

export type EventoFiscal = typeof eventosFiscais.$inferSelect;
export type InsertEventoFiscal = typeof eventosFiscais.$inferInsert;

export type LogFiscal = typeof logsFiscais.$inferSelect;
export type InsertLogFiscal = typeof logsFiscais.$inferInsert;

export type FilaFiscalItem = typeof filaFiscal.$inferSelect;
export type InsertFilaFiscalItem = typeof filaFiscal.$inferInsert;
