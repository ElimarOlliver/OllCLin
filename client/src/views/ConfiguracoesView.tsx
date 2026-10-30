/**
 * OllCLin - View: Configurações > Gerais (Locais/Salas + Campos Obrigatórios)
 * Arquitetura MVC - Camada Visão
 *
 * Requisitos:
 * - REQ-05-010..014: locais ilimitados, apenas "Local" obrigatório, aba Salas
 * - REQ-05-015..019: campos obrigatórios com ativação/desativação automática;
 *   campo Nome nunca desabilita
 */

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MapPin,
  DoorOpen,
  Plus,
  Loader2,
  Trash2,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const ORGANIZATION_ID = 1;

type Location = { id: number; name: string; address: string | null; phone: string | null; isActive: boolean };
type Room = { id: number; name: string; capacity: number; isActive: boolean };

const FIELD_LABELS: Record<string, string> = {
  fullName: "Nome completo",
  cpf: "CPF",
  rg: "RG",
  birthDate: "Data de nascimento",
  gender: "Gênero",
  phone: "Telefone",
  email: "E-mail",
  address: "Endereço",
  emergencyContact: "Contato de emergência",
};

export default function ConfiguracoesView() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [locDialogOpen, setLocDialogOpen] = useState(false);
  const [locName, setLocName] = useState("");
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [requiredFields, setRequiredFields] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const utils = trpc.useUtils();

  const loadLocations = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await utils.configuracoes.locations.fetch({ organizationId: ORGANIZATION_ID });
      const locs = data as unknown as Location[];
      setLocations(locs);
      if (locs.length > 0 && !selectedLocation) {
        setSelectedLocation(locs[0]);
      }
    } catch (error) {
      console.error(error);
      toast.error("Falha ao carregar locais");
    } finally {
      setIsLoading(false);
    }
  }, [utils, selectedLocation]);

  const loadFields = useCallback(async () => {
    try {
      const fields = await utils.configuracoes.getRequiredPatientFields.fetch({
        organizationId: ORGANIZATION_ID,
      });
      setRequiredFields(fields as Record<string, boolean>);
    } catch (error) {
      console.error(error);
      toast.error("Falha ao carregar campos obrigatórios");
    }
  }, [utils]);

  useEffect(() => {
    loadLocations();
    loadFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedLocation) return;
    (async () => {
      try {
        const data = await utils.configuracoes.rooms.fetch({ locationId: selectedLocation.id });
        setRooms(data as unknown as Room[]);
      } catch (error) {
        console.error(error);
      }
    })();
  }, [selectedLocation, utils]);

  async function handleCreateLocation() {
    if (locName.trim().length < 2) {
      toast.error("Informe o nome do local");
      return;
    }
    setSaving(true);
    try {
      await utils.client.configuracoes.createLocation.mutate({
        organizationId: ORGANIZATION_ID,
        name: locName.trim(),
      });
      toast.success("Local criado");
      setLocDialogOpen(false);
      setLocName("");
      await loadLocations();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao criar local");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateRoom() {
    if (!selectedLocation || roomName.trim().length < 1) {
      toast.error("Informe o nome da sala");
      return;
    }
    setSaving(true);
    try {
      await utils.client.configuracoes.createRoom.mutate({
        organizationId: ORGANIZATION_ID,
        locationId: selectedLocation.id,
        name: roomName.trim(),
      });
      toast.success("Sala criada");
      setRoomDialogOpen(false);
      setRoomName("");
      const data = await utils.configuracoes.rooms.fetch({ locationId: selectedLocation.id });
      setRooms(data as unknown as Room[]);
    } catch (error) {
      console.error(error);
      toast.error("Falha ao criar sala");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRoom(room: Room) {
    if (!selectedLocation) return;
    if (!confirm(`Excluir a sala "${room.name}"?`)) return;
    try {
      await utils.client.configuracoes.deleteRoom.mutate({
        id: room.id,
        organizationId: ORGANIZATION_ID,
      });
      toast.success("Sala excluída");
      const data = await utils.configuracoes.rooms.fetch({ locationId: selectedLocation.id });
      setRooms(data as unknown as Room[]);
    } catch (error) {
      console.error(error);
      toast.error("Falha ao excluir sala");
    }
  }

  /** REQ-05-018: salvar no ato do toggle. */
  async function toggleField(field: string, required: boolean) {
    const previous = requiredFields[field];
    setRequiredFields({ ...requiredFields, [field]: required });
    try {
      await utils.client.configuracoes.setRequiredPatientField.mutate({
        organizationId: ORGANIZATION_ID,
        field,
        required,
      });
    } catch (error) {
      console.error(error);
      setRequiredFields({ ...requiredFields, [field]: previous });
      toast.error("Falha ao salvar — verifique se o campo é o Nome (não desabilitável)");
    }
  }

  return (
    <div className="p-2 space-y-4">
      {/* Locais de Atendimento */}
      <div className="bg-white rounded-lg border border-line shadow-sm p-6">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Locais de Atendimento
            </h1>
            <p className="text-muted text-sm mt-1">
              Quantidade ilimitada; apenas o nome do local é obrigatório.
            </p>
          </div>
          <Button onClick={() => setLocDialogOpen(true)} className="bg-primary text-white hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-1" /> Adicionar local
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : locations.length === 0 ? (
          <p className="text-muted text-sm py-6 text-center">Nenhum local cadastrado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Local</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Salas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((loc) => (
                <TableRow
                  key={loc.id}
                  className={selectedLocation?.id === loc.id ? "bg-primary/5 cursor-pointer" : "cursor-pointer"}
                  onClick={() => setSelectedLocation(loc)}
                >
                  <TableCell className="font-medium">{loc.name}</TableCell>
                  <TableCell>{loc.address || "—"}</TableCell>
                  <TableCell>{loc.phone || "—"}</TableCell>
                  <TableCell>
                    <Badge className={loc.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100"}>
                      {loc.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedLocation(loc); }}>
                      <DoorOpen className="h-4 w-4 mr-1" /> Abrir salas
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Aba Salas (REQ-05-013/014) */}
        {selectedLocation && (
          <div className="mt-4 border rounded-lg p-4 bg-surface/30">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <DoorOpen className="h-4 w-4 text-primary" />
                Salas de "{selectedLocation.name}"
              </h2>
              <Button variant="outline" size="sm" onClick={() => setRoomDialogOpen(true)}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar sala
              </Button>
            </div>
            {rooms.length === 0 ? (
              <p className="text-muted text-sm py-3 text-center">Nenhuma sala neste local.</p>
            ) : (
              <ul className="space-y-1">
                {rooms.map((room) => (
                  <li key={room.id} className="flex items-center justify-between border-b py-1.5 text-sm">
                    <span>{room.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteRoom(room)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Campos Obrigatórios */}
      <div className="bg-white rounded-lg border border-line shadow-sm p-6">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-1">
          <ListChecks className="h-5 w-5 text-primary" />
          Campos Obrigatórios — Pacientes
        </h2>
        <p className="text-muted text-sm mb-4">
          A alteração é salva automaticamente. O campo <strong>Nome</strong> não pode ser desabilitado.
        </p>
        <div className="grid gap-2 max-w-md">
          {Object.entries(FIELD_LABELS).map(([field, label]) => {
            const locked = field === "fullName";
            return (
              <div key={field} className="flex items-center justify-between border rounded-lg px-3 py-2">
                <Label htmlFor={`field-${field}`} className="font-normal">
                  {label}
                  {locked ? <span className="ml-2 text-xs text-muted">(sempre obrigatório)</span> : null}
                </Label>
                <Switch
                  id={`field-${field}`}
                  checked={requiredFields[field] === true}
                  disabled={locked}
                  onCheckedChange={(v) => toggleField(field, v === true)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal novo local */}
      <Dialog open={locDialogOpen} onOpenChange={setLocDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar local</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="locName">Local *</Label>
              <Input id="locName" value={locName} onChange={(e) => setLocName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateLocation} disabled={saving} className="bg-primary text-white hover:bg-primary/90">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal nova sala */}
      <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar sala em "{selectedLocation?.name}"</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="roomName">Nome da sala *</Label>
              <Input id="roomName" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoomDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateRoom} disabled={saving} className="bg-primary text-white hover:bg-primary/90">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
