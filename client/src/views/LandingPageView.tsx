/**
 * OllCLin - Fase 6 (SaaS): Landing Page comercial.
 *
 * Estrutura: Header (logo/benefícios/preços/entrar) · Hero com carrossel
 * (transição a cada 2s, pausa em hover/foco, respeito a prefers-reduced-motion)
 * · Funcionalidades · Segurança/LGPD · Contato · Footer.
 *
 * UX: glassmorphism apenas em elementos decorativos; inputs e textos de
 * formulário sempre opacos (contraste WCAG AA). Botões ≥ 44px de toque.
 */

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Lock,
  Mail,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const SLIDES = [
  {
    title: "Agenda inteligente, sincronizada com o Google",
    description:
      "Agendamentos refletidos no Google Agenda em segundos, com detecção de conflitos e reconciliação bidirecional.",
    Icon: CalendarDays,
    accent: "from-teal-600 to-teal-800",
  },
  {
    title: "Financeiro clínico completo",
    description:
      "Receitas, vendas, despesas, repasse de profissionais e recibos — com exportação CSV e prontidão para maquininhas de cartão.",
    Icon: Wallet,
    accent: "from-emerald-600 to-emerald-800",
  },
  {
    title: "Comunicação interna segura",
    description:
      "Chat corporativo entre médicos e recepção com mensagens que expiram automaticamente em 48 horas.",
    Icon: MessageCircle,
    accent: "from-sky-600 to-sky-800",
  },
  {
    title: "Multi-clínica, dados isolados",
    description:
      "Cada clínica opera em ambiente próprio e isolado (multi-tenant), com auditoria completa e conformidade LGPD.",
    Icon: ShieldCheck,
    accent: "from-indigo-600 to-indigo-800",
  },
];

const FEATURES = [
  {
    Icon: CalendarDays,
    title: "Agenda + Google Calendar",
    description: "Sincronização automática, controle de conflitos de horário e status de sincronização em tempo real.",
  },
  {
    Icon: Users,
    title: "Pacientes e dependentes",
    description: "Cadastro completo com campos configuráveis, importação em CSV/Excel e vínculo de responsáveis para menores.",
  },
  {
    Icon: Wallet,
    title: "Financeiro integrado",
    description: "Convênios, receitas parceladas, vendas, repasses, extrato e recibos — tudo em um só lugar.",
  },
  {
    Icon: CreditCard,
    title: "Pagamentos presenciais",
    description: "Arquitetura pronta para maquininhas de cartão: intenção de pagamento, captura, cancelamento e estorno.",
  },
  {
    Icon: Smartphone,
    title: "Responsivo de verdade",
    description: "Interface testada de 320px a 1440px — agenda, pacientes e financeiro funcionam no celular sem quebras.",
  },
  {
    Icon: MessageCircle,
    title: "Chat da equipe",
    description: "Mensagens rápidas entre médicos e recepção, com notificação visual e retenção máxima de 48h.",
  },
];

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return reduced;
}

function HeroCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const regionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused || reducedMotion || SLIDES.length < 2) return;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % SLIDES.length);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion]);

  const slide = SLIDES[active] ?? SLIDES[0];
  const SlideIcon = slide.Icon;

  return (
    <div
      ref={regionRef}
      role="region"
      aria-roledescription="carrossel"
      aria-label="Recursos em destaque do OllCLin"
      className="relative overflow-hidden rounded-2xl border border-white/40 shadow-2xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div aria-live="polite" className={cn("bg-gradient-to-br p-6 text-primary-foreground sm:p-8", slide.accent)}>
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
            <SlideIcon className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/70">
              Destaque {active + 1} de {SLIDES.length}
            </p>
            <h3 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{slide.title}</h3>
            <p className="mt-2 text-sm leading-6 text-primary-foreground/85 sm:text-base">{slide.description}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 bg-card px-4 py-3">
        <div className="flex items-center gap-2" role="tablist" aria-label="Selecionar destaque">
          {SLIDES.map((item, index) => (
            <button
              key={item.title}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-label={`Destaque ${index + 1}: ${item.title}`}
              onClick={() => setActive(index)}
              className={cn(
                "h-2.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                index === active ? "w-6 bg-primary" : "w-2.5 bg-muted hover:bg-muted",
              )}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Destaque anterior"
            className="h-11 w-11 text-foreground-soft"
            onClick={() => setActive((current) => (current - 1 + SLIDES.length) % SLIDES.length)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Próximo destaque"
            className="h-11 w-11 text-foreground-soft"
            onClick={() => setActive((current) => (current + 1) % SLIDES.length)}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function LandingPageView({ onEnter }: { onEnter: () => void }) {
  const contactFormRef = useRef<HTMLFormElement>(null);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactSent, setContactSent] = useState(false);

  function handleContactSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Fase 6: envio simulado — integrar a serviço de e-mail/CRM quando disponível.
    setContactSent(true);
    contactFormRef.current?.reset();
    setContactName("");
    setContactEmail("");
    setContactMessage("");
  }

  return (
    <div className="min-h-screen w-full bg-background">
      {/* Header */}
      <header className="sticky top-0 z-sticky border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Stethoscope className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-base font-bold tracking-tight text-foreground">OllCLin</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Gestão para clínicas</p>
            </div>
          </div>
          <nav aria-label="Navegação principal" className="hidden items-center gap-1 md:flex">
            {[
              { label: "Benefícios", href: "#beneficios" },
              { label: "Segurança", href: "#seguranca" },
              { label: "Contato", href: "#contato" },
            ].map(({ label, href }) => (
              <a
                key={href}
                href={href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground-soft transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {label}
              </a>
            ))}
          </nav>
          <Button
            type="button"
            onClick={onEnter}
            className="h-11 bg-primary px-5 font-semibold hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Entrar
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(7,94,99,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(7,94,99,.06)_1px,transparent_1px)] [background-size:40px_40px]"
          />
          <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Multi-clínica · LGPD · Auditoria completa
              </p>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                O sistema que cuida da sua clínica —{" "}
                <span className="text-primary">enquanto você cuida dos pacientes.</span>
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-foreground-soft sm:text-lg">
                Agenda sincronizada com o Google, financeiro completo, chat interno e dados
                isolados por clínica. Simples no celular, poderoso no computador.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={onEnter}
                  className="h-12 bg-primary px-6 text-base font-semibold hover:bg-primary-hover"
                >
                  Acessar o sistema
                  <ArrowRight className="ml-1 h-5 w-5" aria-hidden="true" />
                </Button>
                <a
                  href="#beneficios"
                  className="inline-flex h-12 items-center rounded-md border border-border bg-card px-6 text-base font-semibold text-foreground-soft transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Conhecer benefícios
                </a>
              </div>
              <dl className="mt-8 grid max-w-md grid-cols-3 gap-4">
                {[
                  { value: "48h", label: "chat temporário" },
                  { value: "100%", label: "isolamento LGPD" },
                  { value: "2s", label: "sync Google" },
                ].map(({ value, label }) => (
                  <div key={label} className="rounded-xl border border-border bg-card p-3 text-center">
                    <dt className="order-2 text-[11px] font-medium text-muted-foreground">{label}</dt>
                    <dd className="text-xl font-bold text-primary">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <HeroCarousel />
          </div>
        </section>

        {/* Benefícios / Funcionalidades */}
        <section id="beneficios" className="border-t border-border bg-card py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Benefícios</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Tudo que a clínica precisa, sem excesso
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ Icon, title, description }) => (
                <article
                  key={title}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 font-semibold text-foreground">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-foreground-soft">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Planos (SaaS) */}
        <section id="planos" className="border-t border-border bg-background py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Planos</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Preço simples, comece com 10 dias grátis
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Sem fidelidade. Cada clínica tem seu painel independente, com permissões por usuário
              e possibilidade de usar o próprio provedor de pagamentos.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                {
                  name: "Essencial",
                  price: "R$ 97",
                  period: "/mês",
                  users: "até 2 usuários",
                  features: ["Agenda + Google Calendar", "Pacientes ilimitados", "Financeiro básico", "Permissões por usuário"],
                  highlight: false,
                },
                {
                  name: "Profissional",
                  price: "R$ 197",
                  period: "/mês",
                  users: "até 8 usuários",
                  features: ["Tudo do Essencial", "Repasses e recibos", "Relatórios e exportações", "Chat interno"],
                  highlight: true,
                },
                {
                  name: "Clínica",
                  price: "R$ 347",
                  period: "/mês",
                  users: "até 25 usuários",
                  features: ["Tudo do Profissional", "Multi-estabelecimento", "Permissões avançadas", "Suporte prioritário"],
                  highlight: false,
                },
              ].map((plan) => (
                <article
                  key={plan.name}
                  className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md ${
                    plan.highlight ? "border-primary ring-2 ring-ring/20" : "border-border"
                  }`}
                >
                  {plan.highlight && (
                    <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
                      Mais popular
                    </span>
                  )}
                  <h3 className="font-semibold text-foreground">{plan.name}</h3>
                  <p className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-bold tracking-tight text-foreground">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </p>
                  <p className="mt-1 text-xs font-medium text-primary">{plan.users}</p>
                  <ul className="mt-4 space-y-2 text-sm text-foreground-soft">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-strong" aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={`mt-6 w-full ${plan.highlight ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "bg-muted text-foreground hover:bg-muted"}`}
                    onClick={() => onEnter()}
                  >
                    Começar 10 dias grátis <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </article>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Valores de referência do mercado.gateway de pagamento à escolha da clínica (Stripe,
              Mercado Pago, Asaas ou Pagar.me) para cobrança da assinatura.
            </p>
          </div>
        </section>

        {/* Segurança / LGPD */}
        <section id="seguranca" className="bg-gradient-to-br from-primary to-primary-hover py-14 text-primary-foreground">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 sm:px-6 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-soft">Segurança e LGPD</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                Seus dados protegidos por padrão
              </h2>
              <ul className="mt-6 space-y-3 text-sm leading-6 text-primary-soft sm:text-base">
                {[
                  "Isolamento total por clínica (multi-tenant) com Row Level Security no banco.",
                  "Trilha de auditoria de cada acesso e alteração de dados sensíveis.",
                  "Tokens do Google Agenda cifrados com AES-256-GCM — nunca expostos ao navegador.",
                  "Mensagens do chat interno removidas automaticamente após 48 horas.",
                  "Consentimento de paciente registrando compartilhamento e marketing.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary-soft" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-white/25 bg-white/10 p-6 backdrop-blur-sm">
              <ShieldCheck className="h-10 w-10 text-primary-soft" aria-hidden="true" />
              <p className="mt-4 text-lg font-semibold">Privacidade desde o primeiro clique</p>
              <p className="mt-2 text-sm leading-6 text-primary-soft">
                O OllCLin foi desenhado com o princípio do mínimo privilégio: cada perfil —
                médico, recepção ou financeiro — enxerga apenas o que precisa para trabalhar.
              </p>
            </div>
          </div>
        </section>

        {/* Contato */}
        <section id="contato" className="py-14">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 sm:px-6 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Contato</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Fale com a gente
              </h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-foreground-soft sm:text-base">
                Quer ver o OllCLin funcionando na rotina da sua clínica? Envie sua mensagem e
                nosso time entra em contato para agendar uma demonstração.
              </p>
              <div className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <Mail className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-sm text-foreground-soft">
                  <span className="font-semibold text-foreground">comercial@ollclin.local</span>
                  <span className="block text-xs text-muted-foreground">Resposta em até 1 dia útil</span>
                </p>
              </div>
            </div>

            {/* Inputs sempre opacos — glassmorphism restrito a superfícies decorativas. */}
            <form
              ref={contactFormRef}
              onSubmit={handleContactSubmit}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm"
            >
              <div className="space-y-4">
                <div>
                  <label htmlFor="contactName" className="block text-sm font-medium text-foreground">
                    Nome
                  </label>
                  <Input
                    id="contactName"
                    name="name"
                    required
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                    placeholder="Seu nome"
                    className="mt-1 h-11 bg-card"
                  />
                </div>
                <div>
                  <label htmlFor="contactEmail" className="block text-sm font-medium text-foreground">
                    E-mail
                  </label>
                  <Input
                    id="contactEmail"
                    name="email"
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                    placeholder="voce@clinica.com.br"
                    className="mt-1 h-11 bg-card"
                  />
                </div>
                <div>
                  <label htmlFor="contactMessage" className="block text-sm font-medium text-foreground">
                    Mensagem
                  </label>
                  <Textarea
                    id="contactMessage"
                    name="message"
                    required
                    rows={4}
                    value={contactMessage}
                    onChange={(event) => setContactMessage(event.target.value)}
                    placeholder="Conte um pouco sobre a sua clínica..."
                    className="mt-1 bg-card"
                  />
                </div>
                <Button
                  type="submit"
                  className="h-12 w-full bg-primary text-base font-semibold hover:bg-primary-hover"
                >
                  Enviar mensagem
                </Button>
                {contactSent && (
                  <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success-strong">
                    Mensagem registrada! Entraremos em contato em breve.
                  </p>
                )}
              </div>
            </form>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-center sm:flex-row sm:px-6 sm:text-left">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Stethoscope className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-foreground">OllCLin · Gestão para clínicas</p>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} OllCLin. Dados protegidos conforme a LGPD (Lei 13.709/2018).
          </p>
        </div>
      </footer>
    </div>
  );
}
