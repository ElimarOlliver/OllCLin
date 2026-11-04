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
      <div aria-live="polite" className={cn("bg-gradient-to-br p-6 text-white sm:p-8", slide.accent)}>
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
            <SlideIcon className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
              Destaque {active + 1} de {SLIDES.length}
            </p>
            <h3 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{slide.title}</h3>
            <p className="mt-2 text-sm leading-6 text-white/85 sm:text-base">{slide.description}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 bg-white px-4 py-3">
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
                "h-2.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075e63] focus-visible:ring-offset-2",
                index === active ? "w-6 bg-[#075e63]" : "w-2.5 bg-slate-300 hover:bg-slate-400",
              )}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Destaque anterior"
            className="h-11 w-11 text-slate-600"
            onClick={() => setActive((current) => (current - 1 + SLIDES.length) % SLIDES.length)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Próximo destaque"
            className="h-11 w-11 text-slate-600"
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
    <div className="min-h-screen w-full bg-[#f7f8f5]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#075e63] text-white">
              <Stethoscope className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-base font-bold tracking-tight text-slate-900">OllCLin</p>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Gestão para clínicas</p>
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
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075e63]"
              >
                {label}
              </a>
            ))}
          </nav>
          <Button
            type="button"
            onClick={onEnter}
            className="h-11 bg-[#075e63] px-5 font-semibold hover:bg-[#064f53] focus-visible:ring-2 focus-visible:ring-[#075e63] focus-visible:ring-offset-2"
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
              <p className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-[#075e63]">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Multi-clínica · LGPD · Auditoria completa
              </p>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
                O sistema que cuida da sua clínica —{" "}
                <span className="text-[#075e63]">enquanto você cuida dos pacientes.</span>
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                Agenda sincronizada com o Google, financeiro completo, chat interno e dados
                isolados por clínica. Simples no celular, poderoso no computador.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={onEnter}
                  className="h-12 bg-[#075e63] px-6 text-base font-semibold hover:bg-[#064f53]"
                >
                  Acessar o sistema
                  <ArrowRight className="ml-1 h-5 w-5" aria-hidden="true" />
                </Button>
                <a
                  href="#beneficios"
                  className="inline-flex h-12 items-center rounded-md border border-slate-300 bg-white px-6 text-base font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075e63]"
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
                  <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                    <dt className="order-2 text-[11px] font-medium text-slate-500">{label}</dt>
                    <dd className="text-xl font-bold text-[#075e63]">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <HeroCarousel />
          </div>
        </section>

        {/* Benefícios / Funcionalidades */}
        <section id="beneficios" className="border-t border-slate-200 bg-white py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#075e63]">Benefícios</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Tudo que a clínica precisa, sem excesso
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ Icon, title, description }) => (
                <article
                  key={title}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-[#075e63]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Planos (SaaS) */}
        <section id="planos" className="border-t border-slate-200 bg-[#f7f8f5] py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#075e63]">Planos</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Preço simples, comece com 10 dias grátis
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
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
                  className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md ${
                    plan.highlight ? "border-[#075e63] ring-2 ring-[#075e63]/20" : "border-slate-200"
                  }`}
                >
                  {plan.highlight && (
                    <span className="absolute -top-3 left-6 rounded-full bg-[#075e63] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                      Mais popular
                    </span>
                  )}
                  <h3 className="font-semibold text-slate-900">{plan.name}</h3>
                  <p className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-bold tracking-tight text-slate-900">{plan.price}</span>
                    <span className="text-sm text-slate-500">{plan.period}</span>
                  </p>
                  <p className="mt-1 text-xs font-medium text-[#075e63]">{plan.users}</p>
                  <ul className="mt-4 space-y-2 text-sm text-slate-600">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={`mt-6 w-full ${plan.highlight ? "bg-[#075e63] text-white hover:bg-[#064f53]" : "bg-slate-100 text-slate-800 hover:bg-slate-200"}`}
                    onClick={() => onEnter()}
                  >
                    Começar 10 dias grátis <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </article>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-400">
              Valores de referência do mercado.gateway de pagamento à escolha da clínica (Stripe,
              Mercado Pago, Asaas ou Pagar.me) para cobrança da assinatura.
            </p>
          </div>
        </section>

        {/* Segurança / LGPD */}
        <section id="seguranca" className="bg-gradient-to-br from-[#075e63] to-[#064f53] py-14 text-white">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 sm:px-6 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-200">Segurança e LGPD</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                Seus dados protegidos por padrão
              </h2>
              <ul className="mt-6 space-y-3 text-sm leading-6 text-teal-50 sm:text-base">
                {[
                  "Isolamento total por clínica (multi-tenant) com Row Level Security no banco.",
                  "Trilha de auditoria de cada acesso e alteração de dados sensíveis.",
                  "Tokens do Google Agenda cifrados com AES-256-GCM — nunca expostos ao navegador.",
                  "Mensagens do chat interno removidas automaticamente após 48 horas.",
                  "Consentimento de paciente registrando compartilhamento e marketing.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-teal-200" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-white/25 bg-white/10 p-6 backdrop-blur-sm">
              <ShieldCheck className="h-10 w-10 text-teal-100" aria-hidden="true" />
              <p className="mt-4 text-lg font-semibold">Privacidade desde o primeiro clique</p>
              <p className="mt-2 text-sm leading-6 text-teal-50">
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
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#075e63]">Contato</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Fale com a gente
              </h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
                Quer ver o OllCLin funcionando na rotina da sua clínica? Envie sua mensagem e
                nosso time entra em contato para agendar uma demonstração.
              </p>
              <div className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <Mail className="h-5 w-5 shrink-0 text-[#075e63]" aria-hidden="true" />
                <p className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">comercial@ollclin.local</span>
                  <span className="block text-xs text-slate-500">Resposta em até 1 dia útil</span>
                </p>
              </div>
            </div>

            {/* Inputs sempre opacos — glassmorphism restrito a superfícies decorativas. */}
            <form
              ref={contactFormRef}
              onSubmit={handleContactSubmit}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="space-y-4">
                <div>
                  <label htmlFor="contactName" className="block text-sm font-medium text-slate-900">
                    Nome
                  </label>
                  <Input
                    id="contactName"
                    name="name"
                    required
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                    placeholder="Seu nome"
                    className="mt-1 h-11 bg-white"
                  />
                </div>
                <div>
                  <label htmlFor="contactEmail" className="block text-sm font-medium text-slate-900">
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
                    className="mt-1 h-11 bg-white"
                  />
                </div>
                <div>
                  <label htmlFor="contactMessage" className="block text-sm font-medium text-slate-900">
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
                    className="mt-1 bg-white"
                  />
                </div>
                <Button
                  type="submit"
                  className="h-12 w-full bg-[#075e63] text-base font-semibold hover:bg-[#064f53]"
                >
                  Enviar mensagem
                </Button>
                {contactSent && (
                  <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                    Mensagem registrada! Entraremos em contato em breve.
                  </p>
                )}
              </div>
            </form>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-center sm:flex-row sm:px-6 sm:text-left">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#075e63] text-white">
              <Stethoscope className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-slate-900">OllCLin · Gestão para clínicas</p>
          </div>
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} OllCLin. Dados protegidos conforme a LGPD (Lei 13.709/2018).
          </p>
        </div>
      </footer>
    </div>
  );
}
