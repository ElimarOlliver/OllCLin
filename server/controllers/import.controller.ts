/**
 * OllCLin - Camada Controller
 * Controlador do Módulo de Importação e Exportação de Dados (Fase 3 — SaaS)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedWith, router } from "../_core/trpc";
import {
  confirmImportBatch,
  createImportBatch,
  listImportBatches,
  type ImportPreview,
} from "../services/import-export.service";
import { writeAuditLog } from "../lib/audit";

export const importRouter = router({
  /** Recebe o arquivo (base64), processa e retorna o preview de validação. */
  createBatch: protectedWith("patients.write")
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        fileName: z.string().min(1).max(255),
        fileType: z.string().min(1).max(64),
        contentBase64: z.string().min(1).max(2_500_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const content = Buffer.from(input.contentBase64, "base64").toString("utf8");
        const preview: ImportPreview = await createImportBatch({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          fileName: input.fileName,
          fileType: input.fileType,
          content,
        });
        await writeAuditLog({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          action: "CREATE",
          entity: "import_batch",
          newValues: { fileName: input.fileName, status: preview.status, totalRows: preview.totalRows, validRows: preview.validRows, rejectedRows: preview.rejectedRows },
        });
        return preview;
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Falha ao processar arquivo de importação",
        });
      }
    }),

  /** Confirma a importação do lote (aplica as linhas validadas). */
  confirm: protectedWith("patients.write")
    .input(
      z.object({
        batchId: z.number().int().positive(),
        organizationId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await confirmImportBatch({
        batchId: input.batchId,
        organizationId: input.organizationId,
        userId: ctx.user.id,
      });
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "import_batch",
        entityId: input.batchId,
        newValues: result,
      });
      return result;
    }),

  /** Histórico de lotes de importação da organização. */
  list: protectedWith("patients.read")
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listImportBatches({ organizationId: input.organizationId, limit: input.limit });
    }),
});
