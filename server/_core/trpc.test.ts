/**
 * OllCLin - Testes da autorização RBAC (Fase 1 — SaaS)
 */

import { describe, expect, it } from "vitest";
import { permissionsForRole, type Permission } from "./trpc";

describe("permissionsForRole (RBAC Fase 1)", () => {
  it("owner e admin possuem todas as permissões", () => {
    expect(permissionsForRole("owner")).toContain("*");
    expect(permissionsForRole("admin")).toContain("*");
  });

  it("doctor tem permissões clínicas e de agenda", () => {
    const permissions = permissionsForRole("doctor");
    expect(permissions).toContain("appointments.write");
    expect(permissions).toContain("google_calendar.connect");
    expect(permissions).not.toContain("finance.write");
  });

  it("receptionist não tem acesso financeiro", () => {
    expect(permissionsForRole("receptionist")).not.toContain("finance.write");
    expect(permissionsForRole("receptionist")).toContain("appointments.write");
  });

  it("financial tem acesso a relatórios e repasses", () => {
    const permissions: Permission[] = permissionsForRole("financial");
    expect(permissions).toContain("finance.write");
    expect(permissions).toContain("reports.export");
  });

  it("readonly apenas lê clínico", () => {
    expect(permissionsForRole("readonly")).toContain("patients.read");
    expect(permissionsForRole("readonly")).not.toContain("appointments.write");
  });

  it("sem role não recebe permissões", () => {
    expect(permissionsForRole(null)).toEqual([]);
    expect(permissionsForRole(undefined)).toEqual([]);
  });
});
