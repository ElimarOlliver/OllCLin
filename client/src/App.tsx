import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { TrialGate } from "./components/TrialGate";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "@/hooks/useAuth";
import AgendaView from "@/views/AgendaView";
import PacientesView from "@/views/PacientesView";
import ProfissionaisView from "@/views/ProfissionaisView";
import ProcedimentosView from "@/views/ProcedimentosView";
import ConveniosView from "@/views/ConveniosView";
import ReceitasView from "@/views/ReceitasView";
import DespesasView from "@/views/DespesasView";
import VendasView from "@/views/VendasView";
import RepasseView from "@/views/RepasseView";
import ExtratoView from "@/views/ExtratoView";
import RecibosView from "@/views/RecibosView";
import NotasFiscaisView from "@/views/NotasFiscaisView";
import ConfiguracoesView from "@/views/ConfiguracoesView";
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
  SidebarInset,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  FileText,
  HandCoins,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  ReceiptText,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Stethoscope,
  Users,
  Wallet,
} from "lucide-react";
import { CSSProperties } from "react";
import LoginView from "@/views/LoginView";
import CadastroView from "@/views/CadastroView";
import PrimeiroAcessoView from "@/views/PrimeiroAcessoView";
import AceitarConviteView from "@/views/AceitarConviteView";
import EquipeView from "@/views/EquipeView";
import PermissoesView from "@/views/PermissoesView";
import LandingPageView from "@/views/LandingPageView";
import CorporateChatWidget from "@/components/CorporateChatWidget";

const menuItems = [
  { icon: LayoutDashboard, label: "Início", path: "/" },
  { icon: CalendarDays, label: "Agenda", path: "/agenda" },
  { icon: Users, label: "Pacientes", path: "/pacientes" },
  { icon: Stethoscope, label: "Profissionais", path: "/profissionais" },
  { icon: ClipboardList, label: "Procedimentos", path: "/procedimentos" },
  { icon: ShieldCheck, label: "Convênios", path: "/convenios" },
  { icon: Wallet, label: "Receitas", path: "/receitas" },
  { icon: ReceiptText, label: "Despesas", path: "/despesas" },
  { icon: ShoppingCart, label: "Vendas", path: "/vendas" },
  { icon: HandCoins, label: "Repasse", path: "/repasses" },
  { icon: Scale, label: "Extrato", path: "/extrato" },
  { icon: FileText, label: "Recibos", path: "/recibos" },
  { icon: FileText, label: "Notas fiscais", path: "/notas-fiscais" },
  { icon: MapPin, label: "Configurações", path: "/configuracoes" },
  { icon: ShieldCheck, label: "Permissões", path: "/permissoes", ownerOnly: true },
  { icon: Users, label: "Equipe", path: "/equipe", ownerOnly: true },
];

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeView} />
      <Route path="/agenda" component={AgendaView} />
      <Route path="/pacientes" component={PacientesView} />
      <Route path="/profissionais" component={ProfissionaisView} />
      <Route path="/procedimentos" component={ProcedimentosView} />
      <Route path="/convenios" component={ConveniosView} />
      <Route path="/receitas" component={ReceitasView} />
      <Route path="/despesas" component={DespesasView} />
      <Route path="/vendas" component={VendasView} />
      <Route path="/repasses" component={RepasseView} />
      <Route path="/extrato" component={ExtratoView} />
      <Route path="/recibos" component={RecibosView} />
      <Route path="/notas-fiscais" component={NotasFiscaisView} />
      <Route path="/configuracoes" component={ConfiguracoesView} />
      <Route path="/permissoes" component={PermissoesView} />
      <Route path="/equipe" component={EquipeView} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// (helper removido — navegação pública usa setLocation do wouter no shell)

