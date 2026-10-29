import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  Cloud,
  Database,
  FileCheck2,
  FileHeart,
  FlaskConical,
  GitBranch,
  Layers3,
  LockKeyhole,
  Menu,
  MessageSquareText,
  Network,
  Orbit,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
  WalletCards,
  X,
} from "lucide-react";

const evidenceLabels = {
  observado: { label: "Observado no Ti.Clinic", short: "Observado", className: "observado" },
  recomendacao: { label: "Recomendação para o nosso sistema", short: "Recomendação", className: "recomendacao" },
  "nao-documentado": { label: "Não documentado", short: "Não documentado", className: "nao-documentado" },
} as const;

type Evidence = keyof typeof evidenceLabels;
type EvidenceFilter = "todos" | Evidence;

const modules: Array<{
  title: string;
  eyebrow: string;
  description: string;
  priority: string;
  evidence: Evidence;
  icon: LucideIcon;
}> = [
  { title: "Identidade & Administração", eyebrow: "Base", description: "Organização, usuários, papéis, equipes, locais, salas e auditoria.", priority: "P0", evidence: "recomendacao", icon: LockKeyhole },
  { title: "Pacientes", eyebrow: "Núcleo", description: "Cadastro, busca, consentimentos, duplicidades e linha do tempo longitudinal.", priority: "P0", evidence: "observado", icon: Users },
  { title: "Agenda", eyebrow: "Núcleo", description: "Disponibilidade, conflitos, status, lista de espera e notificações.", priority: "P0", evidence: "observado", icon: CalendarDays },
  { title: "Prontuário", eyebrow: "Núcleo", description: "Atendimento, fichas versionadas, prescrições, anexos e histórico clínico.", priority: "P0", evidence: "recomendacao", icon: FileHeart },
  { title: "Exames", eyebrow: "Ampliação", description: "Laboratórios, solicitações, resultados, laudos e conexão com o financeiro.", priority: "P1", evidence: "observado", icon: FlaskConical },
  { title: "Cirurgias", eyebrow: "Ampliação", description: "Planejamento, equipe, agenda cirúrgica, anexos e pós-operatório.", priority: "P1", evidence: "observado", icon: Stethoscope },
  { title: "Financeiro & TISS", eyebrow: "Escala", description: "Receitas, despesas, repasses, guias, lotes, XML e reconciliação.", priority: "P1/P2", evidence: "nao-documentado", icon: WalletCards },
  { title: "Telessaúde & Comunicação", eyebrow: "Ecossistema", description: "Teleatendimento, mensagens, campanhas, satisfação e portal futuro.", priority: "P2", evidence: "recomendacao", icon: MessageSquareText },
];

const phases = [
  {
    id: "fundamentos",
    number: "01",
    period: "0–8 semanas",
    title: "Fundamentos",
    headline: "Garantias antes de funcionalidades.",
    description: "Definir tenant, identidade, autorização, modelo de dados, auditoria, backup e design system.",
    deliverables: ["Tenant e escopos", "MFA e sessões", "RBAC/ABAC", "Restore de prova"],
    color: "teal",
  },
  {
    id: "mvp",
    number: "02",
    period: "2–5 meses",
    title: "MVP clínico",
    headline: "Uma clínica consegue operar com segurança.",
    description: "Cadastrar, agendar, atender e consultar histórico sem abrir mão de versionamento e rastreabilidade.",
    deliverables: ["Pacientes", "Agenda", "Atendimento", "Prontuário"],
    color: "aqua",
  },
  {
    id: "ampliacao",
    number: "03",
    period: "5–8 meses",
    title: "Operação ampliada",
    headline: "Mais contexto em cada atendimento.",
    description: "Adicionar exames, cirurgias, telessaúde, financeiro básico e mensageria transacional com opt-out.",
    deliverables: ["Exames", "Cirurgias", "Telessaúde", "Financeiro"],
    color: "violet",
  },
  {
    id: "escala",
    number: "04",
    period: "8–12+ meses",
    title: "Faturamento & escala",
    headline: "Integrações governadas, não atalhos.",
    description: "Homologar TISS, integrar parceiros, controlar retornos, glosas e relatórios de gestão.",
    deliverables: ["TISS homologado", "Repasses", "Integrações", "BI e portal"],
    color: "amber",
  },
];

