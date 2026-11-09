/**
 * OllCLin - View: Módulo de Procedimentos
 * Arquitetura MVC - Camada Visão
 */

import { useState, useEffect, useMemo } from "react";
import {
  Input,
} from "@/components/ui/input";
import {
  Button,
} from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Badge,
} from "@/components/ui/badge";
import {
  CalendarDays,
  Search,
  Plus,
  Loader2,
  Pencil,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useOrganizationId } from "@/hooks/useOrganizationId";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function ProcedimentosView() {
  const ORGANIZATION_ID = useOrganizationId();
  const [search, setSearch] = useState("");
  const [procedures, setProcedures] = useState<Array<{
    id: number;
    name: string;
    description?: string;
    durationMinutes: number;
    price: string;
    isActive: boolean;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<(typeof procedures)[number] | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", durationMinutes: "30", price: "0.00" });

  const utils = trpc.useUtils();

  useEffect(() => {
    loadProcedures();
  }, [search]);

  async function loadProcedures() {
    setIsLoading(true);
    try {
      const data = await utils.procedimentos.list.fetch({
        organizationId: ORGANIZATION_ID,
        search: search || undefined,
        isActive: true,
        limit: 100,
      });
      setProcedures(data as any);
    } catch (error) {
      console.error("Erro ao carregar procedimentos:", error);
      toast.error("Não foi possível carregar os procedimentos");
    } finally {
      setIsLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return procedures.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase())),
    );
  }, [procedures, search]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", description: "", durationMinutes: "30", price: "0.00" });
    setDialogOpen(true);
  }

  function openEdit(procedure: (typeof procedures)[number]) {
    setEditing(procedure);
    setForm({ name: procedure.name, description: procedure.description ?? "", durationMinutes: String(procedure.durationMinutes), price: procedure.price });
    setDialogOpen(true);
  }

  async function handleSave() {
    const duration = Number(form.durationMinutes);
    if (form.name.trim().length < 2) return toast.error("Informe o nome do procedimento");
    if (!Number.isInteger(duration) || duration <= 0) return toast.error("A duração deve ser maior que zero");
    setSaving(true);
    try {
      const payload = { organizationId: ORGANIZATION_ID, name: form.name.trim(), description: form.description.trim() || undefined, durationMinutes: duration, price: form.price || "0.00", isActive: true };
      if (editing) await utils.client.procedimentos.update.mutate({ id: editing.id, ...payload });
      else await utils.client.procedimentos.create.mutate(payload);
      toast.success(editing ? "Procedimento atualizado" : "Procedimento cadastrado");
      setDialogOpen(false);
      await loadProcedures();
    } catch (error) {
      toast.error((error as Error).message || "Falha ao salvar o procedimento");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Procedimentos</h1>
          <p className="text-slate-500 text-sm">
            Catálogo de procedimentos da clínica com duração e preço.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Procedimento
        </Button>
      </div>

      <div className="flex max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Buscar por nome ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Procedimento</TableHead>
              <TableHead className="text-center">Descrição</TableHead>
              <TableHead className="text-center">Duração</TableHead>
              <TableHead className="text-center">Preço</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando procedimentos...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                  Nenhum procedimento encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((proc) => (
                <TableRow
                  key={proc.id}
                  className="hover:bg-slate-50 transition-colors border-b border-slate-200 last:border-0"
                >
                  <TableCell className="font-medium text-foreground">
                    {proc.name}
                  </TableCell>
                  <TableCell className="text-sm text-foreground/70">
                    {proc.description || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-center text-foreground/90">
                    {proc.durationMinutes} min
                  </TableCell>
                  <TableCell className="text-sm text-center text-foreground/90 font-mono">
                    R$ {proc.price}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="success">Ativo</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" aria-label={`Editar ${proc.name}`} onClick={() => openEdit(proc)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar procedimento" : "Novo procedimento"}</DialogTitle>
            <DialogDescription>Informe os dados do procedimento e mantenha o catálogo atualizado.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void handleSave(); }}>
            <div className="space-y-2"><Label htmlFor="procedureName">Nome <span className="text-red-600">*</span></Label><Input id="procedureName" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div>
            <div className="space-y-2"><Label htmlFor="procedureDescription">Descrição</Label><Input id="procedureDescription" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="procedureDuration">Duração (minutos) <span className="text-red-600">*</span></Label><Input id="procedureDuration" type="number" min="1" step="1" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} required /></div><div className="space-y-2"><Label htmlFor="procedurePrice">Preço</Label><Input id="procedurePrice" inputMode="decimal" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></div></div>
            <DialogFooter className="flex-col-reverse sm:flex-row"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Salvar alterações" : "Cadastrar procedimento"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
