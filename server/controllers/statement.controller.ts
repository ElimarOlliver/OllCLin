/**
 * OllCLin - Camada Controller
 * Controlador do Extrato (Financeiro — Cap. 15.4)
 *
 * O extrato não possui tabela própria: ele é derivado de receitas, vendas,
 * despesas e repasses já registrados.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { statementModel } from "../models/statement.model";
import { protectedProcedure, router } from "../_core/trpc";

const statementFilterSchema = z.object({
  organizationId: z.number().int().positive(),
  from: z.string().optional(),
  to: z.string().optional(),
  type: z.enum(["entrada", "saida"]).optional(),
  source: z.enum(["receita", "venda", "despesa", "repasse"]).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

export const statementRouter = router({
  list: protectedProcedure.input(statementFilterSchema).query(async ({ input }) => {
    try {
      return await statementModel.list(input);
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Falha ao gerar extrato",
      });
    }
  }),
});
