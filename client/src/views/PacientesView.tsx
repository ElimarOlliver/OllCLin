/**
 * OllCLin - View: Módulo de Pacientes
 * Arquitetura MVC - Camada Visão
 */

import { useState, useEffect } from "react";
import { useMemo } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  User,
  Search,
  Plus,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function PacientesView() {
  const [search, setSearch] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const [patients, setPatients] = useState<Array<{
    id: number;
    fullName: string;
    cpf?: string;
    phone?: string;
    email?: string;
    birthDate?: string;
    gender?: string;
    isActive: boolean;
    createdAt: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  const utils = trpc.useUtils();

  useEffect(() => {
    loadPatients();
  }, [search]);

  async function loadPatients() {
    setIsLoading(true);
    try {
      const data = await utils.pacientes.list.fetch({
        organizationId: 1,
        search: search || undefined,
        isActive: true,
        limit: 100,
      });
      setPatients(data as any);
    } catch (error) {
      console.error("Erro ao carregar pacientes:", error);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredPatients = useMemo(() => {
    return patients.filter((p) =>
      p.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (p.cpf && p.cpf.includes(search)) ||
      (p.phone && p.phone.includes(search)),
    );
  }, [patients, search]);

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
          <Button onClick={() => setOpenDialog(true)}>
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
      <div className="bg-white rounded-lg border border-line shadow-sm overflow-hidden">
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
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando pacientes...
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
                        <div className="text-xs text-muted">{format(new Date(patient.createdAt), "dd/MM/yyyy", { locale: ptBR })} • Cadastro</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-center text-foreground/90 font-mono">
                    {patient.cpf || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-center text-foreground/90">
                    {patient.birthDate ? format(new Date(patient.birthDate), "dd/MM/yyyy", { locale: ptBR }) : "—"}
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

      {/* Dialog: Novo Paciente */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogTrigger asChild>
          <Button variant="outline" hidden />
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Paciente</DialogTitle>
            <DialogDescription>
              Cadastre os dados pessoais do paciente
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4 p-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground/70 block">
                Nome Completo *
              </label>
              <Input placeholder="Nome completo do paciente" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground/70 block">
                  CPF
                </label>
                <Input placeholder="000.000.000-00" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground/70 block">
                  Data de Nascimento
                </label>
                <Input type="date" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground/70 block">
                  Telefone
                </label>
                <Input placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground/70 block">
                  E-mail
                </label>
                <Input type="email" placeholder="email@exemplo.com" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground/70 block">
                Gênero
              </label>
              <Select defaultValue="">
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
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setOpenDialog(false)}>
                Cancelar
              </Button>
              <Button variant="primary" type="submit">
                Salvar Paciente
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}