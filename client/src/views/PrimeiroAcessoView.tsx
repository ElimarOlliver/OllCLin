/**
 * OllCLin - Ativação da conta (owner) via link de convite do webhook.
 * Rota pública /primeiro-acesso?token=... (tela cheia, sem sidebar).
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stethoscope, ShieldCheck } from "lucide-react";

export default function PrimeiroAcessoView({ token }: { token: string }) {
  const utils = trpc.useUtils();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const validation = trpc.onboarding.validateToken.useQuery(
    { token },
    { retry: false },
  );

  const activate = trpc.onboarding.activateWithPassword.useMutation({
    onSuccess: async () => {
      setDone(true);
      await utils.invalidate();
    },
    onError: (e) => setError(e.message),
  });

  if (validation.isLoading) {
    return <p className="text-sm text-slate-500">Validando link...</p>;
  }

  if (!validation.data?.valid) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-bold text-slate-900">Link inválido</h1>
        <p className="text-sm text-slate-500 max-w-sm">
          {validation.data?.reason ?? "Este link de ativação não é mais válido."}
        </p>
        <a href="/entrar" className="text-sm font-semibold text-[#075e63] hover:underline">
          Voltar ao login
        </a>
      </div>
    );
  }

  const strong = /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password);

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <ShieldCheck className="h-10 w-10 text-emerald-600" />
        <h1 className="text-xl font-bold text-slate-900">Conta ativada!</h1>
        <p className="text-sm text-slate-500">Faça login com a senha que você definiu.</p>
        <a href="/entrar" className="font-semibold text-[#075e63] hover:underline">
          Ir para o login →
        </a>
      </div>
    );
  }

  return (
    <form
      className="w-full max-w-sm space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (password !== confirm) {
          setError("As senhas não conferem.");
          return;
        }
        setSubmitting(true);
        activate.mutate(
          { token, password, organizationName: organizationName || undefined },
          { onSettled: () => setSubmitting(false) },
        );
      }}
    >
      <div className="text-center space-y-1">
        <h1 className="text-xl font-bold text-slate-900">Ative sua conta</h1>
        <p className="text-sm text-slate-500">
          {validation.data.organizationName} · {validation.data.email}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="orgName">Nome da clínica (opcional)</Label>
        <Input
          id="orgName"
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
          placeholder={validation.data.organizationName}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Nova senha</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        {password && !strong && (
          <p className="text-xs text-amber-600">
            Use maiúsculas, minúsculas e números (mínimo 8 caracteres).
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirme a senha</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>

      {error && <p className="text-sm text-red-600 text-center">{error}</p>}

      <Button type="submit" disabled={submitting || !strong} className="w-full bg-primary text-white hover:bg-primary/90">
        {submitting ? "Ativando..." : "Ativar conta"}
      </Button>

      <p className="flex items-center justify-center gap-1 text-xs text-slate-400">
        <Stethoscope className="h-3 w-3" /> OllCLin · link válido por 72h
      </p>
    </form>
  );
}
