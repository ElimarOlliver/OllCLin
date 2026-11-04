/**
 * OllCLin - Tela de Login (Supabase Auth)
 * Arquitetura MVC - Camada Visão (cliente)
 *
 * Autentica com e-mail/senha via Supabase Auth e mantém a sessão (JWT) para
 * as chamadas tRPC (Authorization: Bearer). O backend valida o token e resolve
 * o usuário local + organization_id.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stethoscope } from "lucide-react";
import { signInWithEmailPassword } from "@/lib/supabase";

export default function LoginView() {
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const { error } = await signInWithEmailPassword({ email, password });
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      // A sessão (JWT) agora existe; invalida o cache do auth.me para buscar o
      // usuário local vinculado à organização.
      await utils.auth.me.invalidate();
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Falha ao autenticar.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen w-full">
      <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
        <div className="flex flex-col items-center gap-6">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center text-white">
            <Stethoscope className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-foreground text-center">
            OllCLin
          </h1>
          <p className="text-slate-500 text-sm text-center">
            Acesse o sistema clínico com sua conta da organização.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="voce@clinica.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {errorMessage && (
            <p className="text-sm text-red-600 text-center">{errorMessage}</p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary text-white hover:bg-primary/90"
          >
            {isSubmitting ? "Entrar..." : "Entrar"}
          </Button>
        </form>

        <p className="text-sm text-center text-slate-500">
          Não tem conta?{" "}
          <a href="/cadastro" className="font-semibold text-[#075e63] hover:underline">
            Criar conta (10 dias grátis)
          </a>
        </p>

        <p className="text-xs text-slate-500 text-center">
          Ainda em ambiente de desenvolvimento? Defina <code>ALLOW_DEV_AUTH=true</code> no
          <code>.env</code> para usar o modo local sem Supabase Auth.
        </p>
      </div>
    </div>
  );
}
