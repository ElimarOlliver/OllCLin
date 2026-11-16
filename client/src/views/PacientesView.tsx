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

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
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
import { User, Search, Plus, Loader2, Pencil, AlertCircle, CheckCircle2, Upload, Download, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useOrganizationId } from "@/hooks/useOrganizationId";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

type ImportRowError = { row: number; field?: string; message: string };

type ImportPatientRow = {
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
  isMinor: boolean;
  guardianPatientId: number | null;
  guardianName: string | null;
  guardianDocument: string | null;
  consentStatus: string;
};

type ImportPreview = {
  batchId: number | null;
  fileName: string;
  fileType: string;
  status: string;
  columns: string[];
  rows: ImportPatientRow[];
  errors: ImportRowError[];
  totalRows: number;
  validRows: number;
  rejectedRows: number;
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
  const ORGANIZATION_ID = useOrganizationId();
  const [search, setSearch] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState<PatientForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [exporting, setExporting] = useState(false);

  const utils = trpc.useUtils();

  const createImportBatchMutation = trpc.imports.createBatch.useMutation({
    onSuccess: (preview) => setImportPreview(preview),
  });

  const confirmImportMutation = trpc.imports.confirm.useMutation({
    onSuccess: (result) => {
      toast.success(`Importação concluída: ${result.importedRows} paciente(s) importado(s) e ${result.rejectedRows} rejeitado(s).`);
      setImportOpen(false);
      setImportPreview(null);
      void loadPatients();
    },
  });

  const exportAppointmentsCsvMutation = trpc.relatorios.appointmentsCsv.useMutation({
    onError: (error) => {
      toast.error(String(error?.message) || "Falha ao exportar CSV");
    },
  });

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

  async function handleExportCsv() {
    setExporting(true);
    try {
      const result = await exportAppointmentsCsvMutation.mutateAsync({ organizationId: ORGANIZATION_ID });
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ollclin_consultas_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Exportação CSV gerada com sucesso.");
    } catch (error) {
      console.error(error);
      toast.error((error as Error).message || "Falha ao exportar CSV");
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportPreview(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = String(reader.result).split(",")[1] ?? "";
        await createImportBatchMutation.mutateAsync({
          organizationId: ORGANIZATION_ID,
          fileName: file.name,
          fileType: (file.name.split(".").pop() ?? "csv").toLowerCase(),
          contentBase64: base64,
        });
      } catch (error) {
        console.error(error);
        toast.error((error as Error).message || "Falha ao ler o arquivo de importação");
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleConfirmImport() {
    if (!importPreview?.batchId) return;
    try {
      const result = await confirmImportMutation.mutateAsync({
        batchId: importPreview.batchId,
        organizationId: ORGANIZATION_ID,
      });
      toast.success(`Importação concluída: ${result.importedRows} paciente(s) importado(s) e ${result.rejectedRows} rejeitado(s).`);
      setImportOpen(false);
      setImportPreview(null);
      await loadPatients();
    } catch (error) {
      console.error(error);
      toast.error((error as Error).message || "Falha ao confirmar importação");
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Núcleo clínico</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Pacientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre, busque e gerencie o histórico dos pacientes da clínica.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-sm:grid max-sm:grid-cols-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="max-sm:order-2">
            <Upload className="mr-2 h-4 w-4" />
            Importar
          </Button>
          <Button variant="outline" onClick={handleExportCsv} disabled={exporting} className="max-sm:order-3">
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            <span className="hidden sm:inline">Exportar consultas (CSV)</span>
            <span className="sm:hidden">Exportar CSV</span>
          </Button>
          <Button onClick={openCreate} className="max-sm:order-1 max-sm:col-span-2">
            <Plus className="h-4 w-4 mr-2" />
            Novo Paciente
          </Button>
        </div>
      </div>

      {/* Busca */}
      <div className="flex max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 border-border bg-card pl-10 shadow-sm"
          />
        </div>
      </div>

      {/* Mobile: mesma lista em cards (a tabela só aparece a partir de md) */}
      <div className="space-y-3 md:hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando pacientes...
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
            Nenhum paciente encontrado.
          </div>
        ) : (
          filteredPatients.map((patient) => (
            <article key={patient.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary">
                    {patient.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{patient.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">{patient.phone || "Sem telefone"}</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${patient.fullName}`}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(patient)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar paciente
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div className="min-w-0">
                  <dt className="text-muted-foreground">CPF</dt>
                  <dd className="truncate font-mono text-foreground-soft">{patient.cpf || "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Nascimento</dt>
                  <dd className="truncate text-foreground-soft">
                    {patient.birthDate ? format(new Date(patient.birthDate), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                  </dd>
                </div>
                <div className="col-span-2 min-w-0">
                  <dt className="text-muted-foreground">E-mail</dt>
                  <dd className="truncate text-foreground-soft">{patient.email || "—"}</dd>
                </div>
              </dl>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <Badge variant="success">Ativo</Badge>
                <Button variant="outline" size="sm" onClick={() => openEdit(patient)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Editar
                </Button>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Tabela de pacientes */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card shadow-sm md:block">
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
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando pacientes...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredPatients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum paciente encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredPatients.map((patient) => (
                <TableRow
                  key={patient.id}
                  className="hover:bg-muted transition-colors border-b border-border last:border-0"
                >
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-primary font-medium">
                        {patient.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{patient.fullName}</div>
                        <div className="text-xs text-muted-foreground">
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

      {/* Dialog: Importação de pacientes (CSV/TSV) */}
      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) setImportPreview(null);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-popover sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Importar pacientes</DialogTitle>
            <DialogDescription>
              Envie um arquivo CSV ou TSV com cabeçalho na primeira linha. O sistema valida os
              dados e mostra uma prévia antes de gravar qualquer informação.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 p-1">
            <div className="rounded-xl border border-dashed border-border bg-card p-4">
              <Label htmlFor="import-file" className="text-sm font-medium">
                Arquivo (.csv, .tsv, .txt)
              </Label>
              <Input
                id="import-file"
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                className="mt-2 cursor-pointer bg-card"
                onChange={handleImportFileChange}
                disabled={createImportBatchMutation.isPending}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Colunas reconhecidas: nome, cpf, data de nascimento, telefone, e-mail, endereço,
                cidade, UF, CEP, responsável e CPF do responsável.
              </p>
              {createImportBatchMutation.isPending && (
                <p className="mt-2 flex items-center gap-2 text-sm text-foreground-soft">
                  <Loader2 className="h-4 w-4 animate-spin" /> Processando arquivo...
                </p>
              )}
            </div>

            {importPreview && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Linhas</p>
                    <p className="text-lg font-semibold text-foreground">{importPreview.totalRows}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs text-emerald-700">Válidas</p>
                    <p className="text-lg font-semibold text-emerald-700">{importPreview.validRows}</p>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-xs text-red-700">Rejeitadas</p>
                    <p className="text-lg font-semibold text-red-700">{importPreview.rejectedRows}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Colunas</p>
                    <p className="text-lg font-semibold text-foreground">{importPreview.columns.length}</p>
                  </div>
                </div>

                {importPreview.errors.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="mb-2 flex items-center gap-1 text-sm font-medium text-red-700">
                      <AlertCircle className="h-4 w-4" /> Linhas rejeitadas
                    </p>
                    <ul className="space-y-1 text-xs text-red-700">
                      {importPreview.errors.map((error, index) => (
                        <li key={`${error.row}-${index}`}>
                          Linha {error.row}
                          {error.field ? ` (${error.field})` : ""}: {error.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {importPreview.validRows > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-border bg-card">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>CPF</TableHead>
                          <TableHead>Nascimento</TableHead>
                          <TableHead>Responsável</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importPreview.rows.slice(0, 10).map((row, index) => (
                          <TableRow key={`${row.fullName}-${index}`}>
                            <TableCell className="text-sm">{row.fullName}</TableCell>
                            <TableCell className="text-sm font-mono">{row.cpf || "—"}</TableCell>
                            <TableCell className="text-sm">{row.birthDate || "—"}</TableCell>
                            <TableCell className="text-sm">{row.guardianName || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {importPreview.validRows > 10 && (
                      <p className="border-t border-border p-2 text-xs text-muted-foreground">
                        Exibindo as primeiras 10 de {importPreview.validRows} linhas válidas.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setImportOpen(false);
                setImportPreview(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmImport}
              disabled={
                !importPreview?.batchId ||
                importPreview.validRows === 0 ||
                confirmImportMutation.isPending
              }
            >
              {confirmImportMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Confirmar importação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Novo/Editar Paciente */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-popover sm:max-w-3xl">
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
            <div className="rounded-xl border border-teal-100 bg-primary-soft/60 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-primary">Identificação</p>
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

            <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
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
                  lang="pt-BR"
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

            <div className="space-y-2 rounded-xl border border-border bg-card p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-primary">Endereço e contato</p>
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

            <div className="space-y-3 rounded-xl border border-border bg-muted p-4">
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

            <DialogFooter className="sticky bottom-0 -mx-1 gap-2 border-t border-border bg-popover/95 pt-4 backdrop-blur sm:justify-between">
              <p className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Seus dados ficam protegidos</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenDialog(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
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
