/**
 * OllCLin - Camada Controller
 * Controlador de Pacientes
 * Arquitetura MVC - Recebe requisições, valida e chama o Model
 */

import { z } from "zod";
import { patientModel } from "../models/patient.model";
import { publicProcedure, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { auditLog } from "../../drizzle/schema";
import { db } from "../db";

// Schemas de validação
export const createPatientSchema = z.object({
  organizationId: z.number(),
  fullName: z.string().min(2, "Nome completo é obrigatório"),
  socialName: z.string().optional(),
  cpf: z.string().optional(),
  rg: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.enum(["M", "F", "O"]).optional(),
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
  id: z.number(),
  fullName: z.string().min(2).optional(),
  socialName: z.string().optional(),
  cpf: z.string().optional(),
  rg: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.enum(["M", "F", "O"]).optional(),
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
  organizationId: z.number(),
  search: z.string().optional(),
  cpf: z.string().optional(),
  isActive: z.boolean().optional(),
  limit: z.number().default(50).optional(),
  offset: z.number().default(0).optional(),
});

export const patientRouter = {
  list: publicProcedure
    .input(patientFilterSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      // Verificar se o usuário tem acesso à organização
      const patients = await patientModel.findMany({
        organizationId: input.organizationId,
        search: input.search,
        cpf: input.cpf,
        isActive: input.isActive,
        limit: input.limit,
        offset: input.offset,
      });

      return patients;
    }),

  getById: publicProcedure
    .input(z.object({ id: z.number(), organizationId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const patient = await patientModel.findById(input.id, input.organizationId);
      if (!patient) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Paciente não encontrado" });
      }

      return patient;
    }),

  create: protectedProcedure
    .input(createPatientSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      // Verificar se CPF já existe (se informado)
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

      // Auditoria
      await db.insert(auditLog).values({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "patient",
        entityId: patient.id,
        newValues: JSON.stringify({ fullName: input.fullName, cpf: input.cpf }),
        ipAddress: ctx.req.headers["x-forwarded-for"] as string | undefined,
        userAgent: ctx.req.headers["user-agent"],
      });

      return patient;
    }),

  update: protectedProcedure
    .input(updatePatientSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const { id, organizationId, ...data } = input;

      const existing = await patientModel.findById(id, organizationId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Paciente não encontrado" });
      }

      const oldValues = JSON.stringify({
        fullName: existing.fullName,
        cpf: existing.cpf,
        phone: existing.phone,
        email: existing.email,
      });

      const patient = await patientModel.update(id, organizationId, data);

      const newValues = JSON.stringify({
        fullName: data.fullName,
        cpf: data.cpf,
        phone: data.phone,
        email: data.email,
      });

      await db.insert(auditLog).values({
        organizationId,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "patient",
        entityId: id,
        oldValues,
        newValues,
        ipAddress: ctx.req.headers["x-forwarded-for"] as string | undefined,
        userAgent: ctx.req.headers["user-agent"],
      });

      return patient;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), organizationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const patient = await patientModel.delete(input.id, input.organizationId);
      if (!patient) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Paciente não encontrado" });
      }

      await db.insert(auditLog).values({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "DELETE",
        entity: "patient",
        entityId: input.id,
        newValues: JSON.stringify({ isActive: false }),
        ipAddress: ctx.req.headers["x-forwarded-for"] as string | undefined,
        userAgent: ctx.req.headers["user-agent"],
      });

      return { success: true };
    }),
};