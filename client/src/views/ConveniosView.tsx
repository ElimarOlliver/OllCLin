/**
 * OllCLin - View: Módulo de Convênios (Configurações Gerais)
 * Arquitetura MVC - Camada Visão
 *
 * Requisitos (briefing Cap. 05 — Convênios):
 * - REQ-05-001: ação "Adicionar novo convênio"
 * - REQ-05-002: operadora de lista predefinida ou cadastrada manualmente
 * - REQ-05-003: código ANS + versão XML TISS (confirmar com a operadora)
 * - REQ-05-004: salvar, editar e excluir na lista de convênios
 */

import { useState, useEffect, useCallback } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Loader2, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const ORGANIZATION_ID = 1;

const OPERADORAS_PREDEFINIDAS = [
  "Unimed",
  "Amil",
  "Bradesco Saúde",
  "SulAmérica",
  "Hapvida",
  "Notre Dame Intermédica",
  "Particular",
];

type HealthPlan = {
  id: number;
  operatorName: string;
  ansCode: string | null;
  tissXmlVersion: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
};

const emptyForm = {
  operatorName: "",
  ansCode: "",
  tissXmlVersion: "",
  contactEmail: "",
  contactPhone: "",
};

export default function ConveniosView() {
  const [search, setSearch] = useState("");
  const [plans, setPlans] = useState<HealthPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const utils = trpc.useUtils();

  const loadPlans = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await utils.convenios.list.fetch({
        organizationId: ORGANIZATION_ID,
        search: search || undefined,
        limit: 100,
      });
      setPlans(data as unknown as HealthPlan[]);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível carregar os convênios");
    } finally {
      setIsLoading(false);
    }
  }, [utils, search]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(plan: HealthPlan) {
    setEditingId(plan.id);
    setForm({
      operatorName: plan.operatorName,
      ansCode: plan.ansCode ?? "",
      tissXmlVersion: plan.tissXmlVersion ?? "",
      contactEmail: plan.contactEmail ?? "",
      contactPhone: plan.contactPhone ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (form.operatorName.trim().length < 2) {
      toast.error("Informe o nome da operadora");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        organizationId: ORGANIZATION_ID,
        operatorName: form.operatorName.trim(),
        ansCode: form.ansCode.trim() || undefined,
        tissXmlVersion: form.tissXmlVersion.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
      };
      if (editingId) {
        await utils.client.convenios.update.mutate({ id: editingId, ...payload });
        toast.success("Convênio atualizado");
      } else {
        await utils.client.convenios.create.mutate(payload);
        toast.success("Convênio cadastrado");
      }
      setDialogOpen(false);
      await loadPlans();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao salvar o convênio");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(plan: HealthPlan) {
    if (!confirm(`Inativar o convênio "${plan.operatorName}"?`)) return;
    try {
      await utils.client.convenios.delete.mutate({
        id: plan.id,
        organizationId: ORGANIZATION_ID,
      });
      toast.success("Convênio inativado");
      await loadPlans();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao inativar o convênio");
    }
  }

  return (
    <div className="p-2 space-y-4">
      <div className="bg-white rounded-lg border border-line shadow-sm p-6">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Convênios
            </h1>
            <p className="text-muted text-sm mt-1">
              Cadastre operadoras para uso em agendamentos e faturamento TISS.
            </p>
          </div>
          <Button onClick={openCreate} className="bg-primary text-white hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-1" /> Adicionar novo convênio
          </Button>
        </div>

        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar convênio..."
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : plans.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">
            Nenhum convênio cadastrado.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operadora</TableHead>
                <TableHead>Código ANS</TableHead>
                <TableHead>XML TISS</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.operatorName}</TableCell>
                  <TableCell>{plan.ansCode || "—"}</TableCell>
                  <TableCell>{plan.tissXmlVersion || "—"}</TableCell>
                  <TableCell>{plan.contactEmail || plan.contactPhone || "—"}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        plan.isActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-600"
                      }
                    >
                      {plan.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(plan)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(plan)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar convênio" : "Adicionar novo convênio"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="operatorName">Operadora *</Label>
              <Input
                id="operatorName"
                value={form.operatorName}
                onChange={(e) => setForm({ ...form, operatorName: e.target.value })}
                list="operadoras-predefinidas"
                placeholder="Selecione ou digite o nome da operadora"
              />
              <datalist id="operadoras-predefinidas">
                {OPERADORAS_PREDEFINIDAS.map((op) => (
                  <option key={op} value={op} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="ansCode">Código ANS</Label>
                <Input
                  id="ansCode"
                  value={form.ansCode}
                  onChange={(e) => setForm({ ...form, ansCode: e.target.value })}
                  placeholder="Consulte o registro na ANS"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tissXmlVersion">Versão XML TISS</Label>
                <Input
                  id="tissXmlVersion"
                  value={form.tissXmlVersion}
                  onChange={(e) => setForm({ ...form, tissXmlVersion: e.target.value })}
                  placeholder="Confirmar com a operadora"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="contactEmail">E-mail de contato</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contactPhone">Telefone de contato</Label>
                <Input
                  id="contactPhone"
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-primary text-white hover:bg-primary/90">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
