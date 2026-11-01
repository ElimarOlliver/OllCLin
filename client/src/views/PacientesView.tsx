/**
 * OllCLin - View: Módulo de Pacientes
 * Arquitetura MVC - Camada Visão
 *
 * Requisitos:
 * - Cadastro/edição reais via tRPC (antes o formulário era apenas visual)
 * - Campos obrigatórios definidos em Configurações > Gerais são aplicados
 *   dinamicamente no formulário (REQ-05-015..019)
 * - Consentimentos LGPD no cadastro
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Search, Plus, Loader2, Pencil, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ORGANIZATION_ID = 1;

type Patient = {
  id: number;
  fullName: string;
  socialName: string | null;
  cpf: string | null;
  rg: string | null;
  birthDate: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  consentDataSharing: boolean;
  consentMarketing: boolean;
  isActive: boolean;
  createdAt: string | null;
};

type PatientForm = {
  fullName: string;
  socialName: string;
  cpf: string;
  rg: string;
  birthDate: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  emergencyContact: string;
  emergencyPhone: string;
  consentDataSharing: boolean;
  consentMarketing: boolean;
};

const emptyForm: PatientForm = {
  fullName: "",
  socialName: "",
  cpf: "",
  rg: "",
  birthDate: "",
  gender: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  emergencyContact: "",
  emergencyPhone: "",
  consentDataSharing: false,
  consentMarketing: false,
};

function text(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Mantém o gênero dentro do domínio aceito pelo contrato tRPC. */
function parseGender(value: string): "M" | "F" | "O" | undefined {
  return value === "M" || value === "F" || value === "O" ? value : undefined;
}

