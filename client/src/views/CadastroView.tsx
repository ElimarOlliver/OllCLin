/**
 * OllCLin - Tela de Cadastro (titular da conta)
 *
 * O primeiro cadastro de uma conta é sempre o TITULAR (acesso master) e cria a
 * organização com 10 dias grátis de uso (trial).
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stethoscope, Sparkles } from "lucide-react";

export default function CadastroView({ onDone }: { onDone?: () => void }) {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [organizationName, setOrganizationName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const signupMutation = trpc.saas.signup.useMutation({
    onSuccess: (data) => {
      setSuccessMessage(data.message);
      void utils.invalidate();
    },
    onError: (error) => setErrorMessage(error.message ?? "Falha ao criar conta."),
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await signupMutation.mutateAsync({ organizationName, name, email, password });
      onDone?.();
      setLocation("/entrar");
    } catch {
      // erro tratado no onError da mutation
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
          <h1 className="text-2xl font-bold text-foreground text-center">Crie sua conta</h1>
          <p className="text-slate-500 text-sm text-center">
            Você será o <strong>titular</strong> desta conta — o único com acesso master.
            <span className="mt-2 flex items-center justify-center gap-1 text-[#075e63] font-medium">
              <Sparkles className="h-4 w-4" /> 10 dias grátis após o cadastro
            </span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div className="space-y-2">
            <Label htmlFor="organizationName">Nome da clínica/consultório</Label>
            <Input
              id="organizationName"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="Clínica Exemplo"
              required
              minLength={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Seu nome</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              required
              minLength={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@clinica.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mínimo 8 caracteres"
              required
              minLength={8}
            />
          </div>

          {errorMessage && <p className="text-sm text-red-600 text-center">{errorMessage}</p>}
          {successMessage && <p className="text-sm text-emerald-700 text-center">{successMessage}</p>}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary text-white hover:bg-primary/90"
          >
            {isSubmitting ? "Criando conta..." : "Criar conta (10 dias grátis)"}
          </Button>
        </form>
      </div>
    </div>
  );
}
