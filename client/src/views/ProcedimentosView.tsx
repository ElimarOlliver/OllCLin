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
} from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function ProcedimentosView() {
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

  const utils = trpc.useUtils();

  useEffect(() => {
    loadProcedures();
  }, [search]);

  async function loadProcedures() {
    setIsLoading(true);
    try {
      const data = await utils.procedimentos.list.fetch({
        organizationId: 1,
        search: search || undefined,
        isActive: true,
        limit: 100,
      });
      setProcedures(data as any);
    } catch (error) {
      console.error("Erro ao carregar procedimentos:", error);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Procedimentos</h1>
          <p className="text-muted text-sm">
            Catálogo de procedimentos da clínica com duração e preço.
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Procedimento
        </Button>
      </div>

      <div className="flex max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input
            placeholder="Buscar por nome ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-line shadow-sm overflow-hidden">
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
                <TableCell colSpan={6} className="text-center py-8 text-muted">
                  Nenhum procedimento encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((proc) => (
                <TableRow
                  key={proc.id}
                  className="hover:bg-surface/50 transition-colors border-b border-line/50 last:border-0"
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
                    <Button variant="outline" size="sm">
                      <CalendarDays className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}