/**
 * OllCLin - Camada Controller
 * Controlador de Exportação de Relatórios (Fase 3 — SaaS)
 */

import { z } from "zod";
import { protectedWith, router } from "../_core/trpc";
import { buildAppointmentsExportCsv } from "../services/import-export.service";
import { writeAuditLog } from "../lib/audit";

export const reportRouter = router({
  /** Exporta histórico de consultas/agendamentos em CSV (UTF-8 com BOM). */
  appointmentsCsv: protectedWith("reports.export")
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        from: z.string().optional(),
        to: z.string().optional(),
        professionalId: z.number().int().optional(),
        patientId: z.number().int().optional(),
        status: z.string().optional(),
        procedureId: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const csv = await buildAppointmentsExportCsv({
        organizationId: input.organizationId,
        from: input.from,
        to: input.to,
        professionalId: input.professionalId,
        patientId: input.patientId,
        status: input.status,
        procedureId: input.procedureId,
      });

      // LGPD: exportação de dados clínicos é um acesso auditável.
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
          procedureId: input.procedureId ?? null,
        },
        request: ctx.req,
      });

      return { csv };
    }),
});
