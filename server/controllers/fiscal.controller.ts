/**
 * OllCLin — Router tRPC do módulo fiscal (FISCAL.md §14).
 *
 * Todo procedimento verifica papel (owner/admin — que são os
 * ADMINISTRADOR/RECEPCAO do FISCAL.md mapeados ao RBAC existente) e o
 * organizationId do usuário. NUNCA expõe material de credencial.
 *
 * R11: nenhum procedimento chama órgão — só grava e publica na fila.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { appointments, professionals } from "../../drizzle/schema";
import {
  certificados,
  cofreFiscal,
  configuracoesFiscais,
  empresasFiscais,
  eventosFiscais,
  notasFiscais,
  numeracaoFiscal,
  tomadoresFiscais,
} from "../../drizzle/schema/fiscal";
import {
  cancelarNota as cancelarNotaService,
  emitirDoAgendamento as emitirService,
  emitirLote as emitirLoteService,
  listarNotas as listarService,
  prepararNota as prepararService,
} from "../fiscal/nota.service";
import { guardar as cofreGuardar, status as cofreStatus } from "../fiscal/cofre";
import {
  cancelarNotaSchema,
  emitirDoAgendamentoSchema,
  emitirLoteSchema,
  listarNotasSchema,
  prepararNotaSchema,
  vincularTomadorSchema,
} from "../../shared/fiscal/schemas";
import { TipoPessoa, tipoPessoaSchema } from "../../shared/fiscal/tipos";

/** V1: papel — o modelo RBAC do projeto mapeia ADMINISTRADOR→owner/admin, RECEPCAO→receptionist. */
const ROLES_EMITIR = new Set(["owner", "admin", "receptionist", "financial"]);

function exigirPapelEmissao(role: string | undefined): void {
  if (!role || !ROLES_EMITIR.has(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Somente ADMINISTRADOR ou RECEPCAO podem emitir nota fiscal.",
    });
  }
}

function exigirTenant(ctx: { user?: { id: number; organizationId: number | null; role?: string | null; isOwner?: boolean } | null }): number {
  const orgId = ctx.user?.organizationId;
  if (typeof orgId !== "number" || orgId <= 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Usuário sem organização vinculada." });
  }
  return orgId;
}

/** Middleware combinado: protegido + papel de emissão. */
const fiscalProcedure = protectedProcedure.use(async (opts) => {
  exigirPapelEmissao(opts.ctx.user?.role ?? undefined);
  return opts.next();
});