export default function PacientesView() {
  const [search, setSearch] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState<PatientForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const utils = trpc.useUtils();

  /** Configuração real da clínica: quais campos são obrigatórios. */
  const { data: requiredFields } = trpc.pacientes.requiredFields.useQuery({
    organizationId: ORGANIZATION_ID,
  });

  const loadPatients = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await utils.pacientes.list.fetch({
        organizationId: ORGANIZATION_ID,
        search: search || undefined,
        isActive: true,
        limit: 100,
      });
      setPatients(data as unknown as Patient[]);
    } catch (error) {
      console.error("Erro ao carregar pacientes:", error);
      toast.error("Não foi possível carregar os pacientes");
    } finally {
      setIsLoading(false);
    }
  }, [search, utils]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const filteredPatients = useMemo(() => {
    return patients.filter(
      (p) =>
        p.fullName.toLowerCase().includes(search.toLowerCase()) ||
        (p.cpf && p.cpf.includes(search)) ||
        (p.phone && p.phone.includes(search)),
    );
  }, [patients, search]);

  function isRequired(field: string): boolean {
    return requiredFields?.[field] === true;
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setTouched({});
    setOpenDialog(true);
  }

  function openEdit(patient: Patient) {
    setEditing(patient);
    setTouched({});
    setForm({
      fullName: patient.fullName ?? "",
      socialName: patient.socialName ?? "",
      cpf: patient.cpf ?? "",
      rg: patient.rg ?? "",
      birthDate: patient.birthDate ? patient.birthDate.slice(0, 10) : "",
      gender: patient.gender ?? "",
      phone: patient.phone ?? "",
      email: patient.email ?? "",
      address: patient.address ?? "",
      city: patient.city ?? "",
      state: patient.state ?? "",
      zipCode: patient.zipCode ?? "",
      emergencyContact: patient.emergencyContact ?? "",
      emergencyPhone: patient.emergencyPhone ?? "",
      consentDataSharing: patient.consentDataSharing,
      consentMarketing: patient.consentMarketing,
    });
    setOpenDialog(true);
  }

  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (form.fullName.trim().length < 2) errors.fullName = "Informe o nome completo.";
    Object.entries(requiredFields ?? {}).forEach(([field, required]) => {
      if (!required || field === "fullName") return;
      const value = form[field as keyof PatientForm];
      if (typeof value === "string" && value.trim().length === 0) errors[field] = "Este campo é obrigatório.";
    });
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = "Informe um e-mail válido.";
    return errors;
  }, [form, requiredFields]);

  function markTouched(field: string) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function fieldState(field: string) {
    const hasError = Boolean(touched[field] && validationErrors[field]);
    return { "aria-invalid": hasError, "aria-describedby": hasError ? `${field}-error` : undefined, className: hasError ? "border-red-400 focus-visible:ring-red-400" : "" };
  }

  function ErrorMessage({ field }: { field: string }) {
    if (!touched[field] || !validationErrors[field]) return null;
    return <p id={`${field}-error`} className="flex items-center gap-1 text-xs font-medium text-red-600"><AlertCircle className="h-3.5 w-3.5" />{validationErrors[field]}</p>;
  }

  function buildPayload() {
    return {
      organizationId: ORGANIZATION_ID,
      fullName: form.fullName.trim(),
      socialName: text(form.socialName),
      cpf: text(form.cpf),
      rg: text(form.rg),
      birthDate: text(form.birthDate),
      gender: parseGender(form.gender),
      phone: text(form.phone),
      email: text(form.email),
      address: text(form.address),
      city: text(form.city),
      state: text(form.state),
      zipCode: text(form.zipCode),
      emergencyContact: text(form.emergencyContact),
      emergencyPhone: text(form.emergencyPhone),
      consentDataSharing: form.consentDataSharing,
      consentMarketing: form.consentMarketing,
    };
  }

  async function handleSave() {
    setTouched(Object.keys(validationErrors).reduce<Record<string, boolean>>((acc, field) => ({ ...acc, [field]: true }), {}));
    if (Object.keys(validationErrors).length > 0) {
      toast.error("Informe os campos obrigatórios antes de continuar");
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      if (editing) {
        await utils.client.pacientes.update.mutate({ id: editing.id, ...payload });
        toast.success("Paciente atualizado");
      } else {
        await utils.client.pacientes.create.mutate(payload);
        toast.success("Paciente cadastrado");
      }
      setOpenDialog(false);
      setEditing(null);
      setForm(emptyForm);
      setTouched({});
      await loadPatients();
    } catch (error) {
      console.error(error);
      toast.error((error as Error).message || "Falha ao salvar o paciente");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#075e63]">Núcleo clínico</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Pacientes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cadastre, busque e gerencie o histórico dos pacientes da clínica.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Paciente
          </Button>
        </div>
      </div>

      {/* Busca */}
      <div className="flex max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Buscar por nome, CPF ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 border-slate-200 bg-white pl-10 shadow-sm"
          />
        </div>
      </div>

      {/* Tabela de pacientes */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paciente</TableHead>
              <TableHead className="text-center">CPF</TableHead>
              <TableHead className="text-center">Nascimento</TableHead>
              <TableHead className="text-center">Telefone</TableHead>
              <TableHead className="text-center">E-mail</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2 text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando pacientes...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredPatients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                  Nenhum paciente encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredPatients.map((patient) => (
                <TableRow
                  key={patient.id}
                  className="hover:bg-slate-50 transition-colors border-b border-slate-200 last:border-0"
                >
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center text-primary font-medium">
                        {patient.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{patient.fullName}</div>
                        <div className="text-xs text-slate-500">
                          {patient.createdAt
                            ? `${format(new Date(patient.createdAt), "dd/MM/yyyy", { locale: ptBR })} • Cadastro`
                            : "—"}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-center text-foreground/90 font-mono">
                    {patient.cpf || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-center text-foreground/90">
                    {patient.birthDate
                      ? format(new Date(patient.birthDate), "dd/MM/yyyy", { locale: ptBR })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-center text-foreground/90">
                    {patient.phone || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-center text-foreground/90">
                    {patient.email || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="success">Ativo</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      title="Editar paciente"
                      onClick={() => openEdit(patient)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialog: Novo/Editar Paciente */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-slate-200 bg-[#fbfcfa] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Paciente" : "Novo Paciente"}</DialogTitle>
            <DialogDescription>
              Preencha os dados com atenção. Campos marcados com <span className="font-bold text-red-600">*</span> são obrigatórios.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4 p-1"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#075e63]">Identificação</p>
              <div className="space-y-2">
              <Label htmlFor="fullName">
                Nome Completo <span className="text-red-600">*</span>
              </Label>
              <Input
                id="fullName"
                placeholder="Nome completo do paciente"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                onBlur={() => markTouched("fullName")}
                {...fieldState("fullName")}
                required
              />
              <ErrorMessage field="fullName" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="socialName">Nome social</Label>
                <Input
                  id="socialName"
                  value={form.socialName}
                  onChange={(e) => setForm({ ...form, socialName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpf">
                  CPF {isRequired("cpf") && <span className="text-red-600">*</span>}
                </Label>
                <Input
                  id="cpf"
                  placeholder="000.000.000-00"
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                  onBlur={() => markTouched("cpf")}
                  {...fieldState("cpf")}
                  required={isRequired("cpf")}
                />
                <ErrorMessage field="cpf" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rg">
                  RG {isRequired("rg") && <span className="text-red-600">*</span>}
                </Label>
                <Input
                  id="rg"
                  value={form.rg}
                  onChange={(e) => setForm({ ...form, rg: e.target.value })}
                  onBlur={() => markTouched("rg")}
                  {...fieldState("rg")}
                  required={isRequired("rg")}
                />
                <ErrorMessage field="rg" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthDate">
                  Data de Nascimento{" "}
                  {isRequired("birthDate") && <span className="text-red-600">*</span>}
                </Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                  onBlur={() => markTouched("birthDate")}
                  {...fieldState("birthDate")}
                  required={isRequired("birthDate")}
                />
                <ErrorMessage field="birthDate" />
              </div>
              <div className="space-y-2">
                <Label>
                  Gênero {isRequired("gender") && <span className="text-red-600">*</span>}
                </Label>
                <Select
                  value={form.gender}
                  onValueChange={(value) => setForm({ ...form, gender: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Masculino</SelectItem>
                    <SelectItem value="F">Feminino</SelectItem>
                    <SelectItem value="O">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">
                  Telefone {isRequired("phone") && <span className="text-red-600">*</span>}
                </Label>
                <Input
                  id="phone"
                  placeholder="(00) 00000-0000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  onBlur={() => markTouched("phone")}
                  {...fieldState("phone")}
                  required={isRequired("phone")}
                />
                <ErrorMessage field="phone" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">
                  E-mail {isRequired("email") && <span className="text-red-600">*</span>}
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  onBlur={() => markTouched("email")}
                  {...fieldState("email")}
                  required={isRequired("email")}
                />
                <ErrorMessage field="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zipCode">CEP</Label>
                <Input
                  id="zipCode"
                  value={form.zipCode}
                  onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#075e63]">Endereço e contato</p>
            <div className="space-y-2">
              <Label htmlFor="address">
                Endereço {isRequired("address") && <span className="text-red-600">*</span>}
              </Label>
              <Input
                id="address"
                placeholder="Rua, número, complemento"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                onBlur={() => markTouched("address")}
                {...fieldState("address")}
                required={isRequired("address")}
              />
              <ErrorMessage field="address" />
            </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">Cidade</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">UF</Label>
                <Input
                  id="state"
                  maxLength={2}
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergencyContact">
                  Contato de emergência{" "}
                  {isRequired("emergencyContact") && <span className="text-red-600">*</span>}
                </Label>
                <Input
                  id="emergencyContact"
                  value={form.emergencyContact}
                  onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                  onBlur={() => markTouched("emergencyContact")}
                  {...fieldState("emergencyContact")}
                  required={isRequired("emergencyContact")}
                />
                <ErrorMessage field="emergencyContact" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergencyPhone">Telefone de emergência</Label>
                <Input
                  id="emergencyPhone"
                  value={form.emergencyPhone}
                  onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium text-foreground/70">Consentimentos (LGPD)</p>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="consentDataSharing"
                  checked={form.consentDataSharing}
                  onCheckedChange={(v) =>
                    setForm({ ...form, consentDataSharing: v === true })
                  }
                />
                <Label htmlFor="consentDataSharing" className="font-normal text-sm">
                  Autoriza compartilhamento de dados para continuidade do cuidado
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="consentMarketing"
                  checked={form.consentMarketing}
                  onCheckedChange={(v) =>
                    setForm({ ...form, consentMarketing: v === true })
                  }
                />
                <Label htmlFor="consentMarketing" className="font-normal text-sm">
                  Autoriza comunicações de marketing
                </Label>
              </div>
            </div>

            <DialogFooter className="sticky bottom-0 -mx-1 gap-2 border-t border-slate-200 bg-[#fbfcfa]/95 pt-4 backdrop-blur sm:justify-between">
              <p className="hidden items-center gap-1 text-xs text-slate-500 sm:flex"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Seus dados ficam protegidos</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenDialog(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} className="bg-primary text-white hover:bg-primary/90">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editing ? "Salvar alterações" : "Salvar Paciente"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
