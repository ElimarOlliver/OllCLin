/**
 * OllCLin - Aceite de convite de equipe.
 * Rota pública /aceitar-convite?token=... (tela cheia, sem sidebar).
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AceitarConviteView({ token }: { token: string }) {
  const utils = trpc.useUtils();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const validation = trpc.onboarding.validateToken.useQuery({ token }, { retry: false });

  const accept = trpc.onboarding.acceptInvite.useMutation({
    onSuccess: async () => {
      setDone(true);
      await utils.invalidate();
    },
    onError: (e) => setError(e.message),
  });

  if (validation.isLoading) return <p className="text-sm text-slate-500">Validando convite...</p>;

  if (!validation.data?.valid) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-bold text-slate-900">Convite inválido</h1>
        <p className="text-sm text-slate-500 max-w-sm">
          {validation.data?.reason ?? "Peça um reenvio ao titular da conta."}
        </p>
        <a href="/entrar" className="text-sm font-semibold text-[#075e63] hover:underline">
          Voltar ao login
        </a>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-bold text-slate-900">Convite aceito!</h1>
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
        accept.mutate({ token, password }, { onSettled: () => setSubmitting(false) });
      }}
    >
      <div className="text-center space-y-1">
        <h1 className="text-xl font-bold text-slate-900">Aceitar convite</h1>
        <p className="text-sm text-slate-500">
          {validation.data.organizationName} · {validation.data.email}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Crie sua senha</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
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

      <Button type="submit" disabled={submitting} className="w-full bg-primary text-white hover:bg-primary/90">
        {submitting ? "Salvando..." : "Aceitar convite"}
      </Button>
    </form>
  );
}
