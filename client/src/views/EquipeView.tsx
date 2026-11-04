/**
 * OllCLin - Equipe (RBAC / gestão de usuários da clínica)
 * Visível apenas para owner/admin (permissão team.manage).
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, UserPlus, Ban, RotateCcw, Mail } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABEL: Record<string, string> = {
  owner: "Titular",
  admin: "Administrador",
  doctor: "Profissional",
  receptionist: "Recepção",
  financial: "Financeiro",
  assistant: "Assistente",
  readonly: "Somente leitura",
};

export default function EquipeView() {
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("receptionist");

  const list = trpc.equipe.list.useQuery(undefined, { retry: false });
  const invite = trpc.equipe.invite.useMutation({
    onSuccess: (data) => {
      toast.success(data.resent ? "Convite reenviado" : "Convite enviado");
      setEmail("");
      void utils.equipe.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const revoke = trpc.equipe.revokeInvite.useMutation({
    onSuccess: () => {
      toast.success("Convite revogado");
      void utils.equipe.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateRole = trpc.equipe.updateRole.useMutation({
    onSuccess: () => {
      toast.success("Papel atualizado");
      void utils.equipe.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const disable = trpc.equipe.disable.useMutation({
    onSuccess: () => {
      toast.success("Membro desativado");
      void utils.equipe.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const enable = trpc.equipe.enable.useMutation({
    onSuccess: () => {
      toast.success("Membro reativado");
      void utils.equipe.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (list.isError) {
    return (
      <div className="p-8 text-sm text-red-600">
        Acesso restrito: somente o titular ou administradores gerenciam a equipe.
      </div>
    );
  }

  if (list.isLoading) return <div className="p-8 text-sm text-slate-500">Carregando equipe...</div>;

  const members = list.data?.members ?? [];
  const invites = list.data?.invites ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#075e63]">Conta</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
          <Users className="h-6 w-6" /> Equipe
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Convide colaboradores por e-mail e defina o papel de cada um. Convites expiram em 72h.
        </p>
      </header>

      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email) return;
          invite.mutate({ email, role: role as never });
        }}
      >
        <div className="min-w-[220px] flex-1 space-y-1">
          <label className="text-xs font-semibold text-slate-600" htmlFor="invite-email">E-mail do colaborador</label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@clinica.com"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600" htmlFor="invite-role">Papel</label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="invite-role" className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABEL)
                .filter(([k]) => k !== "owner")
                .map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={invite.isPending} className="bg-primary text-white hover:bg-primary/90">
          <UserPlus className="mr-1 h-4 w-4" /> Convidar
        </Button>
      </form>

      {invites.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">Convites pendentes</h2>
          <ul>
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 border-b border-slate-50 px-4 py-3 text-sm last:border-0">
                <span className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-900">{inv.email}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                    {ROLE_LABEL[inv.role] ?? inv.role}
                  </span>
                </span>
                <Button variant="outline" size="sm" onClick={() => revoke.mutate({ invitationId: inv.id })}>
                  <Ban className="h-3.5 w-3.5" /> Revogar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Membro</th>
              <th className="px-4 py-3 font-semibold">Papel</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{m.name ?? m.email}</div>
                  <div className="text-xs text-slate-400">{m.email}</div>
                </td>
                <td className="px-4 py-3">
                  {m.isOwner ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Titular</span>
                  ) : (
                    <Select
                      value={m.role}
                      onValueChange={(value) => updateRole.mutate({ userId: m.userId, role: value as never })}
                    >
                      <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(ROLE_LABEL)
                          .filter(([k]) => k !== "owner")
                          .map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${m.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                  >
                    {m.status === "active" ? "Ativo" : "Desativado"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {!m.isOwner &&
                    (m.status === "active" ? (
                      <Button variant="outline" size="sm" onClick={() => disable.mutate({ userId: m.userId })}>
                        <Ban className="h-3.5 w-3.5" /> Desativar
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => enable.mutate({ userId: m.userId })}>
                        <RotateCcw className="h-3.5 w-3.5" /> Reativar
                      </Button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
