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

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { useOrganizationId } from "@/hooks/useOrganizationId";
import {
  Calendar as CalendarIcon,
  Plus,
  RefreshCw,
  CalendarCheck,
  Cloud,
  Link,
  Loader2,
} from "lucide-react";
import { format, parseISO, startOfDay, endOfDay, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { VariantProps } from "class-variance-authority";
import {
  formatGoogleEventTime,
  type GoogleCalendarEvent,
} from "@/lib/googleCalendar";
import {
  formatDateTimeBR,
  parseLocalDateTime,
  toDateInputValue,
  toTimeInputValue,
} from "@/lib/date";

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

type AppointmentForm = {
  patientId: string;
  professionalId: string;
  procedureId: string;
  /** yyyy-MM-dd (valor do <input type="date">). */
  date: string;
  /** HH:mm (valor do <input type="time">). */
  time: string;
  /** Duração em minutos escolhida na lista predefinida. */
  durationMinutes: string;
  status: AppointmentStatus;
  notes: string;
};

/**
 * Durações de consulta predefinidas. O fim é sempre calculado a partir do
 * início + duração, evitando que o usuário erre o dia final do agendamento.
 */
const DURATION_PRESETS = [
  { value: "50", label: "50 minutos" },
  { value: "60", label: "1 hora" },
  { value: "90", label: "1 hora e 30 minutos" },
  { value: "120", label: "2 horas" },
] as const;

const DEFAULT_DURATION = "50";

/** Janela visível da grade da agenda (07:00–21:00, 1px por minuto). */
const AGENDA_START_HOUR = 7;
const AGENDA_END_HOUR = 21;
const AGENDA_GRID_MINUTES = (AGENDA_END_HOUR - AGENDA_START_HOUR) * 60;

const emptyAppointmentForm: AppointmentForm = {
  patientId: "",
  professionalId: "",
  procedureId: "",
  date: "",
  time: "08:00",
  durationMinutes: DEFAULT_DURATION,
  status: "solicitado",
  notes: "",
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
  const [googleNotice, setGoogleNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [showConnectBanner, setShowConnectBanner] = useState(true);
  const [appointmentForm, setAppointmentForm] = useState<AppointmentForm>(emptyAppointmentForm);
  const [appointmentErrors, setAppointmentErrors] = useState<Record<string, string>>({});
  const [savingAppointment, setSavingAppointment] = useState(false);

  const organizationId = useOrganizationId();
  const utils = trpc.useUtils();

  const { data: googleStatus, refetch: refetchGoogleStatus } =
    trpc.googleAgenda.status.useQuery({ organizationId });
  const googleConnected = Boolean(googleStatus?.connected);

  // Fila de sincronização Google Calendar (Fase 2): estados por agendamento.
  const { data: syncJobs } = trpc.googleAgenda.syncJobs.useQuery(
    { organizationId },
    { refetchInterval: googleConnected ? 20_000 : false },
  );
  const syncJobStates = new Map<number, { status: string; lastError: string | null }>();
  for (const job of syncJobs ?? []) {
    syncJobStates.set(job.appointmentId, { status: job.status, lastError: job.lastError });
  }

  // Eventos do Google para o dia selecionado (somente leitura).
  const { data: googleEventsData } = trpc.googleAgenda.listEvents.useQuery(
    {
      organizationId,
      from: startOfDay(selectedDate).toISOString(),
      to: endOfDay(selectedDate).toISOString(),
    },
    { enabled: googleConnected },
  );

  // Retorno do OAuth do Google: mostra o resultado e limpa a URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("google_connected");
    const errorMessage = params.get("google_error");

    if (connected) {
      setGoogleNotice({
        type: "success",
        message: "Google Calendar conectado com sucesso.",
      });
      void refetchGoogleStatus();
    } else if (errorMessage) {
      setGoogleNotice({ type: "error", message: errorMessage });
    }

    if (connected || errorMessage) {
      params.delete("google_connected");
      params.delete("google_error");
      const query = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`,
      );
    }
  }, []);

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
          organizationId,
          startsAtFrom: start.toISOString(),
          startsAtTo: end.toISOString(),
          limit: 100,
        });
        setAppointments(data as unknown as Appointment[]);
      }

      // Carregar profissionais
      const profs = await utils.profissionais.list.fetch({
        organizationId,
        isActive: true,
        limit: 50,
      });
      setProfessionalsData(profs as any);

      // Carregar procedimentos
      const procs = await utils.procedimentos.list.fetch({
        organizationId,
        isActive: true,
        limit: 50,
      });
      setProceduresData(procs as any);

      // Carregar pacientes
      const pats = await utils.pacientes.list.fetch({
        organizationId,
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

  // Conectar Google Calendar (a URL de consentimento vem do servidor)
  async function handleConnectGoogleCalendar() {
    try {
      const { url } = await utils.client.googleAgenda.connectUrl.query({
        organizationId,
      });
      window.location.href = url;
    } catch (error: any) {
      setGoogleNotice({
        type: "error",
        message: error?.message ?? "Não foi possível iniciar a conexão com o Google.",
      });
    }
  }

  // Desconectar Google Calendar (revoga o token no Google)
  async function handleDisconnectGoogleCalendar() {
    try {
      await utils.client.googleAgenda.disconnect.mutate({ organizationId });
      await refetchGoogleStatus();
      setGoogleNotice({
        type: "success",
        message: "Google Calendar desconectado.",
      });
    } catch (error: any) {
      setGoogleNotice({
        type: "error",
        message: error?.message ?? "Não foi possível desconectar o Google Calendar.",
      });
    }
  }

  // Abrir diálogo de novo agendamento
  function handleNewAppointment() {
    setEditingAppointment(null);
    setAppointmentForm({
      ...emptyAppointmentForm,
      date: toDateInputValue(selectedDate),
    });
    setAppointmentErrors({});
    setOpenDialog(true);
  }

  // Editar agendamento existente
  function handleEditAppointment(appt: Appointment) {
    setEditingAppointment(appt);
    const starts = new Date(appt.startsAt);
    const ends = new Date(appt.endsAt);
    const duration = Math.max(
      1,
      Math.round((ends.getTime() - starts.getTime()) / 60_000),
    );
    setAppointmentForm({
      patientId: String(appt.patientId),
      professionalId: String(appt.professionalId),
      procedureId: String(appt.procedureId),
      date: toDateInputValue(appt.startsAt),
      time: toTimeInputValue(appt.startsAt),
      durationMinutes: String(duration),
      status: appt.status,
      notes: appt.notes ?? "",
    });
    setAppointmentErrors({});
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
    setSavingAppointment(true);
    try {
      let googleSync: { status: string; message?: string } | undefined;
      if (editingAppointment) {
        const result = await utils.client.agendamentos.update.mutate({
          id: editingAppointment.id,
          organizationId,
          patientId: formData.patientId,
          professionalId: formData.professionalId,
          procedureId: formData.procedureId,
          startsAt: formData.startsAt.toISOString(),
          endsAt: formData.endsAt.toISOString(),
          status: formData.status,
          notes: formData.notes,
        });
        googleSync = result.googleSync;
      } else {
        const result = await utils.client.agendamentos.create.mutate({
          organizationId,
          patientId: formData.patientId,
          professionalId: formData.professionalId,
          procedureId: formData.procedureId,
          startsAt: formData.startsAt.toISOString(),
          endsAt: formData.endsAt.toISOString(),
          status: formData.status,
          notes: formData.notes,
        });
        googleSync = result.googleSync;
      }

      // Invalidar queries para recarregar
      await utils.agendamentos.list.invalidate();
      setOpenDialog(false);
      setEditingAppointment(null);
      toast.success(editingAppointment ? "Agendamento atualizado" : "Agendamento criado");
      if (googleSync?.status === "conflict") {
        toast.warning(googleSync.message ?? "Conflito encontrado no Google Calendar");
      } else if (googleSync?.status === "error") {
        toast.error(googleSync.message ?? "Não foi possível sincronizar com o Google Calendar");
      } else if (googleSync?.status === "pending") {
        // Fase 2: job enfileirado na fila — worker reflete no Google em background.
        toast.info("Agendamento salvo. Sincronização com o Google Calendar enfileirada.");
      }
      await loadData();
    } catch (error: any) {
      console.error("Erro ao salvar agendamento:", error);
      toast.error(error.message || "Erro ao salvar agendamento");
    } finally {
      setSavingAppointment(false);
    }
  }

  async function submitAppointmentForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!appointmentForm.patientId) errors.patientId = "Selecione um paciente.";
    if (!appointmentForm.professionalId) errors.professionalId = "Selecione um profissional.";
    if (!appointmentForm.procedureId) errors.procedureId = "Selecione um procedimento.";
    if (!appointmentForm.date) errors.startsAt = "Informe a data do atendimento.";
    if (!appointmentForm.time) errors.startsAt = "Informe a hora de início.";
    if (!appointmentForm.date || !appointmentForm.time) {
      errors.startsAt = "Informe a data e a hora de início.";
    }
    const duration = Number(appointmentForm.durationMinutes);
    if (!Number.isFinite(duration) || duration <= 0) {
      errors.durationMinutes = "Selecione a duração do atendimento.";
    }

    const startsAt = parseLocalDateTime(appointmentForm.date, appointmentForm.time);
    if (appointmentForm.date && appointmentForm.time && !startsAt) {
      errors.startsAt = "Data ou hora inválida.";
    }

    setAppointmentErrors(errors);
    if (Object.keys(errors).length > 0 || !startsAt) {
      toast.error("Revise os campos obrigatórios do agendamento");
      return;
    }

    await handleSaveAppointment({
      patientId: Number(appointmentForm.patientId),
      professionalId: Number(appointmentForm.professionalId),
      procedureId: Number(appointmentForm.procedureId),
      startsAt,
      endsAt: new Date(startsAt.getTime() + duration * 60_000),
      status: appointmentForm.status,
      notes: appointmentForm.notes.trim() || undefined,
    });
  }

  // Duração escolhida + término calculado (início + duração), sempre no mesmo dia.
  const durationMinutes = Number(appointmentForm.durationMinutes) || 0;
  const appointmentStart = parseLocalDateTime(appointmentForm.date, appointmentForm.time);
  const appointmentEnd =
    appointmentStart && durationMinutes > 0
      ? new Date(appointmentStart.getTime() + durationMinutes * 60_000)
      : null;

  // Presets fixos; se o agendamento editado tiver duração fora deles, ela entra
  // como opção extra para não perder o valor original.
  const durationOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = DURATION_PRESETS.map(
      (preset) => ({ value: preset.value, label: preset.label }),
    );
    if (
      durationMinutes > 0 &&
      !DURATION_PRESETS.some((preset) => Number(preset.value) === durationMinutes)
    ) {
      options.push({
        value: String(durationMinutes),
        label: `${durationMinutes} minutos`,
      });
    }
    return options;
  }, [durationMinutes]);

  // Sincronizar o dia com o Google Calendar (OllCLin → Google)
  async function handleSyncGoogleCalendar() {
    if (!googleConnected) {
      await handleConnectGoogleCalendar();
      return;
    }

    try {
      const start = startOfDay(selectedDate);
      const end = endOfDay(selectedDate);
      const from = start.toISOString();
      const to = end.toISOString();

      const pulled = await utils.client.googleAgenda.pullRange.mutate({
        organizationId,
        from,
        to,
      });
      const result = await utils.client.googleAgenda.syncRange.mutate({
        organizationId,
        from,
        to,
      });

      // Leitura opcional: mostra quantos eventos já existem na agenda do Google.
      let googleEvents: GoogleCalendarEvent[] = [];
      try {
        googleEvents = await utils.client.googleAgenda.listEvents.query({
          organizationId,
          from,
          to,
        });
      } catch {
        // Se a leitura falhar, a sincronização já executada continua válida.
      }

      const parts = [
        result.requested === 0
          ? "Nenhum agendamento neste dia para sincronizar."
          : `${result.queued} agendamento(s) enfileirado(s) para sincronização com o Google Calendar`,
      ];
      if (result.skipped > 0) parts.push(`${result.skipped} desmarcado(s) remover(s)`);
      if (pulled.updated > 0) parts.push(`${pulled.updated} alteração(ões) importada(s) do Google`);
      if (pulled.conflicts.length > 0) parts.push(`${pulled.conflicts.length} conflito(s) mantido(s) para revisão`);

      setGoogleNotice({
        type: pulled.conflicts.length > 0 ? "error" : "success",
        message: `${parts.join(". ")}.`,
      });

      if (result.queued > 0) await loadData();
      await utils.googleAgenda.listEvents.invalidate();
    } catch (error: any) {
      setGoogleNotice({
        type: "error",
        message: error?.message ?? "Erro ao sincronizar com o Google Calendar.",
      });
    }
  }

  // Sincroniza um único agendamento com o Google
  async function handleSyncAppointment(appt: Appointment) {
    try {
      await utils.client.googleAgenda.syncAppointment.mutate({
        organizationId,
        appointmentId: appt.id,
      });
      setGoogleNotice({
        type: "success",
        message: `Sincronização com o Google Calendar enfileirada para ${appt.patient.fullName}.`,
      });
      await loadData();
      await utils.googleAgenda.listEvents.invalidate();
    } catch (error: any) {
      setGoogleNotice({
        type: "error",
        message: error?.message ?? "Erro ao sincronizar o agendamento.",
      });
    }
  }

  // Remove o evento do Google e desfaz o vínculo
  async function handleUnlinkAppointment(appt: Appointment) {
    try {
      await utils.client.googleAgenda.removeAppointment.mutate({
        organizationId,
        appointmentId: appt.id,
      });
      setGoogleNotice({
        type: "success",
        message: `Evento de ${appt.patient.fullName} removido do Google Calendar.`,
      });
      await loadData();
      await utils.googleAgenda.listEvents.invalidate();
    } catch (error: any) {
      setGoogleNotice({
        type: "error",
        message: error?.message ?? "Erro ao remover o evento do Google.",
      });
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
    <div className="min-w-0 space-y-6">
      {/* Cabeçalho da Agenda */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agenda</h1>
          <p className="text-slate-500 text-sm">
            Gerencie agendamentos, visualize disponibilidade e sincronize com o Google Calendar.
          </p>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
          <Badge
            variant={
              googleStatus?.migrationRequired
                ? "warning"
                : googleConnected
                  ? "success"
                  : "secondary"
            }
            className="flex items-center gap-1.5"
          >
            {googleStatus?.migrationRequired ? (
              <>
                <Cloud className="h-4 w-4" /> Migração pendente
              </>
            ) : googleConnected ? (
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
            title="Sincronizar o dia com o Google Calendar"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>

          {googleConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnectGoogleCalendar}
            >
              Desconectar
            </Button>
          ) : (
            !googleStatus?.migrationRequired &&
            googleStatus?.configured !== false && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleConnectGoogleCalendar}
              >
                Conectar Google
              </Button>
            )
          )}

          <Button
            onClick={handleNewAppointment}
            className="w-full bg-primary text-white hover:bg-primary/90 sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Agendamento
          </Button>
        </div>
      </div>

      {/* Resultado da conexão/sincronização com o Google */}
      {googleNotice && (
        <div
          role="status"
          className={cn(
            "flex items-start justify-between gap-3 rounded-lg border p-3 text-sm",
            googleNotice.type === "success"
              ? "border-success/30 bg-success/10 text-foreground"
              : "border-destructive/30 bg-red-50 text-foreground",
          )}
        >
          <span>{googleNotice.message}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setGoogleNotice(null)}
            aria-label="Fechar aviso"
          >
            Fechar
          </Button>
        </div>
      )}

      {/* Filtros e Visualização */}
      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Filtros laterais */}
        <div className="min-w-0 space-y-4 xl:col-span-3">
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Visualização
            </h3>
            <div className="flex flex-wrap gap-2">
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

          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Profissional
            </h3>
            <Select
              value={selectedProfessional?.toString() ?? "all"}
              onValueChange={(val) =>
                setSelectedProfessional(val === "all" ? null : Number(val))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos os profissionais" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
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
        <div className="min-w-0 xl:col-span-9">
          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
            {/* Data selecionada */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
                </h2>
                <p className="text-slate-500 text-sm">
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
                {/* Lista de horários (07:00 - 21:00) */}
                <div>
                  {Array.from(
                    { length: AGENDA_END_HOUR - AGENDA_START_HOUR },
                    (_, index) => AGENDA_START_HOUR + index,
                  ).map((hour) => (
                    <div
                      key={hour}
                      className="text-xs text-slate-500 text-right w-full h-[60px] flex items-end pr-2"
                    >
                      {hour.toString().padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
              </div>

              <div className="col-span-9">
                {/* Grade de agendamentos (1px por minuto) */}
                <div
                  className="relative border-b border-slate-200 overflow-hidden"
                  style={{ height: `${AGENDA_GRID_MINUTES}px` }}
                >
                  {dayAppointments.map((appt) => {
                    const startTime = parseISO(appt.startsAt);
                    const endTime = parseISO(appt.endsAt);
                    const startMin = startTime.getHours() * 60 + startTime.getMinutes();
                    const endMin = endTime.getHours() * 60 + endTime.getMinutes();

                    const rawTop = startMin - AGENDA_START_HOUR * 60;
                    const top = Math.min(
                      Math.max(rawTop, 0),
                      AGENDA_GRID_MINUTES - 30,
                    );
                    // Usa a duração real (funciona mesmo quando o término passa
                    // da meia-noite) e evita blocos maiores que a grade.
                    const rawDuration = Math.max(endMin - startMin, 30);
                    const height = Math.max(
                      Math.min(rawDuration, AGENDA_GRID_MINUTES - top),
                      30,
                    );

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
                              ? "bg-transparent text-foreground border-slate-200"
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
                <p className="text-slate-500 text-sm">Nenhum agendamento para este dia.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Horário</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Procedimento</TableHead>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Google</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dayAppointments.map((appt) => {
                      const startTime = parseISO(appt.startsAt);
                      const status = STATUS_CONFIG[appt.status];
                      return (
                        <TableRow key={appt.id} className="hover:bg-slate-50 transition-colors">
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
                          <TableCell>
                            {(() => {
                              const syncState = syncJobStates.get(appt.id);
                              const syncStatus = syncState?.status;
                              if (syncStatus === "failed") {
                                return (
                                  <div className="flex items-center gap-2">
                                    <Badge variant="destructive">Falha</Badge>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={!googleConnected}
                                      onClick={() => handleSyncAppointment(appt)}
                                    >
                                      Tentar novamente
                                    </Button>
                                  </div>
                                );
                              }
                              if (syncStatus === "pending") {
                                return (
                                  <Badge variant="secondary">Pendente</Badge>
                                );
                              }
                              if (syncStatus === "processing") {
                                return (
                                  <Badge variant="warning">Sincronizando</Badge>
                                );
                              }
                              if (appt.googleCalendarEventId) {
                                return (
                                  <div className="flex items-center gap-2">
                                    <Badge variant="success">Sincronizado</Badge>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleUnlinkAppointment(appt)}
                                    >
                                      Desvincular
                                    </Button>
                                  </div>
                                );
                              }
                              return (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={!googleConnected}
                                  onClick={() => handleSyncAppointment(appt)}
                                >
                                  Sincronizar
                                </Button>
                              );
                            })()}
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

            {/* Eventos existentes na agenda do Google (leitura) */}
            {googleConnected && (
              <div className="mt-8 border-t border-slate-200 pt-6">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  Eventos no Google Calendar
                </h3>
                {googleEventsData && googleEventsData.length > 0 ? (
                  <ul className="space-y-2">
                    {googleEventsData.map((event) => (
                      <li
                        key={event.id}
                        className="flex items-start justify-between gap-3 rounded-md border border-slate-200 p-2 text-sm"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {event.summary}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatGoogleEventTime(event)}
                          </p>
                        </div>
                        {event.htmlLink && (
                          <a
                            className="text-xs text-primary hover:underline"
                            href={event.htmlLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">
                    Nenhum evento encontrado no Google Calendar neste dia.
                  </p>
                )}
              </div>
            )}
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
          <form className="space-y-4" onSubmit={submitAppointmentForm} noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="appointmentPatient" className="text-sm font-medium text-slate-700">
                  Paciente
                  <span className="text-red-600"> *</span>
                </label>
                <Select
                  value={appointmentForm.patientId}
                  onValueChange={(value) => setAppointmentForm((current) => ({ ...current, patientId: value }))}
                >
                  <SelectTrigger id="appointmentPatient" aria-invalid={Boolean(appointmentErrors.patientId)}>
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
                {appointmentErrors.patientId && <p className="text-xs text-red-600">{appointmentErrors.patientId}</p>}
              </div>

              <div className="space-y-2">
                <label htmlFor="appointmentProfessional" className="text-sm font-medium text-slate-700">
                  Profissional
                  <span className="text-red-600"> *</span>
                </label>
                <Select
                  value={appointmentForm.professionalId}
                  onValueChange={(value) => setAppointmentForm((current) => ({ ...current, professionalId: value }))}
                >
                  <SelectTrigger id="appointmentProfessional" aria-invalid={Boolean(appointmentErrors.professionalId)}>
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
                {appointmentErrors.professionalId && <p className="text-xs text-red-600">{appointmentErrors.professionalId}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="appointmentProcedure" className="text-sm font-medium text-slate-700">
                Procedimento
                <span className="text-red-600"> *</span>
              </label>
              <Select
                value={appointmentForm.procedureId}
                onValueChange={(value) =>
                  setAppointmentForm((current) => {
                    const procedure = proceduresData.find(
                      (p) => String(p.id) === value,
                    );
                    const procedureDuration = procedure?.durationMinutes ?? 0;
                    const matchesPreset = DURATION_PRESETS.some(
                      (preset) => Number(preset.value) === procedureDuration,
                    );
                    return {
                      ...current,
                      procedureId: value,
                      // Se o procedimento tem duração predefinida, já ajusta o campo.
                      durationMinutes: matchesPreset
                        ? String(procedureDuration)
                        : current.durationMinutes,
                    };
                  })
                }
              >
                <SelectTrigger id="appointmentProcedure" aria-invalid={Boolean(appointmentErrors.procedureId)}>
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
              {appointmentErrors.procedureId && <p className="text-xs text-red-600">{appointmentErrors.procedureId}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="appointmentDate" className="text-sm font-medium text-slate-700">
                  Data
                  <span className="text-red-600"> *</span>
                </label>
                <Input
                  id="appointmentDate"
                  type="date"
                  lang="pt-BR"
                  value={appointmentForm.date}
                  aria-invalid={Boolean(appointmentErrors.startsAt)}
                  onChange={(event) =>
                    setAppointmentForm((current) => ({ ...current, date: event.target.value }))
                  }
                />
                {appointmentErrors.startsAt && <p className="text-xs text-red-600">{appointmentErrors.startsAt}</p>}
              </div>
              <div className="space-y-2">
                <label htmlFor="appointmentTime" className="text-sm font-medium text-slate-700">
                  Hora de início
                  <span className="text-red-600"> *</span>
                </label>
                <Input
                  id="appointmentTime"
                  type="time"
                  lang="pt-BR"
                  value={appointmentForm.time}
                  aria-invalid={Boolean(appointmentErrors.startsAt)}
                  onChange={(event) =>
                    setAppointmentForm((current) => ({ ...current, time: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="appointmentDuration" className="text-sm font-medium text-slate-700">
                  Duração
                  <span className="text-red-600"> *</span>
                </label>
                <Select
                  value={appointmentForm.durationMinutes}
                  onValueChange={(value) =>
                    setAppointmentForm((current) => ({ ...current, durationMinutes: value }))
                  }
                >
                  <SelectTrigger id="appointmentDuration" aria-invalid={Boolean(appointmentErrors.durationMinutes)}>
                    <SelectValue placeholder="Selecione a duração" />
                  </SelectTrigger>
                  <SelectContent>
                    {durationOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {appointmentErrors.durationMinutes && (
                  <p className="text-xs text-red-600">{appointmentErrors.durationMinutes}</p>
                )}
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Término (calculado)</span>
                <div
                  className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-foreground"
                  aria-live="polite"
                >
                  {appointmentEnd
                    ? formatDateTimeBR(appointmentEnd)
                    : "Selecione data, hora e duração"}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="appointmentStatus" className="text-sm font-medium text-slate-700">
                Status
              </label>
              <Select
                value={appointmentForm.status}
                onValueChange={(value) => setAppointmentForm((current) => ({ ...current, status: value as AppointmentStatus }))}
              >
                <SelectTrigger id="appointmentStatus">
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
              <label htmlFor="appointmentNotes" className="text-sm font-medium text-slate-700">
                Observações
              </label>
              <Input id="appointmentNotes" type="text" placeholder="Observações adicionais" value={appointmentForm.notes} onChange={(event) => setAppointmentForm((current) => ({ ...current, notes: event.target.value }))} />
            </div>

            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
                disabled={savingAppointment}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={savingAppointment}
              >
                {savingAppointment && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar Agendamento
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Toast para Google Calendar não conectado */}
      {!googleConnected && showConnectBanner && (
        <div className="fixed bottom-4 right-4 max-w-sm bg-white border border-slate-200 shadow-lg rounded-lg p-4 z-50">
          <div className="flex items-start gap-3">
            <Cloud className="h-5 w-5 text-slate-500 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {googleStatus?.migrationRequired
                  ? "Integração Google Calendar pendente"
                  : googleStatus?.configured === false
                    ? "Google Calendar não configurado"
                    : "Conecte ao Google Calendar"}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {googleStatus?.migrationRequired
                  ? googleStatus.hint ??
                    "Aplique a migração 0004 no Supabase para habilitar a integração."
                  : googleStatus?.configured === false
                    ? "Informe credenciais reais (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET) no .env do servidor para habilitar a conexão."
                    : "Sincronize seus agendamentos com o Google Calendar para ter acesso em qualquer lugar."}
              </p>
              <div className="flex items-center gap-2 mt-2">
                {!googleStatus?.migrationRequired &&
                  googleStatus?.configured !== false && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleConnectGoogleCalendar}
                    >
                      Conectar agora
                    </Button>
                  )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowConnectBanner(false)}
                >
                  Agora não
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
