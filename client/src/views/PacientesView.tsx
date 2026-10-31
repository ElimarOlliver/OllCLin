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
import { User, Search, Plus, Loader2, Pencil } from "lucide-react";
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
    setOpenDialog(true);
  }

  function openEdit(patient: Patient) {
    setEditing(patient);
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
    if (form.fullName.trim().length < 2) {
      toast.error("Informe o nome completo do paciente");
      return;
    }

    // Validação antecipada usando a configuração da clínica.
    const missing = Object.entries(requiredFields ?? {})
      .filter(([field, required]) => required && field !== "fullName")
      .filter(([field]) => {
        const value = form[field as keyof PatientForm];
        return typeof value === "string" ? value.trim().length === 0 : value === null;
      })
      .map(([field]) => field);
    if (missing.length > 0) {
      toast.error("Preencha todos os campos obrigatórios (*)");
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
      await loadPatients();
    } catch (error) {
      console.error(error);
      toast.error((error as Error).message || "Falha ao salvar o paciente");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pacientes</h1>
          <p className="text-muted text-sm">
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input
            placeholder="Buscar por nome, CPF ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Tabela de pacientes */}
      <div className="bg-white rounded-lg border border-line shadow-sm overflow-x-auto">
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
                  <div className="flex items-center justify-center gap-2 text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando pacientes...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredPatients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted">
                  Nenhum paciente encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredPatients.map((patient) => (
                <TableRow
                  key={patient.id}
                  className="hover:bg-surface/50 transition-colors border-b border-line/50 last:border-0"
                >
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-surface/50 flex items-center justify-center text-primary font-medium">
                        {patient.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{patient.fullName}</div>
                        <div className="text-xs text-muted">
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Paciente" : "Novo Paciente"}</DialogTitle>
            <DialogDescription>
              Campos marcados com <span className="text-red-600">*</span> são
              obrigatórios conforme a configuração da clínica.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4 p-1"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="fullName">
                Nome Completo <span className="text-red-600">*</span>
              </Label>
              <Input
                id="fullName"
                placeholder="Nome completo do paciente"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  required={isRequired("cpf")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rg">
                  RG {isRequired("rg") && <span className="text-red-600">*</span>}
                </Label>
                <Input
                  id="rg"
                  value={form.rg}
                  onChange={(e) => setForm({ ...form, rg: e.target.value })}
                  required={isRequired("rg")}
                />
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
                  required={isRequired("birthDate")}
                />
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
                  required={isRequired("phone")}
                />
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
                  required={isRequired("email")}
                />
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

            <div className="space-y-2">
              <Label htmlFor="address">
                Endereço {isRequired("address") && <span className="text-red-600">*</span>}
              </Label>
              <Input
                id="address"
                placeholder="Rua, número, complemento"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                required={isRequired("address")}
              />
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
                  required={isRequired("emergencyContact")}
                />
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

            <div className="space-y-3 rounded-lg border border-line bg-surface/40 p-3">
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

            <DialogFooter className="gap-2">
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
