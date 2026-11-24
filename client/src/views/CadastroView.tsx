/**
 * OllCLin - Tela de Cadastro (titular da conta)
 *
 * O primeiro cadastro de uma conta é sempre o TITULAR (acesso master) e cria a
 * organização com trial configurável (SAAS_TRIAL_DAYS, default 10 dias).
 * Coleta dados do responsável + empresa (CNPJ validado por DV no servidor),
 * senha com confirmação e aceite LGPD (termos + privacidade).
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stethoscope, Sparkles } from "lucide-react";

/** Máscara progressiva de CNPJ: 00.000.000/0000-00 */
function maskCnpj(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

export default function CadastroView({ onDone }: { onDone?: () => void }) {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [organizationName, setOrganizationName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [corporateEmail, setCorporateEmail] = useState("");
  const [corporatePhone, setCorporatePhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
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
    if (password !== confirmPassword) {
      setErrorMessage("As senhas não coincidem.");
      return;
    }
    setIsSubmitting(true);
    try {
      await signupMutation.mutateAsync({
        organizationName,
        name,
        email,
        cnpj,
        corporateEmail,
        corporatePhone,
        address: {
          street: "-",
          number: "-",
          city: "-",
          state: "-",
          zip: "00000000",
        },
        acceptTerms: true,
        acceptPrivacy: true,
        password,
      });
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
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
            <Stethoscope className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-foreground text-center">Crie sua conta</h1>
          <p className="text-muted-foreground text-sm text-center">
            Você será o <strong>titular</strong> desta conta — o único com acesso master.
            <span className="mt-2 flex items-center justify-center gap-1 text-primary font-medium">
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
            <Label htmlFor="cnpj">CNPJ da empresa</Label>
            <Input
              id="cnpj"
              value={cnpj}
              onChange={(e) => setCnpj(maskCnpj(e.target.value))}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="corporateEmail">E-mail corporativo</Label>
            <Input
              id="corporateEmail"
              type="email"
              value={corporateEmail}
              onChange={(e) => setCorporateEmail(e.target.value)}
              placeholder="contato@clinica.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="corporatePhone">Telefone da empresa</Label>
            <Input
              id="corporatePhone"
              value={corporatePhone}
              onChange={(e) => setCorporatePhone(e.target.value)}
              placeholder="(11) 90000-0000"
              inputMode="tel"
              required
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
            <Label htmlFor="email">E-mail pessoal</Label>
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
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar senha</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="repita a senha"
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                required
              />
              <span>
                Aceito os <a href="/termos" className="text-primary underline">termos de uso</a>.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={acceptPrivacy}
                onChange={(e) => setAcceptPrivacy(e.target.checked)}
                required
              />
              <span>
                Aceito a <a href="/privacidade" className="text-primary underline">política de privacidade (LGPD)</a>.
              </span>
            </label>
          </div>

          {errorMessage && <p className="text-sm text-destructive text-center">{errorMessage}</p>}
          {successMessage && <p className="text-sm text-success-strong text-center">{successMessage}</p>}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSubmitting ? "Criando conta..." : "Criar conta (10 dias grátis)"}
          </Button>
        </form>
      </div>
    </div>
  );
}
