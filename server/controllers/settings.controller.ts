/**
 * OllCLin - Camada Controller
 * Configurações: Locais/Salas (REQ-05-010..014) + Campos Obrigatórios
 * (REQ-05-015..019) + Campos Obrigatórios TISS (REQ-05-020..023)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getSupabaseAdmin } from "../lib/supabase-server";
import { writeAuditLog } from "../lib/audit";

/** REQ-05-019: o campo Nome nunca pode ser desabilitado. */
const ALWAYS_REQUIRED_FIELDS = ["fullName"] as const;

const DEFAULT_PATIENT_FIELDS: Record<string, boolean> = {
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

export const settingsRouter = router({
  /* --------------------------- Locais de atendimento --------------------- */

  locations: protectedProcedure
    .input(z.object({ organizationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const { data, error } = await getSupabaseAdmin()
        .from("locations")
        .select("id, name, address, phone, email, is_active")
        .eq("organization_id", input.organizationId)
        .order("name");
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as number,
        name: row.name as string,
        address: (row.address as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        email: (row.email as string | null) ?? null,
        isActive: row.is_active !== false,
      }));
    }),

  createLocation: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        name: z.string().min(2, "Nome do local é obrigatório"), // REQ-05-011
        address: z.string().optional(),
        phone: z.string().max(20).optional(),
        email: z.string().email().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Garante um estabelecimento padrão (locations depende dele)
      let est = await getSupabaseAdmin()
        .from("establishments")
        .select("id")
        .eq("organization_id", input.organizationId)
        .limit(1)
        .maybeSingle();
      if (!est.data) {
        const created = await getSupabaseAdmin()
          .from("establishments")
          .insert({ organization_id: input.organizationId, name: "Estabelecimento principal" })
          .select("id")
          .single();
        if (created.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: created.error.message });
        est = { data: created.data, error: null } as typeof est;
      }

      const { data, error } = await getSupabaseAdmin()
        .from("locations")
        .insert({
          organization_id: input.organizationId,
          establishment_id: (est.data as { id: number }).id,
          name: input.name,
          address: input.address ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
        })
        .select("id, name")
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "location",
        entityId: (data as { id: number }).id,
        newValues: { name: input.name },
        request: ctx.req,
      });
      return data;
    }),

  rooms: protectedProcedure
    .input(z.object({ locationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const { data, error } = await getSupabaseAdmin()
        .from("rooms")
        .select("id, name, capacity, is_active")
        .eq("location_id", input.locationId)
        .order("name");
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as number,
        name: row.name as string,
        capacity: (row.capacity as number) ?? 1,
        isActive: row.is_active !== false,
      }));
    }),

  createRoom: protectedProcedure
    .input(
      z.object({
        locationId: z.number().int().positive(),
        organizationId: z.number().int().positive(),
        name: z.string().min(1, "Nome da sala é obrigatório"), // REQ-05-013
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await getSupabaseAdmin()
        .from("rooms")
        .insert({ location_id: input.locationId, name: input.name })
        .select("id, name")
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "room",
        entityId: (data as { id: number }).id,
        newValues: { name: input.name, locationId: input.locationId },
        request: ctx.req,
      });
      return data;
    }),

  deleteRoom: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), organizationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      // REQ-05-014: exclusão (soft) individual de sala
      const { error } = await getSupabaseAdmin()
        .from("rooms")
        .update({ is_active: false })
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "DELETE",
        entity: "room",
        entityId: input.id,
        newValues: { isActive: false },
        request: ctx.req,
      });
      return { success: true };
    }),

  /* --------------------- Campos obrigatórios (pacientes) ----------------- */

  /** REQ-05-015: leitura da configuração; Nome sempre obrigatório (REQ-05-019). */
  getRequiredPatientFields: protectedProcedure
    .input(z.object({ organizationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const { data, error } = await getSupabaseAdmin()
        .from("org_settings")
        .select("required_patient_fields")
        .eq("organization_id", input.organizationId)
        .maybeSingle();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const stored = (data?.required_patient_fields as Record<string, boolean> | null) ?? {};
      const merged: Record<string, boolean> = { ...DEFAULT_PATIENT_FIELDS };
      for (const key of Object.keys(merged)) {
        if (key in stored) merged[key] = stored[key];
      }
      for (const always of ALWAYS_REQUIRED_FIELDS) merged[always] = true;
      return merged;
    }),

  /** REQ-05-018: salvamento imediato ao marcar/desmarcar. */
  setRequiredPatientField: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        field: z.string().min(2),
        required: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if ((ALWAYS_REQUIRED_FIELDS as readonly string[]).includes(input.field) && !input.required) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O campo Nome não pode ser desabilitado" });
      }

      const current = await getSupabaseAdmin()
        .from("org_settings")
        .select("required_patient_fields")
        .eq("organization_id", input.organizationId)
        .maybeSingle();
      if (current.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: current.error.message });

      const stored = (current.data?.required_patient_fields as Record<string, boolean> | null) ?? {};
      stored[input.field] = input.required;

      const { error } = await getSupabaseAdmin()
        .from("org_settings")
        .upsert(
          { organization_id: input.organizationId, required_patient_fields: stored },
          { onConflict: "organization_id" },
        );
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "org_settings",
        entityId: input.organizationId,
        newValues: { field: input.field, required: input.required },
        request: ctx.req,
      });
      return { success: true };
    }),
});