export const fiscalRouter = router({
  /* ---------------------------------------------------------------- */
  /*  prepararNota — habilita o botão na UI; NUNCA envia (§14)         */
  /* ---------------------------------------------------------------- */
  prepararNota: fiscalProcedure
    .input(prepararNotaSchema)
    .query(async ({ ctx, input }) => {
      const organizationId = exigirTenant(ctx);
      return prepararService(organizationId, input.agendamentoId);
    }),

  /* ---------------------------------------------------------------- */
  /*  emitirDoAgendamento — snapshot → ENFILEIRADA → fila (R11)        */
  /* ---------------------------------------------------------------- */
  emitirDoAgendamento: fiscalProcedure
    .input(emitirDoAgendamentoSchema)
    .mutation(async ({ ctx, input }) => {
      const organizationId = exigirTenant(ctx);
      const resultado = await emitirService(organizationId, input.agendamentoId, {
        reemitir: input.reemitir,
      });
      return {
        status: resultado.status,
        notaId: resultado.nota.id,
        numero: resultado.nota.numero,
      };
    }),

  /* ---------------------------------------------------------------- */
  /*  emitirLote — máx 50, transação por item (V6)                     */
  /* ---------------------------------------------------------------- */
  emitirLote: fiscalProcedure
    .input(emitirLoteSchema)
    .mutation(async ({ ctx, input }) => {
      const organizationId = exigirTenant(ctx);
      const resultados = await emitirLoteService(organizationId, input.agendamentoIds, {
        reemitir: input.reemitir,
      });
      return { itens: resultados };
    }),

  /* ---------------------------------------------------------------- */
  /*  consultar — status atual da nota                                 */
  /* ---------------------------------------------------------------- */
  consultar: fiscalProcedure
    .input(z.object({ notaId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const organizationId = exigirTenant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const rows = await db
        .select({
          id: notasFiscais.id,
          status: notasFiscais.status,
          cStat: notasFiscais.cStat,
          xMotivo: notasFiscais.xMotivo,
          protocolo: notasFiscais.protocolo,
          chaveAcesso: notasFiscais.chaveAcesso,
        })
        .from(notasFiscais)
        .where(and(eq(notasFiscais.id, input.notaId), eq(notasFiscais.organizationId, organizationId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada" });
      return rows[0];
    }),

  /* ---------------------------------------------------------------- */
  /*  cancelarNota — motivo mínimo 15 (V5)                             */
  /* ---------------------------------------------------------------- */
  cancelarNota: fiscalProcedure
    .input(cancelarNotaSchema)
    .mutation(async ({ ctx, input }) => {
      const organizationId = exigirTenant(ctx);
      await cancelarNotaService(organizationId, input.notaId, input.motivo);
      return { success: true };
    }),

  /* ---------------------------------------------------------------- */
  /*  listar — paginado, SEMPRE por organizationId (R02)               */
  /* ---------------------------------------------------------------- */
  listar: fiscalProcedure
    .input(listarNotasSchema)
    .query(async ({ ctx, input }) => {
      const organizationId = exigirTenant(ctx);
      return listarService(organizationId, {
        ambiente: input.ambiente,
        status: input.status,
        profissionalId: input.profissionalId,
        dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
        dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
        pagina: input.pagina,
        porPagina: input.porPagina,
      });
    }),

  /* ---------------------------------------------------------------- */
  /*  baixarXml — documento legal (R26/R27)                            */
  /* ---------------------------------------------------------------- */
  baixarXml: fiscalProcedure
    .input(z.object({ notaId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const organizationId = exigirTenant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const rows = await db
        .select({ xmlAutorizado: notasFiscais.xmlAutorizado, chaveAcesso: notasFiscais.chaveAcesso })
        .from(notasFiscais)
        .where(and(eq(notasFiscais.id, input.notaId), eq(notasFiscais.organizationId, organizationId)))
        .limit(1);
      const nota = rows[0];
      if (!nota) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada" });
      if (!nota.xmlAutorizado) throw new TRPCError({ code: "NOT_FOUND", message: "XML autorizado indisponível" });
      return { xml: nota.xmlAutorizado, chaveAcesso: nota.chaveAcesso };
    }),

  /* ---------------------------------------------------------------- */
  /*  Painel — agendamentos por status FISCAL (§13)                    */
  /* ---------------------------------------------------------------- */
  painelAgendamentos: fiscalProcedure
    .input(
      z.object({
        fiscalStatus: z.enum(["PENDENTE", "EMITIDA", "ERRO", "CANCELADA", "NAO_EMITIDA"]).optional(),
        ambiente: z.enum(["HOMOLOGACAO", "PRODUCAO"]).optional(),
        pagina: z.number().int().min(1).default(1),
        porPagina: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const organizationId = exigirTenant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

      // Filtra SEMPRE por fiscalStatus — nunca pelo status clínico (§13)
      const conds = [eq(appointments.organizationId, organizationId), eq(appointments.status, "atendido")];
      if (input.fiscalStatus) conds.push(eq(appointments.fiscalStatus, input.fiscalStatus));

      const itens = await db
        .select({
          id: appointments.id,
          startsAt: appointments.startsAt,
          concluidoEm: appointments.concluidoEm,
          fiscalStatus: appointments.fiscalStatus,
          fiscalNotaId: appointments.fiscalNotaId,
          valorConsulta: appointments.valorConsulta,
          patientId: appointments.patientId,
          professionalId: appointments.professionalId,
          profissionalNome: professionals.fullName,
          profissionalCrm: professionals.councilNumber,
        })
        .from(appointments)
        .leftJoin(professionals, eq(appointments.professionalId, professionals.id))
        .where(and(...conds))
        .orderBy(desc(appointments.concluidoEm))
        .limit(input.porPagina)
        .offset((input.pagina - 1) * input.porPagina);

      return { itens };
    }),

  /* ---------------------------------------------------------------- */
  /*  tomadores — busca para o formulário (§12)                        */
  /* ---------------------------------------------------------------- */
  buscarTomadorPorDocumento: fiscalProcedure
    .input(z.object({ cpfCnpj: z.string().trim().min(11).max(18) }))
    .query(async ({ ctx, input }) => {
      const organizationId = exigirTenant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const rows = await db
        .select()
        .from(tomadoresFiscais)
        .where(
          and(
            eq(tomadoresFiscais.organizationId, organizationId),
            eq(tomadoresFiscais.cpfCnpj, input.cpfCnpj),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    }),

  salvarTomador: fiscalProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        tipoPessoa: tipoPessoaSchema,
        cpfCnpj: z.string().trim().min(11).max(18),
        nomeParaNota: z.string().trim().min(3).max(255),
        email: z.string().trim().max(320).optional(),
        celular: z.string().trim().max(20).optional(),
        logradouro: z.string().trim().max(255).optional(),
        numero: z.string().trim().max(20).optional(),
        complemento: z.string().trim().max(255).optional(),
        bairro: z.string().trim().max(100).optional(),
        cidade: z.string().trim().max(100).optional(),
        uf: z.string().trim().length(2).optional(),
        cep: z.string().trim().max(9).optional(),
        codigoIbge: z.string().trim().max(7).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const organizationId = exigirTenant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

      if (input.id) {
        // UPDATE sempre com escopo de tenant
        await db
          .update(tomadoresFiscais)
          .set({ ...input, organizationId })
          .where(
            and(eq(tomadoresFiscais.id, input.id), eq(tomadoresFiscais.organizationId, organizationId)),
          );
        return { id: input.id };
      }
      const { id: _ignored, ...dadosTomador } = input;
      void _ignored;
      const [row] = await db
        .insert(tomadoresFiscais)
        .values({ ...dadosTomador, tipoPessoa: input.tipoPessoa as "FISICA" | "JURIDICA", organizationId })
        .$returningId();
      return { id: row.id };
    }),

  vincularTomador: fiscalProcedure
    .input(vincularTomadorSchema)
    .mutation(async ({ ctx, input }) => {
      const organizationId = exigirTenant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      // Tomador precisa ser da MESMA empresa (R02)
      const rows = await db
        .select({ id: tomadoresFiscais.id })
        .from(tomadoresFiscais)
        .where(
          and(
            eq(tomadoresFiscais.id, input.tomadorId),
            eq(tomadoresFiscais.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Tomador não encontrado" });
      await db
        .update(appointments)
        .set({ fiscalTomadorId: input.tomadorId })
        .where(and(eq(appointments.id, input.agendamentoId), eq(appointments.organizationId, organizationId)));
      return { success: true };
    }),

  /* ---------------------------------------------------------------- */
  /*  Configuração fiscal + credencial (§14, NUNCA expõe segredo)      */
  /* ---------------------------------------------------------------- */
  configurarEmpresa: fiscalProcedure
    .input(
      z.object({
        cnpj: z.string().trim().min(11).max(18),
        razaoSocial: z.string().trim().min(3).max(255),
        municipioIbge: z.string().trim().length(7),
        uf: z.string().trim().length(2),
        emailFiscal: z.string().trim().email(),
        regimeTributario: z.string().trim().min(1),
        // Credencial — entra por aqui e nunca mais volta (R05)
        credencialMaterial: z.string().min(1),
        credencialSenha: z.string().optional(),
        credencialTipo: z.enum(["A1", "A3", "TOKEN_GATEWAY"]),
        credencialValidade: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const organizationId = exigirTenant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

      const [empresa] = await db
        .insert(empresasFiscais)
        .values({
          organizationId,
          cnpj: input.cnpj,
          razaoSocial: input.razaoSocial,
          municipioIbge: input.municipioIbge,
          uf: input.uf,
          emailFiscal: input.emailFiscal,
          regimeTributario: input.regimeTributario,
        })
        .onDuplicateKeyUpdate({
          set: {
            razaoSocial: input.razaoSocial,
            municipioIbge: input.municipioIbge,
            uf: input.uf,
            emailFiscal: input.emailFiscal,
            regimeTributario: input.regimeTributario,
          },
        })
        .$returningId();

      // Credencial cifrada no cofre — NUNCA no banco em claro (R05)
      const segredoRef = await cofreGuardar(
        organizationId,
        input.credencialMaterial,
        input.credencialSenha ?? null,
      );
      const existing = await db
        .select({ id: certificados.id })
        .from(certificados)
        .where(and(eq(certificados.organizationId, organizationId), eq(certificados.ativo, true)))
        .limit(1);
      if (existing[0]) {
        await db
          .update(certificados)
          .set({ segredoRef: String(segredoRef), validoAte: new Date(input.credencialValidade), tipo: input.credencialTipo })
          .where(eq(certificados.id, existing[0].id));
      } else {
        await db.insert(certificados).values({
          organizationId,
          tipo: input.credencialTipo,
          titularCnpj: input.cnpj,
          validoDe: new Date(),
          validoAte: new Date(input.credencialValidade),
          segredoRef: String(segredoRef),
          ambiente: "HOMOLOGACAO",
        });
      }
      void empresa;
      return { success: true };
    }),

  statusCredencial: fiscalProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      const organizationId = exigirTenant(ctx);
      return cofreStatus(organizationId); // SEM material (R07)
    }),

  /* ---------------------------------------------------------------- */
  /*  Config de série/numeração + inicialização da numeração           */
  /* ---------------------------------------------------------------- */
  configurarSerie: fiscalProcedure
    .input(
      z.object({
        tipoDocumento: z.enum(["NFS_E", "NF_E", "NFC_E"]),
        ambiente: z.enum(["HOMOLOGACAO", "PRODUCAO"]),
        provedor: z.string().trim().min(2).max(50),
        serie: z.string().trim().min(1).max(10),
        codigoMunicipio: z.string().trim().length(7),
        itemListaServico: z.string().trim().min(1).max(10),
        aliquotaIssPadrao: z.number().min(0).max(100),
        permiteEmissaoRetroativa: z.boolean().default(false),
        diasLimiteRetroativo: z.number().int().min(0).max(365).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const organizationId = exigirTenant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

      const existing = await db
        .select({ id: configuracoesFiscais.id })
        .from(configuracoesFiscais)
        .where(
          and(
            eq(configuracoesFiscais.organizationId, organizationId),
            eq(configuracoesFiscais.tipoDocumento, input.tipoDocumento),
            eq(configuracoesFiscais.ambiente, input.ambiente),
            eq(configuracoesFiscais.serie, input.serie),
          ),
        )
        .limit(1);
      if (existing[0]) {
        await db
          .update(configuracoesFiscais)
          .set({ ...input, aliquotaIssPadrao: input.aliquotaIssPadrao.toFixed(2) })
          .where(eq(configuracoesFiscais.id, existing[0].id));
      } else {
        await db.insert(configuracoesFiscais).values({
          organizationId,
          ...input,
          aliquotaIssPadrao: input.aliquotaIssPadrao.toFixed(2),
          proximoNumero: 1,
          ativo: true,
        });
      }
      // Inicializa numeração se não existir
      const numeracao = await db
        .select({ id: numeracaoFiscal.id })
        .from(numeracaoFiscal)
        .where(
          and(
            eq(numeracaoFiscal.organizationId, organizationId),
            eq(numeracaoFiscal.tipoDocumento, input.tipoDocumento),
            eq(numeracaoFiscal.ambiente, input.ambiente),
            eq(numeracaoFiscal.serie, input.serie),
          ),
        )
        .limit(1);
      if (!numeracao[0]) {
        await db.insert(numeracaoFiscal).values({
          organizationId,
          tipoDocumento: input.tipoDocumento,
          ambiente: input.ambiente,
          serie: input.serie,
          ultimoNumero: 0,
        });
      }
      return { success: true };
    }),

  /* ---------------------------------------------------------------- */
  /*  Eventos fiscais da nota (cancelamentos, CCe...)                  */
  /* ---------------------------------------------------------------- */
  eventosDaNota: fiscalProcedure
    .input(z.object({ notaId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const organizationId = exigirTenant(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      return db
        .select()
        .from(eventosFiscais)
        .where(and(eq(eventosFiscais.notaId, input.notaId), eq(eventosFiscais.organizationId, organizationId)))
        .orderBy(desc(eventosFiscais.criadoEm));
    }),
});

export type FiscalRouter = typeof fiscalRouter;
