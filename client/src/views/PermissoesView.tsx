/**
 * OllCLin - Página de Permissões (área exclusiva do TITULAR)
 *
 * Lista todas as áreas do sistema e permite ao titular ativar/desativar o
 * acesso de cada colaborador por área: nenhum / parcial (leitura) / total.
 * Não é exibida na sidebar de quem não é titular.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Lock, Crown } from "lucide-react";
import { toast } from "sonner";

const LEVEL_LABEL: Record<string, string> = {
  none: "Sem acesso",
  partial: "Parcial (leitura)",
  full: "Total",
};

export default function PermissoesView() {
  const utils = trpc.useUtils();
  const [saving, setSaving] = useState<string | null>(null);

  const areasQuery = trpc.saas.permissionAreas.useQuery();
  const overviewQuery = trpc.saas.permissionsOverview.useQuery(undefined, {
    retry: false,
  });

  const setPermission = trpc.saas.setPermission.useMutation({
    onMutate: ({ userId, areaKey }) => setSaving(`${userId}:${areaKey}`),
    onSettled: () => setSaving(null),
    onSuccess: async () => {
      toast.success("Permissão atualizada");
      await utils.saas.permissionsOverview.invalidate();
    },
    onError: (error) => toast.error(error.message ?? "Falha ao atualizar permissão"),
  });

  if (overviewQuery.isLoading) {
    return <div className="p-8 text-sm text-slate-500">Carregando permissões...</div>;
  }

  if (overviewQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-5xl p-8">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Lock className="h-8 w-8 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900">Área restrita ao titular</h2>
          <p className="max-w-md text-sm text-slate-500">
            Somente o titular da conta (contratante) pode visualizar e configurar as
            permissões de acesso da equipe.
          </p>
        </div>
      </div>
    );
  }

  const members = overviewQuery.data?.members ?? [];
  const areas = areasQuery.data ?? [];

  function levelFor(userId: number, areaKey: string): string {
    const member = members.find((m) => m.userId === userId);
    return member?.permissions.find((p) => p.areaKey === areaKey)?.accessLevel ?? "none";
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#075e63]">Conta titular</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Permissões</h1>
          <p className="mt-1 text-sm text-slate-500">
            Defina o acesso de cada colaborador às áreas do sistema: sem acesso, parcial (somente leitura) ou total.
          </p>
        </div>
        {overviewQuery.data?.trial && (
          <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm">
            <span className="font-semibold text-[#075e63]">
              {overviewQuery.data.trial.trialExpired
                ? "Trial encerrado"
                : `Trial: ${overviewQuery.data.trial.trialDaysLeft} dia(s) restantes`}
            </span>
          </div>
        )}
      </header>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Colaborador</th>
              {areas.map((area) => (
                <th key={area.key} className="px-3 py-3 font-semibold text-center" title={area.description ?? area.label}>
                  {area.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.userId} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{member.name ?? member.email ?? `#${member.userId}`}</span>
                    {member.isOwner && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        <Crown className="h-3 w-3" /> Titular
                      </span>
                    )}
                    {member.status !== "active" && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{member.status}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">{member.email}</div>
                </td>
                {areas.map((area) => {
                  const key = `${member.userId}:${area.key}`;
                  const isOwner = member.isOwner;
                  const current = isOwner ? "full" : levelFor(member.userId, area.key);
                  return (
                    <td key={area.key} className="px-3 py-2 text-center">
                      {isOwner ? (
                        <span className="inline-flex items-center justify-center gap-1 rounded-md bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-700" title="Titular: acesso total garantido">
                          <ShieldCheck className="h-3.5 w-3.5" /> Total
                        </span>
                      ) : (
                        <Select
                          value={current}
                          disabled={saving === key}
                          onValueChange={(value) =>
                            setPermission.mutate({
                              userId: member.userId,
                              areaKey: area.key,
                              accessLevel: value as "none" | "partial" | "full",
                            })
                          }
                        >
                          <SelectTrigger className="mx-auto h-9 w-[132px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{LEVEL_LABEL.none}</SelectItem>
                            <SelectItem value="partial">{LEVEL_LABEL.partial}</SelectItem>
                            <SelectItem value="full">{LEVEL_LABEL.full}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {members.length <= 1 && (
        <p className="text-sm text-slate-500">
          Ainda não há colaboradores na sua conta. Quando você cadastrar usuários para sua equipe, eles aparecerão aqui para receber permissões.
        </p>
      )}

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => utils.saas.permissionsOverview.invalidate()}>
          Atualizar
        </Button>
      </div>
    </div>
  );
}
