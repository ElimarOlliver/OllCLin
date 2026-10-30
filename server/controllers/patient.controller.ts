/**
 * OllCLin - Camada Controller
 * Controlador de Pacientes
 * Arquitetura MVC - Recebe requisições, valida e chama o Model
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { patientModel } from "../models/patient.model";
import { protectedProcedure, router } from "../_core/trpc";
import { writeAuditLog } from "../lib/audit";

const genderSchema = z.enum(["M", "F", "O"]);

export const createPatientSchema = z.object({
  organizationId: z.number().int().positive(),
  fullName: z.string().min(2, "Nome completo é obrigatório"),
  socialName: z.string().optional(),
  cpf: z.string().optional(),
  rg: z.string().optional(),
  birthDate: z.string().optional(),
  gender: genderSchema.optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
  consentDataSharing: z.boolean().default(false),
  consentMarketing: z.boolean().default(false),
});

export const updatePatientSchema = z.object({
  id: z.number().int().positive(),
  organizationId: z.number().int().positive(),
  fullName: z.string().min(2).optional(),
  socialName: z.string().optional(),
  cpf: z.string().optional(),
  rg: z.string().optional(),
  birthDate: z.string().optional(),
  gender: genderSchema.optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
  consentDataSharing: z.boolean().optional(),
  consentMarketing: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const patientFilterSchema = z.object({
  organizationId: z.number().int().positive(),
  search: z.string().optional(),
  cpf: z.string().optional(),
  isActive: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export const patientRouter = router({
  list: protectedProcedure
    .input(patientFilterSchema)
    .query(async ({ input }) => {
      return patientModel.findMany(input);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int(), organizationId: z.number().int() }))
    .query(async ({ input }) => {
      const patient = await patientModel.findById(input.id, input.organizationId);
      if (!patient) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Paciente não encontrado",
        });
      }
      return patient;
    }),

  create: protectedProcedure
    .input(createPatientSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.cpf) {
        const exists = await patientModel.existsByCpf(
          input.cpf,
          input.organizationId,
        );
        if (exists) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Já existe um paciente com este CPF",
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
        request: ctx.req,
      });

      return patient;
    }),

  update: protectedProcedure
    .input(updatePatientSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, ...data } = input;

      const existing = await patientModel.findById(id, organizationId);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Paciente não encontrado",
        });
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
          email: existing.email,
        },
        newValues: data,
        request: ctx.req,
      });

      return patient;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int(), organizationId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const patient = await patientModel.delete(input.id, input.organizationId);
      if (!patient) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Paciente não encontrado",
        });
      }

      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "DELETE",
        entity: "patient",
        entityId: input.id,
        newValues: { isActive: false },
        request: ctx.req,
      });

      return { success: true };
    }),
});
