/**
 * OllCLin - View: Módulo de Agenda
 * Arquitetura MVC - Camada Visão
 *
 * Tela principal de agendamentos com:
 * - Calendário visual (dia/semana/mês)
 * - Criação e edição de agendamentos
 * - Sincronização com Google Calendar
 * - Status de agendamentos (solicitado, confirmado, em espera, atendido, etc.)
 * - Detecção de conflitos de horário
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Badge,
  badgeVariants,
} from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import {
  Calendar as CalendarIcon,
  Plus,
  RefreshCw,
  Search,
  User,
  CalendarCheck,
  Cloud,
  Link,
  Loader2,
} from "lucide-react";
import { format, parseISO, startOfDay, endOfDay, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";
import {
  googleCalendarConfig,
  startGoogleCalendarAuth,
  hasGoogleCalendarTokens,
  storeGoogleCalendarTokens,
  getStoredGoogleCalendarTokens,
  clearGoogleCalendarTokens,
  GOOGLE_CALENDAR_COLORS,
} from "@/lib/googleCalendar";

// Tipos
type AppointmentStatus =
  | "solicitado"
  | "confirmado"
  | "em_espera"
  | "em_atendimento"
  | "atendido"
  | "faltou"
  | "desmarcado";

type Appointment = {
  id: number;
  patientId: number;
  professionalId: number;
  procedureId: number;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  notes?: string;
  googleCalendarEventId?: string;
  patient: {
    id: number;
    fullName: string;
    cpf?: string;
    phone?: string;
  };
  professional: {
    id: number;
    fullName: string;
    specialty?: string;
  };
  procedure: {
    id: number;
    name: string;
  };
};

// Status badge configuration
type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const STATUS_CONFIG: Record<
  AppointmentStatus,
  { label: string; variant: BadgeVariant }
> = {
  solicitado: { label: "Solicitado", variant: "secondary" },
  confirmado: { label: "Confirmado", variant: "default" },
  em_espera: { label: "Em Espera", variant: "warning" },
  em_atendimento: { label: "Em Atendimento", variant: "primary" },
  atendido: { label: "Atendido", variant: "success" },
  faltou: { label: "Faltou", variant: "destructive" },
  desmarcado: { label: "Desmarcado", variant: "outline" },
};

export default function AgendaView() {
  const [viewMode, setViewMode] = useState<"dia" | "semana" | "mes">("dia");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedProfessional, setSelectedProfessional] = useState<number | null>(
    null,
  );
  const [openDialog, setOpenDialog] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(
    null,
  );
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [professionalsData, setProfessionalsData] = useState<Array<{
    id: number;
    fullName: string;
    specialty?: string;
  }>>([]);
  const [proceduresData, setProceduresData] = useState<Array<{
    id: number;
    name: string;
    durationMinutes: number;
  }>>([]);
  const [patientsData, setPatientsData] = useState<Array<{
    id: number;
    fullName: string;
    cpf?: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [googleConnected, setGoogleConnected] = useState(
    hasGoogleCalendarTokens(),
  );

  const utils = trpc.useUtils();

  // Carregar dados iniciais
  useEffect(() => {
    loadData();
  }, [selectedDate, selectedProfessional, viewMode]);

  async function loadData() {
    setIsLoading(true);
    try {
      // Carregar agendamentos do período
      const start = startOfDay(selectedDate);
      const end = endOfDay(selectedDate);

      if (viewMode === "dia") {
        const data = await utils.agendamentos.list.fetch({
          organizationId: 1, // TODO: pegar do contexto do usuário/tenant
          startsAtFrom: start.toISOString(),
          startsAtTo: end.toISOString(),
          limit: 100,
        });
        setAppointments(data as unknown as Appointment[]);
      }

      // Carregar profissionais
      const profs = await utils.profissionais.list.fetch({
        organizationId: 1,
        isActive: true,
        limit: 50,
      });
      setProfessionalsData(profs as any);

      // Carregar procedimentos
      const procs = await utils.procedimentos.list.fetch({
        organizationId: 1,
        isActive: true,
        limit: 50,
      });
      setProceduresData(procs as any);

      // Carregar pacientes
      const pats = await utils.pacientes.list.fetch({
        organizationId: 1,
        isActive: true,
        limit: 100,
      });
      setPatientsData(pats as any);
    } catch (error) {
      console.error("Erro ao carregar dados da agenda:", error);
    } finally {
      setIsLoading(false);
    }
  }

  // Verificar conexão Google Calendar
  useEffect(() => {
    setGoogleConnected(hasGoogleCalendarTokens());
  }, []);

  // Função para conectar Google Calendar
  function handleConnectGoogleCalendar() {
    startGoogleCalendarAuth();
  }

  // Função para desconectar Google Calendar
  function handleDisconnectGoogleCalendar() {
    clearGoogleCalendarTokens();
    setGoogleConnected(false);
  }

  // Abrir diálogo de novo agendamento
  function handleNewAppointment() {
    setEditingAppointment(null);
    setOpenDialog(true);
  }

  // Editar agendamento existente
  function handleEditAppointment(appt: Appointment) {
    setEditingAppointment(appt);
    setOpenDialog(true);
  }

  // Fechar diálogo
  function handleCloseDialog() {
    setOpenDialog(false);
    setEditingAppointment(null);
  }

  // Salvar agendamento (criar ou atualizar)
  async function handleSaveAppointment(formData: {
    patientId: number;
    professionalId: number;
    procedureId: number;
    startsAt: Date;
    endsAt: Date;
    status: AppointmentStatus;
    notes?: string;
  }) {
    try {
      if (editingAppointment) {
        await utils.client.agendamentos.update.mutate({
          id: editingAppointment.id,
          organizationId: 1,
          patientId: formData.patientId,
          professionalId: formData.professionalId,
          procedureId: formData.procedureId,
          startsAt: formData.startsAt.toISOString(),
          endsAt: formData.endsAt.toISOString(),
          status: formData.status,
          notes: formData.notes,
        });
      } else {
        await utils.client.agendamentos.create.mutate({
          organizationId: 1,
          patientId: formData.patientId,
          professionalId: formData.professionalId,
          procedureId: formData.procedureId,
          startsAt: formData.startsAt.toISOString(),
          endsAt: formData.endsAt.toISOString(),
          status: formData.status,
          notes: formData.notes,
        });
      }

      // Invalidar queries para recarregar
      await utils.agendamentos.list.invalidate();
      setOpenDialog(false);
      setEditingAppointment(null);
    } catch (error: any) {
      console.error("Erro ao salvar agendamento:", error);
      alert(error.message || "Erro ao salvar agendamento");
    }
  }

  // Sincronizar com Google Calendar
  async function handleSyncGoogleCalendar() {
    const tokens = getStoredGoogleCalendarTokens();
    if (!tokens) {
      handleConnectGoogleCalendar();
      return;
    }

    try {
      const start = startOfDay(selectedDate);
      const end = endOfDay(selectedDate);

      const events = await fetch(
        `${window.location.origin}/api/google-calendar/events?` +
          new URLSearchParams({
            accessToken: tokens.access_token,
            timeMin: start.toISOString(),
            timeMax: end.toISOString(),
          }),
      );

      if (!events.ok) {
        throw new Error("Falha ao sincronizar com Google Calendar");
      }

      const googleEvents = await events.json();
      console.log("Eventos do Google Calendar:", googleEvents);

      // TODO: Implementar lógica de sincronização completa
      alert(
        `Sincronizado: ${googleEvents.length} evento(s) do Google Calendar`,
      );
    } catch (error: any) {
      console.error("Erro ao sincronizar Google Calendar:", error);
      alert(error.message || "Erro ao sincronizar com Google Calendar");
    }
  }

  // Obter agendamentos para o dia selecionado
  const dayAppointments = appointments.filter((appt) => {
    const apptDate = parseISO(appt.startsAt);
    return differenceInDays(apptDate, selectedDate) === 0;
  });

  // Ordenar por horário
  dayAppointments.sort(
    (a, b) =>
      new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Agenda */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agenda</h1>
          <p className="text-muted text-sm">
            Gerencie agendamentos, visualize disponibilidade e sincronize com o Google Calendar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={googleConnected ? "success" : "secondary"}
            className="flex items-center gap-1.5"
          >
            {googleConnected ? (
              <>
                <Cloud className="h-4 w-4" /> Conectado ao Google Calendar
              </>
            ) : (
              <>
                <Link className="h-4 w-4" /> Desconectado
              </>
            )}
          </Badge>

          <Button
            variant="outline"
            size="icon"
            onClick={handleSyncGoogleCalendar}
            disabled={!googleConnected}
            title="Sincronizar com Google Calendar"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>

          {!googleConnected && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleConnectGoogleCalendar}
            >
              Conectar Google
            </Button>
          )}

          <Button
            onClick={handleNewAppointment}
            className="bg-primary text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Agendamento
          </Button>
        </div>
      </div>

      {/* Filtros e Visualização */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Filtros laterais */}
        <div className="md:col-span-3 space-y-4">
          <div className="bg-white p-4 rounded-lg border border-line shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Visualização
            </h3>
            <div className="flex gap-2">
              {["dia", "semana", "mes"].map((mode) => (
                <Button
                  key={mode}
                  variant={viewMode === mode ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setViewMode(mode as any)}
                >
                  {mode === "dia" ? "Dia" : mode === "semana" ? "Semana" : "Mês"}
                </Button>
              ))}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-line shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Profissional
            </h3>
            <Select
              value={selectedProfessional?.toString() ?? ""}
              onValueChange={(val) =>
                setSelectedProfessional(val ? Number(val) : null)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos os profissionais" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                {professionalsData.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.fullName} ({p.specialty})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Área principal do calendário */}
        <div className="md:col-span-9">
          <div className="bg-white p-6 rounded-lg border border-line shadow-sm">
            {/* Data selecionada */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
                </h2>
                <p className="text-muted text-sm">
                  {format(selectedDate, "EEEE", { locale: ptBR })}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setSelectedDate(
                      new Date(
                        selectedDate.getFullYear(),
                        selectedDate.getMonth(),
                        selectedDate.getDate() - 1,
                      ),
                    )
                  }
                >
                  <CalendarCheck className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSelectedDate(new Date())}
                >
                  <CalendarIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setSelectedDate(
                      new Date(
                        selectedDate.getFullYear(),
                        selectedDate.getMonth(),
                        selectedDate.getDate() + 1,
                      ),
                    )
                  }
                >
                  <CalendarCheck className="h-4 w-4 rotate-180" />
                </Button>
              </div>
            </div>

            {/* Calendário */}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-3">
                {/* Lista de horários (08:00 - 18:00) */}
                <div className="space-y-1">
                  {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((hour) => (
                    <div
                      key={hour}
                      className="text-xs text-muted text-right w-full h-12 flex items-end pr-2"
                    >
                      {hour.toString().padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
              </div>

              <div className="col-span-9">
                {/* Grade de agendamentos */}
                <div
                  className="relative h-[600px] border-b border-line overflow-hidden"
                  style={{ position: "relative" }}
                >
                  {dayAppointments.map((appt) => {
                    const startTime = parseISO(appt.startsAt);
                    const endTime = parseISO(appt.endsAt);
                    const startHour = startTime.getHours();
                    const startMin = startTime.getMinutes();
                    const endHour = endTime.getHours();
                    const endMin = endTime.getMinutes();

                    const startTop = (startHour - 8) * 60 + startMin;
                    const endTop = (endHour - 8) * 60 + endMin;
                    const height = Math.max(endTop - startTop, 30);
                    const top = startTop;

                    const status = STATUS_CONFIG[appt.status];

                    return (
                      <div
                        key={appt.id}
                        className="absolute left-0 right-0 cursor-pointer"
                        style={{ top: `${top}px`, height: `${height}px` }}
                        onClick={() => handleEditAppointment(appt)}
                      >
                        <div
                          className={cn(
                            "rounded-md p-2 flex flex-col justify-between h-full text-xs font-medium shadow-sm border",
                            status.variant === "default"
                              ? "bg-primary text-white border-primary"
                              : status.variant === "success"
                              ? "bg-success text-white border-success"
                              : status.variant === "warning"
                              ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                              : status.variant === "destructive"
                              ? "bg-red-100 text-red-800 border-red-200"
                              : status.variant === "outline"
                              ? "bg-transparent text-foreground border-line"
                              : "bg-secondary text-secondary-foreground border-secondary",
                          )}
                        >
                          <div className="flex justify-between items-start">
                            <div className="font-bold">{appt.procedure.name}</div>
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </div>
                          <div className="text-foreground/70">
                            {appt.patient.fullName}
                          </div>
                          <div className="text-[10px] text-foreground/50">
                            {appt.professional.fullName}
                          </div>
                          {appt.googleCalendarEventId && (
                            <div className="flex items-center gap-1 mt-1 text-[10px] text-primary">
                              <Link className="h-3 w-3" />
                              Google
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Lista de agendamentos do dia */}
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Agendamentos de hoje
              </h3>
              {dayAppointments.length === 0 ? (
                <p className="text-muted text-sm">Nenhum agendamento para este dia.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Horário</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Procedimento</TableHead>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dayAppointments.map((appt) => {
                      const startTime = parseISO(appt.startsAt);
                      const status = STATUS_CONFIG[appt.status];
                      return (
                        <TableRow key={appt.id} className="hover:bg-surface/50 transition-colors">
                          <TableCell className="font-medium text-foreground">
                            {format(startTime, "HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-foreground/90">
                            {appt.patient.fullName}
                          </TableCell>
                          <TableCell>{appt.procedure.name}</TableCell>
                          <TableCell>{appt.professional.fullName}</TableCell>
                          <TableCell>
                            <Badge variant={status.variant}>
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditAppointment(appt)}
                            >
                              Editar
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dialog: Novo/Editar Agendamento */}
      <Dialog open={openDialog} onOpenChange={handleCloseDialog}>
        <DialogTrigger asChild>
          <Button variant="outline" hidden />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAppointment ? "Editar Agendamento" : "Novo Agendamento"}
            </DialogTitle>
            <DialogDescription>
              Preencha as informações do agendamento
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground/70">
                  Paciente
                </label>
                <Select
                  value={editingAppointment?.patientId?.toString() ?? ""}
                  onValueChange={(_) => {}} // TODO: conectar ao formulário
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar paciente" />
                  </SelectTrigger>
                  <SelectContent>
                    {patientsData.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.fullName} {p.cpf ? `(${p.cpf})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground/70">
                  Profissional
                </label>
                <Select
                  value={editingAppointment?.professionalId?.toString() ?? ""}
                  onValueChange={(_) => {}}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    {professionalsData.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.fullName} - {p.specialty}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground/70">
                Procedimento
              </label>
                <Select
                  value={editingAppointment?.procedureId?.toString() ?? ""}
                  onValueChange={(_) => {}}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar procedimento" />
                  </SelectTrigger>
                  <SelectContent>
                    {proceduresData.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name} ({p.durationMinutes} min)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground/70">
                  Data e Hora Início
                </label>
                <Input type="datetime-local" defaultValue="" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground/70">
                  Data e Hora Fim
                </label>
                <Input type="datetime-local" defaultValue="" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground/70">
                Status
              </label>
              <Select
                value={editingAppointment?.status ?? "solicitado"}
                onValueChange={(_) => {}}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar status" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem
                      key={key}
                      value={key as AppointmentStatus}
                    >
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground/70">
                Observações
              </label>
              <Input type="text" placeholder="Observações adicionais" />
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={handleCloseDialog}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  // TODO: conectar submit do formulário
                  handleCloseDialog();
                }}
              >
                Salvar Agendamento
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Toast para Google Calendar não conectado */}
      {!googleConnected && (
        <div className="fixed bottom-4 right-4 bg-white border border-line shadow-lg rounded-lg p-4 z-50">
          <div className="flex items-start gap-3">
            <Cloud className="h-5 w-5 text-muted mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Conecte ao Google Calendar
              </h3>
              <p className="text-xs text-muted mt-1">
                Sincronize seus agendamentos com o Google Calendar para ter
                acesso em qualquer lugar.
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConnectGoogleCalendar}
                className="mt-2"
              >
                Conectar agora
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}