const mvpItems = [
  "Login, recuperação e MFA administrativo",
  "Tenant, estabelecimento, local, usuário e papel",
  "Paciente com deduplicação assistida e consentimento",
  "Procedimento, disponibilidade e agenda sem conflitos",
  "Ficha clínica versionada e assinada",
  "Prescrição básica e documento com autoria",
  "Notificações com preferências e opt-out",
  "Relatórios de agenda e produção auditados",
  "Backup automático e restore testado",
];

const acceptance = [
  "O sistema bloqueia acesso entre clínicas e respeita o escopo do papel.",
  "Conflitos de profissional e sala são impedidos no backend.",
  "A ficha finalizada só muda por adendo ou invalidação autorizada.",
  "Retries, refresh e timeouts não duplicam registros clínicos ou financeiros.",
];

const decisions = [
  { label: "Escopo", title: "Qual é o modelo de operação?", text: "Clínica única, grupo multiunidade ou SaaS multi-tenant?", icon: Network },
  { label: "Governança", title: "Quem pode fazer o quê?", text: "Quais papéis existem e quais ações exigem dupla aprovação?", icon: ShieldCheck },
  { label: "Continuidade", title: "Como protegemos o histórico?", text: "Qual RPO, RTO, retenção e política de restauração?", icon: Cloud },
];

function EvidenceBadge({ type }: { type: Evidence }) {
  return <span className={`evidence-badge ${evidenceLabels[type].className}`}>{evidenceLabels[type].short}</span>;
}

function SectionLabel({ number, eyebrow }: { number: string; eyebrow: string }) {
  return (
    <div className="section-label">
      <span>{number}</span>
      <span>{eyebrow}</span>
    </div>
  );
}

