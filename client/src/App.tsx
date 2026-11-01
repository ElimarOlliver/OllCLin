import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
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
  { icon: MapPin, label: "Configurações", path: "/configuracoes" },
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
      <Route path="/configuracoes" component={ConfiguracoesView} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function HomeView() {
  const [, setLocation] = useLocation();
  const shortcuts = [
    { label: "Novo paciente", description: "Cadastre e organize dados clínicos", path: "/pacientes", icon: Users },
    { label: "Novo agendamento", description: "Encontre um horário disponível", path: "/agenda", icon: CalendarDays },
    { label: "Ver receitas", description: "Acompanhe o financeiro da clínica", path: "/receitas", icon: Wallet },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-[#075e63] px-6 py-8 text-white shadow-sm sm:px-8">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative max-w-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-teal-100">Visão geral da clínica</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Bom dia, vamos cuidar da operação?</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-teal-50 sm:text-base">Acesse rapidamente os fluxos mais importantes e mantenha pacientes, agenda e financeiro em um só lugar.</p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Resumo da clínica">
        {[
          { label: "Agenda de hoje", value: "—", helper: "Consulte seus atendimentos", Icon: CalendarDays, color: "text-[#075e63]" },
          { label: "Pacientes ativos", value: "—", helper: "Gerencie seus cadastros", Icon: Users, color: "text-emerald-700" },
          { label: "Saldo do período", value: "—", helper: "Acompanhe suas receitas", Icon: Wallet, color: "text-amber-700" },
        ].map(({ label, value, helper, Icon, color }) => {
          const StatIcon = Icon;
          return <article key={label as string} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between gap-4"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p></div><span className={`rounded-lg bg-slate-50 p-2.5 ${color}`}><StatIcon className="h-5 w-5" /></span></div>
            <p className="mt-3 text-xs text-slate-500">{helper}</p>
          </article>;
        })}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#075e63]">Atalhos</p><h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">O que você precisa fazer?</h2></div></div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {shortcuts.map(({ label, description, path, icon: Icon }) => <button key={path} type="button" onClick={() => setLocation(path)} className="group flex min-h-[138px] flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075e63] focus-visible:ring-offset-2"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-[#075e63]"><Icon className="h-5 w-5" /></span><span><span className="flex items-center justify-between gap-3 font-semibold text-slate-900"><span>{label}</span><ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1" /></span><span className="mt-1 block text-sm text-slate-500">{description}</span></span></button>)}
        </div>
      </section>
    </div>
  );
}

function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><DashboardLayout /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

function DashboardLayout() {
  return <SidebarProvider style={{ "--sidebar-width": "280px" } as CSSProperties}><DashboardShell /></SidebarProvider>;
}

function DashboardShell() {
  const { loading, user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const activeLabel = menuItems.find((item) => item.path === location)?.label ?? "Menu";

  if (loading) return <div className="flex min-h-screen w-full items-center justify-center bg-[#f7f8f5]"><div className="flex flex-col items-center gap-3"><div className="h-8 w-8 animate-pulse rounded-full bg-[#075e63]" /><p className="text-sm text-slate-500">Carregando sessão...</p></div></div>;
  if (!user) return <div className="flex min-h-screen w-full items-center justify-center bg-[#f7f8f5]"><LoginView /></div>;

  return <><Sidebar collapsible="icon" className="border-r border-slate-200 bg-white"><SidebarHeader className="h-16 justify-center px-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#075e63] text-white"><Stethoscope className="h-5 w-5" /></div>{!isCollapsed && <div><div className="font-bold tracking-tight text-slate-900">OllCLin</div><div className="text-[10px] uppercase tracking-wider text-slate-400">Gestão clínica</div></div>}</div></SidebarHeader><SidebarContent><SidebarMenu className="px-2 py-2">{menuItems.map(({ icon: Icon, label, path }) => <SidebarMenuItem key={path}><SidebarMenuButton isActive={location === path} onClick={() => setLocation(path)} tooltip={label} className="h-10 transition-colors data-[active=true]:bg-teal-50 data-[active=true]:text-[#075e63]"><Icon className="h-4 w-4" /><span>{label}</span></SidebarMenuButton></SidebarMenuItem>)}<SidebarSeparator className="my-2" /></SidebarMenu></SidebarContent><SidebarFooter className="p-3"><DropdownMenu><DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#075e63]"><Avatar className="h-9 w-9 shrink-0 border"><AvatarFallback className="bg-teal-50 text-xs font-semibold text-[#075e63]">{user.name?.charAt(0).toUpperCase() ?? "U"}</AvatarFallback></Avatar><div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-medium leading-none text-slate-900">{user.name || "Usuário"}</p><p className="mt-1.5 truncate text-xs text-slate-500">{user.email || "—"}</p></div></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onClick={() => logout()}><LogOut className="mr-2 h-4 w-4" /><span>Sair</span></DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarFooter></Sidebar><SidebarInset className="min-w-0 bg-[#f7f8f5]"><header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6"><div className="flex items-center gap-3"><SidebarTrigger className="h-9 w-9 rounded-lg bg-slate-50" /><div><p className="text-sm font-semibold text-slate-900">{activeLabel}</p><p className="hidden text-xs text-slate-500 sm:block">OllCLin · gestão simples e segura</p></div></div></header><main className="min-w-0 flex-1 p-4 sm:p-6"><Router /></main></SidebarInset></>;
}

export default App;