function HomeView() {
  const [, setLocation] = useLocation();
  const shortcuts = [
    { label: "Novo paciente", description: "Cadastre e organize dados clínicos", path: "/pacientes", icon: Users },
    { label: "Novo agendamento", description: "Encontre um horário disponível", path: "/agenda", icon: CalendarDays },
    { label: "Ver receitas", description: "Acompanhe o financeiro da clínica", path: "/receitas", icon: Wallet },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-primary px-6 py-8 text-primary-foreground shadow-sm sm:px-8">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative max-w-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary-soft">Visão geral da clínica</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Bom dia, vamos cuidar da operação?</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-teal-50 sm:text-base">Acesse rapidamente os fluxos mais importantes e mantenha pacientes, agenda e financeiro em um só lugar.</p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumo da clínica">
        {[
          { label: "Agenda de hoje", value: "—", helper: "Consulte seus atendimentos", Icon: CalendarDays, color: "text-primary", bg: "bg-primary-soft" },
          { label: "Pacientes ativos", value: "—", helper: "Gerencie seus cadastros", Icon: Users, color: "text-success-strong", bg: "bg-success-soft" },
          { label: "Saldo do período", value: "—", helper: "Acompanhe suas receitas", Icon: Wallet, color: "text-warning-strong", bg: "bg-warning-soft" },
          { label: "Procedimentos", value: "—", helper: "Catálogo e preços", Icon: ClipboardList, color: "text-info", bg: "bg-info-soft" },
        ].map(({ label, value, helper, Icon, color, bg }) => {
          const StatIcon = Icon;
          return <article key={label as string} className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow duration-200 ease-out hover:shadow-md max-sm:p-4">
            <div className="flex items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{value}</p></div><span className={`rounded-lg p-2.5 ${bg} ${color}`}><StatIcon className="h-5 w-5" strokeWidth={1.75} /></span></div>
            <p className="mt-3 text-xs text-muted-foreground">{helper}</p>
          </article>;
        })}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Atalhos</p><h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">O que você precisa fazer?</h2></div></div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {shortcuts.map(({ label, description, path, icon: Icon }) => <button key={path} type="button" onClick={() => setLocation(path)} className="group flex min-h-[138px] flex-col justify-between rounded-xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><span><span className="flex items-center justify-between gap-3 font-semibold text-foreground"><span>{label}</span><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></span></button>)}
        </div>
      </section>
    </div>
  );
}

function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><DashboardLayout /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

function DashboardLayout() {
  // 260px aberta / 72px recolhida: o rótulo do menu cabe sem corte e o
  // trilho recolhido continua com alvo de toque confortável.
  return <SidebarProvider style={{ "--sidebar-width": "260px", "--sidebar-width-icon": "72px" } as CSSProperties}><DashboardShell /></SidebarProvider>;
}

// Navegação inferior (mobile). Os quatro destinos mais usados + "Mais" abrindo
// o drawer com o menu completo — em telas pequenas a sidebar não cabe.
const MOBILE_NAV_ITEMS = [
  { icon: CalendarDays, label: "Agenda", path: "/agenda" },
  { icon: Users, label: "Pacientes", path: "/pacientes" },
  { icon: LayoutDashboard, label: "Início", path: "/" },
  { icon: Wallet, label: "Financeiro", path: "/receitas" },
];