export default function Home() {
  const [activeEvidence, setActiveEvidence] = useState<EvidenceFilter>("todos");
  const [activePhase, setActivePhase] = useState("mvp");
  const [mobileOpen, setMobileOpen] = useState(false);

  const filteredModules = useMemo(
    () => activeEvidence === "todos" ? modules : modules.filter((item) => item.evidence === activeEvidence),
    [activeEvidence],
  );
  const selectedPhase = phases.find((phase) => phase.id === activePhase) ?? phases[1];

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileOpen(false);
  };

  return (
    <main className="site-shell">
      <header className={`topbar ${mobileOpen ? "mobile-open" : ""}`}>
        <button className="brand" onClick={() => scrollTo("top")} aria-label="Voltar ao início">
          <span className="brand-mark"><Stethoscope size={20} strokeWidth={2.5} /></span>
          <span>
            <strong>NEXO</strong>
            <em>CLÍNICO</em>
          </span>
        </button>
        <button className="mobile-menu" onClick={() => setMobileOpen((open) => !open)} aria-label="Abrir navegação">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav className="nav-links" aria-label="Navegação principal">
          <button onClick={() => scrollTo("visao")}>Visão</button>
          <button onClick={() => scrollTo("dominios")}>Domínios</button>
          <button onClick={() => scrollTo("roadmap")}>Roadmap</button>
          <button onClick={() => scrollTo("mvp")}>MVP</button>
          <button onClick={() => scrollTo("decisoes")} className="nav-cta">Decisões <ArrowUpRightIcon /></button>
        </nav>
      </header>

      <section className="hero-section" id="top">
        <div className="hero-grid" />
        <div className="hero-content">
          <div className="eyebrow-line"><span className="pulse-dot" /> Estratégia de produto · 2026</div>
          <h1>O próximo sistema clínico começa por <span>confiança.</span></h1>
          <p className="hero-copy">Um roadmap para transformar operação fragmentada em um núcleo clínico integrado, seguro e pronto para escalar.</p>
          <div className="hero-actions">
            <button className="button button-light" onClick={() => scrollTo("roadmap")}>Explorar roadmap <ArrowRight size={17} /></button>
            <button className="text-link light-link" onClick={() => scrollTo("mvp")}>Ver o MVP <ArrowDownRight size={17} /></button>
          </div>
          <div className="hero-footnote"><span>Base de leitura</span> Manual Ti.Clinic v2.0 · análise estratégica consolidada</div>
        </div>
        <div className="hero-aside">
          <div className="aside-kicker">Tese central</div>
          <div className="aside-statement">Não vamos copiar um menu. Vamos construir as garantias que tornam cada módulo confiável.</div>
          <div className="aside-rule" />
          <div className="aside-meta"><span>01</span><span>fundação antes de expansão</span></div>
        </div>
      </section>

      <section className="signal-strip" id="visao">
        <div className="signal-item"><span className="signal-number">20</span><span>blocos analisados<br /><small>na documentação Ti.Clinic</small></span></div>
        <div className="signal-item"><span className="signal-number">P0</span><span>núcleo transacional<br /><small>prioridade de lançamento</small></span></div>
        <div className="signal-item"><span className="signal-number">04</span><span>fases de implantação<br /><small>do fundamento à escala</small></span></div>
        <div className="signal-item signal-note"><Sparkles size={18} /><span>Uma decisão de produto<br /><small>orientada por evidência</small></span></div>
      </section>

      <section className="section intro-section">
        <div className="section-aside"><SectionLabel number="01" eyebrow="A tese" /><p>O manual mostra amplitude. A estratégia escolhe sequência.</p></div>
        <div className="intro-main">
          <h2>Oportunidade não é lançar tudo.<br /><span>É fazer o centro funcionar.</span></h2>
          <div className="intro-columns">
            <p>O Ti.Clinic conecta administração, pacientes, agenda, prontuário, exames, cirurgias, financeiro, TISS, marketing, telessaúde e relatórios. A leitura do material revela um produto amplo, mas também evidencia que segurança, autorização, versionamento e governança não podem ficar para depois.</p>
            <p>Por isso, o novo sistema começa pelo que sustenta todos os outros módulos: identidade, organização, pacientes, agenda, atendimento e prontuário. Expansão vem depois de consistência.</p>
          </div>
          <div className="evidence-legend">
            <span><i className="legend-dot observado" /> Observado no Ti.Clinic</span>
            <span><i className="legend-dot recomendacao" /> Recomendação para o nosso sistema</span>
            <span><i className="legend-dot nao-documentado" /> Decisão ainda em aberto</span>
          </div>
        </div>
      </section>

      <section className="section learning-section">
        <div className="section-heading-row">
          <div><SectionLabel number="02" eyebrow="Aprendizados" /><h2>O que levamos.<br /><span>O que fazemos diferente.</span></h2></div>
          <p className="section-intro">A documentação é uma referência funcional. Nossa vantagem será transformar lacunas em princípios de produto.</p>
        </div>
        <div className="learning-grid">
          <article className="learning-panel observed-panel">
            <div className="panel-top"><EvidenceBadge type="observado" /><span>evidências do manual</span></div>
            <h3>Um ecossistema clínico completo</h3>
            <p>Os fluxos cobrem o dia a dia da clínica: pacientes, agenda, prontuário, exames, cirurgias, financeiro, TISS, marketing, telessaúde e relatórios.</p>
            <div className="panel-tags"><span>20 módulos</span><span>web</span><span>multi-profissional</span></div>
          </article>
          <article className="learning-panel opportunity-panel">
            <div className="panel-top"><EvidenceBadge type="recomendacao" /><span>implicação estratégica</span></div>
            <h3>Um núcleo operacional confiável</h3>
            <p>O produto deve começar com autorização contextual, prontuário versionado, agenda transacional, auditoria e restore testado — antes da superfície crescer.</p>
            <div className="panel-tags"><span>segurança nativa</span><span>sequência</span><span>consistência</span></div>
          </article>
        </div>
      </section>

      <section className="section domains-section" id="dominios">
        <div className="section-heading-row domain-heading">
          <div><SectionLabel number="03" eyebrow="Arquitetura de produto" /><h2>Um núcleo.<br /><span>Vários caminhos.</span></h2></div>
          <p className="section-intro">Cada domínio expande a mesma verdade operacional: paciente, agenda, atendimento e histórico conectados.</p>
        </div>
        <div className="domain-map">
          <div className="domain-orbit orbit-one" />
          <div className="domain-orbit orbit-two" />
          <div className="domain-core"><Orbit size={22} /><strong>NÚCLEO<br />CLÍNICO</strong><small>identidade · paciente · agenda · prontuário</small></div>
          <div className="orbit-node node-patient"><Users size={17} /><span>Pacientes</span></div>
          <div className="orbit-node node-agenda"><CalendarDays size={17} /><span>Agenda</span></div>
          <div className="orbit-node node-care"><FileHeart size={17} /><span>Atendimento</span></div>
          <div className="orbit-node node-data"><BarChart3 size={17} /><span>Relatórios</span></div>
          <div className="orbit-node node-scale"><WalletCards size={17} /><span>Financeiro</span></div>
          <div className="orbit-node node-connection"><Network size={17} /><span>Integrações</span></div>
        </div>
      </section>

      <section className="section modules-section">
        <div className="section-heading-row">
          <div><SectionLabel number="04" eyebrow="Mapa de módulos" /><h2>Prioridade é uma<br /><span>decisão de foco.</span></h2></div>
          <p className="section-intro">Filtre os domínios por natureza da evidência. O mapa combina o que foi observado com o que precisa ser decidido.</p>
        </div>
        <div className="filter-row" role="tablist" aria-label="Filtrar módulos por evidência">
          {(["todos", "observado", "recomendacao", "nao-documentado"] as EvidenceFilter[]).map((filter) => (
            <button key={filter} className={`filter-button ${activeEvidence === filter ? "active" : ""}`} onClick={() => setActiveEvidence(filter)} role="tab" aria-selected={activeEvidence === filter}>
              {filter === "todos" ? "Todos" : evidenceLabels[filter].label}
            </button>
          ))}
        </div>
        <div className="module-list">
          {filteredModules.map((module) => {
            const Icon = module.icon;
            return <article className="module-row" key={module.title}>
              <div className="module-icon"><Icon size={21} /></div>
              <div className="module-copy"><div className="module-eyebrow">{module.eyebrow} · <EvidenceBadge type={module.evidence} /></div><h3>{module.title}</h3><p>{module.description}</p></div>
              <div className="module-priority">{module.priority}</div>
              <ArrowRight className="module-arrow" size={20} />
            </article>;
          })}
        </div>
      </section>

      <section className="dark-section journeys-section">
        <div className="section-heading-row dark-heading">
          <div><SectionLabel number="05" eyebrow="Jornadas" /><h2>Do primeiro acesso<br /><span>ao cuidado contínuo.</span></h2></div>
          <p className="section-intro">O produto se prova em uma jornada vertical, não em telas isoladas.</p>
        </div>
        <div className="journey-line">
          <div className="journey-step"><span>01</span><div className="journey-marker"><LockKeyhole size={19} /></div><h3>Configurar</h3><p>Organização, papéis, locais, horários e segurança.</p></div>
          <div className="journey-step"><span>02</span><div className="journey-marker"><Users size={19} /></div><h3>Relacionar</h3><p>Paciente, agenda, confirmação e preferências.</p></div>
          <div className="journey-step"><span>03</span><div className="journey-marker"><FileCheck2 size={19} /></div><h3>Atender</h3><p>Ficha clínica, prescrição, anexos e histórico.</p></div>
          <div className="journey-step"><span>04</span><div className="journey-marker"><BarChart3 size={19} /></div><h3>Aprender</h3><p>Relatórios governados e decisões melhores.</p></div>
        </div>
      </section>

      <section className="section roadmap-section" id="roadmap">
        <div className="section-heading-row">
          <div><SectionLabel number="06" eyebrow="Roadmap" /><h2>Fases que reduzem<br /><span>risco de produto.</span></h2></div>
          <p className="section-intro">A sequência protege o núcleo e cria pontos claros de validação antes de aumentar a complexidade.</p>
        </div>
        <div className="phase-tabs" role="tablist" aria-label="Fases do roadmap">
          {phases.map((phase) => <button key={phase.id} className={`phase-tab ${activePhase === phase.id ? "active" : ""}`} onClick={() => setActivePhase(phase.id)} role="tab" aria-selected={activePhase === phase.id}><span>{phase.number}</span><strong>{phase.title}</strong><small>{phase.period}</small></button>)}
        </div>
        <div className={`phase-detail ${selectedPhase.color}`}>
          <div className="phase-number">{selectedPhase.number}</div>
          <div className="phase-main"><EvidenceBadge type="recomendacao" /><h3>{selectedPhase.headline}</h3><p>{selectedPhase.description}</p></div>
          <div className="phase-deliverables"><span>Entregas-chave</span>{selectedPhase.deliverables.map((item) => <div key={item}><Check size={16} />{item}</div>)}</div>
        </div>
      </section>

      <section className="section mvp-section" id="mvp">
        <div className="section-heading-row">
          <div><SectionLabel number="07" eyebrow="Primeiro corte" /><h2>O MVP entrega<br /><span>uma operação segura.</span></h2></div>
          <p className="section-intro">O escopo mínimo não é pequeno por quantidade. É preciso por dependência: cada item prepara o próximo.</p>
        </div>
        <div className="mvp-grid">
          <article className="mvp-card mvp-scope"><div className="card-kicker"><ClipboardCheck size={18} /> Escopo mínimo</div><h3>O que precisa existir.</h3><ol>{mvpItems.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</li>)}</ol></article>
          <article className="mvp-card mvp-acceptance"><div className="card-kicker"><CheckCircle2 size={18} /> Pronto quando</div><h3>O que precisa ser verdade.</h3><ul>{acceptance.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul><div className="acceptance-note"><ShieldCheck size={18} /><span>Não é apenas funcionar.<br /><strong>É permanecer consistente sob pressão.</strong></span></div></article>
        </div>
      </section>

      <section className="dark-section governance-section">
        <div className="section-heading-row dark-heading">
          <div><SectionLabel number="08" eyebrow="Governança" /><h2>Garantias são<br /><span>parte do produto.</span></h2></div>
          <p className="section-intro">O prontuário, as permissões e o backup não são infraestrutura invisível. Eles são a experiência de confiança.</p>
        </div>
        <div className="governance-grid">
          <article><div className="governance-icon"><LockKeyhole size={20} /></div><h3>Controle</h3><p>RBAC com escopo por organização, local, equipe, profissional e estado do registro.</p></article>
          <article><div className="governance-icon"><FileHeart size={20} /></div><h3>Imutabilidade</h3><p>Prontuário finalizado por adendo, versão e invalidação autorizada — nunca edição silenciosa.</p></article>
          <article><div className="governance-icon"><Database size={20} /></div><h3>Rastreabilidade</h3><p>Auditoria de acessos, impressões, exportações, alterações, cancelamentos e integrações.</p></article>
          <article><div className="governance-icon"><Cloud size={20} /></div><h3>Resiliência</h3><p>Backup criptografado, restore testado, RPO/RTO definido e cadeia de custódia.</p></article>
        </div>
      </section>

      <section className="section decisions-section" id="decisoes">
        <div className="section-heading-row">
          <div><SectionLabel number="09" eyebrow="Próxima decisão" /><h2>O que precisa<br /><span>ser escolhido agora.</span></h2></div>
          <p className="section-intro">Decisões em aberto não são bloqueios. São o mecanismo para evitar custo de retrabalho depois.</p>
        </div>
        <div className="decisions-grid">{decisions.map((decision, index) => { const Icon = decision.icon; return <article className="decision-card" key={decision.title}><div className="decision-index">0{index + 1}</div><Icon size={23} /><span>{decision.label}</span><h3>{decision.title}</h3><p>{decision.text}</p><button className="text-link" onClick={() => scrollTo("mvp")}>Ver implicações <ArrowRight size={16} /></button></article>; })}</div>
        <div className="closing-callout"><div><span className="closing-kicker">Princípio de execução</span><h3>Isolar os dados. Controlar o acesso. Provar o fluxo.</h3></div><button className="button button-dark" onClick={() => scrollTo("roadmap")}>Voltar ao roadmap <ArrowRight size={17} /></button></div>
      </section>

      <footer className="site-footer"><div className="footer-brand"><span className="brand-mark"><Stethoscope size={17} /></span><strong>NEXO CLÍNICO</strong></div><span>Estratégia baseada no relatório consolidado do Ti.Clinic v2.0</span><span>Roadmap 2026</span></footer>
    </main>
  );
}

function ArrowUpRightIcon() {
  return <ArrowRight size={15} className="arrow-up-right" />;
}
