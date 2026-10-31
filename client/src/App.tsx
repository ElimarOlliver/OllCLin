import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { startLogin } from "@/const";
import { useAuth } from "@/hooks/useAuth";

// Importar Views (Camada Visão - MVC)
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

// Importar componentes de layout
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
  SidebarGroupLabel,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LogOut,
  LayoutDashboard,
  Users,
  CalendarDays,
  Stethoscope,
  ClipboardList,
  ShieldCheck,
  Wallet,
  ReceiptText,
  MapPin,
  ShoppingCart,
  HandCoins,
  Scale,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
      <Route path="/configuracoes" component={ConfiguracoesView} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function HomeView() {
  const [, setLocation] = useLocation();

  return (
    <div className="p-2">
      <div className="bg-white rounded-lg border border-line shadow-sm p-6">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Bem-vindo ao OllCLin
        </h1>
        <p className="text-muted text-sm mb-6">
          Sistema clínico acessível, moderno e seguro. Use o menu lateral ou os
          atalhos abaixo para navegar entre os módulos.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {menuItems.slice(1).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => setLocation(item.path)}
                className="p-4 rounded-lg border border-line bg-surface hover:bg-primary/5 transition-colors cursor-pointer text-left"
              >
                <Icon className="h-5 w-5 text-primary mb-2" />
                <div className="text-sm font-medium text-foreground">
                  {item.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <DashboardLayout />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function DashboardLayout() {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "280px" } as React.CSSProperties}
    >
      <DashboardShell />
    </SidebarProvider>
  );
}

function DashboardShell() {
  const { loading, user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen w-full">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 rounded-full bg-primary animate-pulse" />
          <p className="text-muted text-sm">Carregando sessão...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen w-full">
        <div className="flex flex-col items-center gap-6 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-bold text-foreground text-center">
              OllCLin
            </h1>
            <p className="text-muted text-sm text-center">
              Acesso ao dashboard requer autenticação.
            </p>
          </div>
          <Button
            onClick={() => {
              try {
                startLogin();
              } catch {
                alert(
                  "Login Manus não configurado. Defina ALLOW_DEV_AUTH=true no .env para usar o modo local.",
                );
              }
            }}
            size="lg"
            className="w-full bg-primary text-white hover:bg-primary/90 shadow-lg"
          >
            Entrar no Sistema
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader className="h-16 justify-center px-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-white">
              <Stethoscope className="h-5 w-5" />
            </div>
            {!isCollapsed && (
              <div className="font-semibold text-foreground tracking-tight">
                OllCLin
              </div>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarMenu>
            {menuItems.map((item) => {
              const isActive = location === item.path;
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={isActive}
                    onClick={() => setLocation(item.path)}
                    tooltip={item.label}
                    className="h-10 transition-all"
                  >
                    <Icon
                      className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                    />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
            <SidebarSeparator />
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-surface/50 w-full text-left focus:outline-none">
                <Avatar className="h-9 w-9 border shrink-0">
                  <AvatarFallback className="text-xs font-medium">
                    {user.name?.charAt(0).toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                  <p className="text-sm font-medium truncate leading-none">
                    {user.name || "-"}
                  </p>
                  <p className="text-xs text-muted truncate mt-1.5">
                    {user.email || "-"}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => logout()}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sair</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <div className="flex border-b h-14 items-center justify-between bg-white/95 px-4 backdrop-blur sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="h-9 w-9 rounded-lg bg-surface" />
            <div className="flex flex-col gap-1">
              <span className="tracking-tight text-foreground">
                {menuItems.find((i) => i.path === location)?.label ?? "Menu"}
              </span>
            </div>
          </div>
        </div>
        <main className="flex-1 p-6">
          <Router />
        </main>
      </SidebarInset>
    </>
  );
}

export default App;
