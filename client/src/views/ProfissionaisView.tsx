/**
 * OllCLin - View: Módulo de Profissionais de Saúde
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
  User,
  Search,
  Plus,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function ProfissionaisView() {
  const [search, setSearch] = useState("");
  const [professionals, setProfessionals] = useState<Array<{
    id: number;
    fullName: string;
    cpf?: string;
    council?: string;
    councilNumber?: string;
    specialty?: string;
    phone?: string;
    email?: string;
    isActive: boolean;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  const utils = trpc.useUtils();

  useEffect(() => {
    loadProfessionals();
  }, [search]);

  async function loadProfessionals() {
    setIsLoading(true);
    try {
      const data = await utils.profissionais.list.fetch({
        organizationId: 1,
        search: search || undefined,
        isActive: true,
        limit: 100,
      });
      setProfessionals(data as any);
    } catch (error) {
      console.error("Erro ao carregar profissionais:", error);
    } finally {
      setIsLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return professionals.filter((p) =>
      p.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (p.specialty && p.specialty.toLowerCase().includes(search.toLowerCase())) ||
      (p.cpf && p.cpf.includes(search)),
    );
  }, [professionals, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Profissionais de Saúde</h1>
          <p className="text-muted text-sm">
            Cadastre médicos, dentores, terapeutas e outros profissionais da clínica.
          </p>
        </div>
        <Button>
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

      <div className="bg-white rounded-lg border border-line shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Profissional</TableHead>
              <TableHead className="text-center">Especialidade</TableHead>
              <TableHead className="text-center">Conselho</TableHead>
              <TableHead className="text-center">CPF</TableHead>
              <TableHead className="text-center">Telefone</TableHead>
              <TableHead className="text-center">E-mail</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando profissionais...
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
                      <div className="text-sm font-medium">{prof.fullName}</div>
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
                  <TableCell className="text-sm text-center text-foreground/90">
                    {prof.email || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="success">Ativo</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" className="w-8 p-0">
                      <User className="h-4 w-4" />
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