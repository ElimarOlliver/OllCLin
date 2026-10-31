/**
 * OllCLin - View: Módulo de Profissionais de Saúde
 * Arquitetura MVC - Camada Visão
 *
 * Requisitos:
 * - Cadastro/edição reais via tRPC (antes o botão era apenas visual)
 * - Percentual de comissão (%) usado pelo Repasse (Cap. 15.3)
 * - Desativação respeita soft delete (is_active = false)
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  User,
  Search,
  Plus,
  Loader2,
  Pencil,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const ORGANIZATION_ID = 1;

type Professional = {
  id: number;
  fullName: string;
  cpf: string | null;
  council: string | null;
  councilNumber: string | null;
  specialty: string | null;
  phone: string | null;
  email: string | null;
  commissionPercentage: number;
  isActive: boolean;
};

type ProfessionalForm = {
  fullName: string;
  cpf: string;
  council: string;
  councilNumber: string;
  specialty: string;
  phone: string;
  email: string;
  commissionPercentage: string;
};

const emptyForm: ProfessionalForm = {
  fullName: "",
  cpf: "",
  council: "",
  councilNumber: "",
  specialty: "",
  phone: "",
  email: "",
  commissionPercentage: "0",
};

function text(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export default function ProfissionaisView() {
  const [search, setSearch] = useState("");
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Professional | null>(null);
  const [form, setForm] = useState<ProfessionalForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Professional | null>(null);

  const utils = trpc.useUtils();

  const loadProfessionals = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await utils.profissionais.list.fetch({
        organizationId: ORGANIZATION_ID,
        search: search || undefined,
        isActive: true,
        limit: 100,
      });
      setProfessionals(data as unknown as Professional[]);
    } catch (error) {
      console.error("Erro ao carregar profissionais:", error);
      toast.error("Não foi possível carregar os profissionais");
    } finally {
      setIsLoading(false);
    }
  }, [search, utils]);

  useEffect(() => {
    loadProfessionals();
  }, [loadProfessionals]);

  const filtered = useMemo(() => {
    return professionals.filter(
      (p) =>
        p.fullName.toLowerCase().includes(search.toLowerCase()) ||
        (p.specialty && p.specialty.toLowerCase().includes(search.toLowerCase())) ||
        (p.cpf && p.cpf.includes(search)),
    );
  }, [professionals, search]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(professional: Professional) {
    setEditing(professional);
    setForm({
      fullName: professional.fullName ?? "",
      cpf: professional.cpf ?? "",
      council: professional.council ?? "",
      councilNumber: professional.councilNumber ?? "",
      specialty: professional.specialty ?? "",
      phone: professional.phone ?? "",
      email: professional.email ?? "",
      commissionPercentage: String(professional.commissionPercentage ?? 0),
    });
    setDialogOpen(true);
  }

  function buildPayload() {
    const commission = Number(form.commissionPercentage.replace(",", "."));
    return {
      organizationId: ORGANIZATION_ID,
      fullName: form.fullName.trim(),
      cpf: text(form.cpf),
      council: text(form.council),
      councilNumber: text(form.councilNumber),
      specialty: text(form.specialty),
      phone: text(form.phone),
      email: text(form.email),
      commissionPercentage: Number.isFinite(commission)
        ? Math.max(0, Math.min(100, commission))
        : 0,
    };
  }

  async function handleSave() {
    if (form.fullName.trim().length < 2) {
      toast.error("Informe o nome completo do profissional");
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      if (editing) {
        await utils.client.profissionais.update.mutate({ id: editing.id, ...payload });
        toast.success("Profissional atualizado");
      } else {
        await utils.client.profissionais.create.mutate(payload);
        toast.success("Profissional cadastrado");
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await loadProfessionals();
    } catch (error) {
      console.error(error);
      toast.error((error as Error).message || "Falha ao salvar o profissional");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    try {
      await utils.client.profissionais.delete.mutate({
        id: deactivateTarget.id,
        organizationId: ORGANIZATION_ID,
      });
      toast.success("Profissional desativado");
      setDeactivateTarget(null);
      await loadProfessionals();
    } catch (error) {
      console.error(error);
      toast.error((error as Error).message || "Falha ao desativar o profissional");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Profissionais de Saúde</h1>
          <p className="text-muted text-sm">
            Cadastre médicos, dentistas, terapeutas e outros profissionais da clínica.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Profissional
        </Button>
      </div>

      <div className="flex max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input
            placeholder="Buscar por nome, especialidade ou CPF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-line shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Profissional</TableHead>
              <TableHead className="text-center">Especialidade</TableHead>
              <TableHead className="text-center">Conselho</TableHead>
              <TableHead className="text-center">CPF</TableHead>
              <TableHead className="text-center">Telefone</TableHead>
              <TableHead className="text-center">Repasse</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2 text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando profissionais...
                  </div>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted">
                  Nenhum profissional encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((prof) => (
                <TableRow
                  key={prof.id}
                  className="hover:bg-surface/50 transition-colors border-b border-line/50 last:border-0"
                >
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-surface/50 flex items-center justify-center text-primary font-medium">
                        {prof.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{prof.fullName}</div>
                        <div className="text-xs text-muted">{prof.email || "—"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-center text-foreground/90">
                    {prof.specialty || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-center text-foreground/90 font-mono">
                    {prof.council || prof.councilNumber
                      ? `${prof.council ?? ""} ${prof.councilNumber ?? ""}`.trim()
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-center text-foreground/90 font-mono">
                    {prof.cpf || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-center text-foreground/90">
                    {prof.phone || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-center font-medium text-foreground/90">
                    {prof.commissionPercentage}%
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="success">Ativo</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        title="Editar profissional"
                        onClick={() => openEdit(prof)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Desativar profissional"
                        onClick={() => setDeactivateTarget(prof)}
                      >
                        <UserX className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialog: Novo/Editar Profissional */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Profissional" : "Novo Profissional"}</DialogTitle>
            <DialogDescription>
              O percentual de repasse é usado como padrão ao apurar os repasses deste
              profissional.
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
              <Label htmlFor="profFullName">
                Nome Completo <span className="text-red-600">*</span>
              </Label>
              <Input
                id="profFullName"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="profSpecialty">Especialidade</Label>
                <Input
                  id="profSpecialty"
                  value={form.specialty}
                  onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profCommission">Repasse (%)</Label>
                <Input
                  id="profCommission"
                  inputMode="decimal"
                  value={form.commissionPercentage}
                  onChange={(e) =>
                    setForm({ ...form, commissionPercentage: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profCpf">CPF</Label>
                <Input
                  id="profCpf"
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profCouncil">Conselho</Label>
                <Input
                  id="profCouncil"
                  value={form.council}
                  onChange={(e) => setForm({ ...form, council: e.target.value })}
                  placeholder="CRM, CRO, CRP..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profCouncilNumber">Número do conselho</Label>
                <Input
                  id="profCouncilNumber"
                  value={form.councilNumber}
                  onChange={(e) => setForm({ ...form, councilNumber: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profPhone">Telefone</Label>
                <Input
                  id="profPhone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="profEmail">E-mail</Label>
                <Input
                  id="profEmail"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-primary text-white hover:bg-primary/90"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editing ? "Salvar alterações" : "Salvar Profissional"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmação de desativação (soft delete) */}
      <Dialog
        open={!!deactivateTarget}
        onOpenChange={(v) => !v && setDeactivateTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desativar profissional</DialogTitle>
            <DialogDescription>
              O profissional deixa de aparecer nas listas e seleções, mas o histórico é
              preservado (exclusão lógica).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleDeactivate}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Desativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