function MobileBottomNav({
  location,
  onNavigate,
  onMore,
}: {
  location: string;
  onNavigate: (path: string) => void;
  onMore: () => void;
}) {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex h-16 items-stretch">
        {MOBILE_NAV_ITEMS.map(({ icon: Icon, label, path }) => {
          const active = location === path;
          return (
            <li key={path} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onNavigate(path)}
                aria-current={active ? "page" : undefined}
                className={`flex h-full min-h-11 w-full min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-[10px] font-medium leading-tight tracking-tight transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} />
                <span className="w-full truncate text-center">{label}</span>
              </button>
            </li>
          );
        })}
        <li className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onMore}
            className="flex h-full min-h-11 w-full min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-[10px] font-medium leading-tight tracking-tight text-muted-foreground transition-colors hover:text-foreground"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
            <span className="w-full truncate text-center">Mais</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

const PUBLIC_ROUTES = ["/landing", "/entrar", "/cadastro", "/primeiro-acesso", "/aceitar-convite"];

function DashboardShell() {
  const { loading, user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, setOpenMobile } = useSidebar();
  const isCollapsed = state === "collapsed";

  // Rotas públicas (landing comercial / login) renderizam em tela cheia,
  // sem sidebar e sem chat corporativo.
  if (PUBLIC_ROUTES.includes(location)) {
    return (
      <main className="min-h-screen w-full bg-background">
        <Switch>
          <Route path="/landing" component={() => <LandingPageView onEnter={() => setLocation("/entrar")} />} />
          <Route path="/entrar" component={() => <div className="flex min-h-screen w-full items-center justify-center bg-background"><LoginView /></div>} />
          <Route path="/cadastro" component={() => <div className="flex min-h-screen w-full items-center justify-center bg-background"><CadastroView /></div>} />
          <Route path="/primeiro-acesso" component={() => <div className="flex min-h-screen w-full items-center justify-center bg-background"><PrimeiroAcessoView token={new URLSearchParams(window.location.search).get("token") ?? ""} /></div>} />
          <Route path="/aceitar-convite" component={() => <div className="flex min-h-screen w-full items-center justify-center bg-background"><AceitarConviteView token={new URLSearchParams(window.location.search).get("token") ?? ""} /></div>} />
          <Route component={NotFound} />
        </Switch>
      </main>
    );
  }

  // Fluxo de login: sessão carregada sem usuário em rota privada → landing.
  const activeLabel = menuItems.find((item) => item.path === location)?.label ?? "Menu";

  if (loading) return <div className="flex min-h-screen w-full items-center justify-center bg-background"><div className="flex flex-col items-center gap-3"><div className="h-8 w-8 animate-pulse rounded-full bg-primary" /><p className="text-sm text-muted-foreground">Carregando sessão...</p></div></div>;
  if (!user) return <LandingPageView onEnter={() => setLocation("/entrar")} />;

  // "Permissões" é área exclusiva do titular da conta (contratante).
  const isOwner = user.role === "owner" || user.role === "admin" || (user as { role?: string }).role === "owner";
  const visibleMenuItems = menuItems.filter((item) => !item.ownerOnly || isOwner);

  return <><TrialGate /><Sidebar collapsible="icon" className="border-r border-border bg-card"><SidebarHeader className="h-16 justify-center px-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Stethoscope className="h-5 w-5" /></div>{!isCollapsed && <div><div className="font-bold tracking-tight text-foreground">OllCLin</div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Gestão clínica</div></div>}</div></SidebarHeader><SidebarContent><SidebarMenu className="px-2 py-2">{visibleMenuItems.map(({ icon: Icon, label, path }) => <SidebarMenuItem key={path}><SidebarMenuButton isActive={location === path} onClick={() => setLocation(path)} tooltip={label} className="h-11 transition-colors data-[active=true]:bg-primary-soft data-[active=true]:text-primary md:h-10"><Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} /><span>{label}</span></SidebarMenuButton></SidebarMenuItem>)}<SidebarSeparator className="my-2" /></SidebarMenu></SidebarContent><SidebarFooter className="p-3"><DropdownMenu><DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Avatar className="h-9 w-9 shrink-0 border"><AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{user.name?.charAt(0).toUpperCase() ?? "U"}</AvatarFallback></Avatar><div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-medium leading-none text-foreground">{user.name || "Usuário"}</p><p className="mt-1.5 truncate text-xs text-muted-foreground">{user.email || "—"}</p></div></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onClick={() => logout()}><LogOut className="mr-2 h-4 w-4" /><span>Sair</span></DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarFooter></Sidebar><SidebarInset className="min-w-0 bg-background"><header className="sticky top-0 z-sticky flex h-14 items-center justify-between gap-3 border-b border-border bg-card/90 px-4 backdrop-blur sm:px-6"><div className="flex min-w-0 items-center gap-3"><SidebarTrigger className="hidden h-9 w-9 rounded-lg bg-muted md:inline-flex" /><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground md:hidden"><Stethoscope className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{activeLabel}</p><p className="hidden text-xs text-muted-foreground sm:block">OllCLin · gestão simples e segura</p></div></div></header><main className="min-w-0 flex-1 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-6 md:pb-6"><Router /></main></SidebarInset><MobileBottomNav location={location} onNavigate={(path) => setLocation(path)} onMore={() => setOpenMobile(true)} /><CorporateChatWidget /></>;
}

export default App;
