import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { startLogin } from "@/const";
import { useAuth } from "@/lib/trpc";

// Importar Views (Camada Visão - MVC)
import AgendaView from "@/views/AgendaView";
import PacientesView from "@/views/PacientesView";
import ProfissionaisView from "@/views/ProfissionaisView";
import ProcedimentosView from "@/views/ProcedimentosView";

// Importar componentes de layout
import { Sidebar, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger, SidebarHeader, SidebarFooter, useSidebar, SidebarInset, SidebarGroup, SidebarGroupLabel, SidebarSeparator } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut, LayoutDashboard, Users, CalendarDays, Stethoscope, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useLocation } from "wouter";

const menuItems = [
  { icon: LayoutDashboard, label: "Início", path: "/" },
  { icon: CalendarDays, label: "Agenda", path: "/agenda" },
  { icon: Users, label: "Pacientes", path: "/pacientes" },
  { icon: Stethoscope, label: "Profissionais", path: "/profissionais" },
  { icon: Settings, label: "Procedimentos", path: "/procedimentos" },
];

function Router() {
  const [location, setLocation] = useLocation();

  return (
    <Switch>
      <Route path={"/"} component={HomeView} />
      <Route path={"/agenda"} component={AgendaView} />
      <Route path={"/pacientes"} component={PacientesView} />
      <Route path={"/profissionais"} component={ProfissionaisView} />
      <Route path={"/procedimentos"} component={ProcedimentosView} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function HomeView() {
  return (
    <div className="p-8">
      <div className="bg-white rounded-lg border border-line shadow-sm p-6">
        <h1 className="text-2xl font-bold text-foreground mb-2">Bem-vindo ao OllCLin</h1>
        <p className="text-muted text-sm mb-6">
          Sistema clínico acessível, moderno e seguro. Use o menu lateral para navegar entre os módulos.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[menuItems].map((item) => (
            <div key={item.path} className="p-4 rounded-lg border border-line bg-surface hover:bg-primary/5 transition-colors cursor-pointer" onClick={() => {}}>
              <item.icon className="h-5 w-5 text-primary mb-2" />
              <div className="text-sm font-medium text-foreground">{item.label}</div>
            </div>
          ))}
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
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 rounded-full bg-primary animate-pulse" />
          <p className="text-muted text-sm">Carregando sessão...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-6 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-bold text-foreground text-center">OllCLin</h1>
            <p className="text-muted text-sm text-center">
              Acesso ao dashboard requer autenticação.
            </p>
          </div>
          <Button
            onClick={() => startLogin()}
            size="lg"
            className="w-full bg-primary text-white hover:bg-primary/90 shadow-lg"
          >
            Entrar no Sistema
          </Button>
        </div>
      </div>
    );
  }

  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` }}>
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader className="h-16 justify-center px-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-white">
              <Stethoscope className="h-5 w-5" />
            </div>
            {!isCollapsed && (
              <div className="font-semibold text-foreground tracking-tight">OllCLin</div>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarMenu>
            {menuItems.map((item) => {
              const isActive = location === item.path;
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={isActive}
                    onClick={() => setLocation(item.path)}
                    tooltip={item.label}
                    className="h-10 transition-all"
                  >
                    <item.icon
                      className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                    />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
            <SidebarSeparator />
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setLocation("/404")}
                tooltip="Configurações"
                className="h-10 transition-all"
              >
                <Settings className="h-4 w-4" />
                <span>Configurações</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-surface/50 w-full text-left focus:outline-none">
                <Avatar className="h-9 w-9 border shrink-0">
                  <AvatarFallback className="text-xs font-medium">
                    {user.name?.charAt(0).toUpperCase()}
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
              <DropdownMenuItem onClick={() => startLogin()}>
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
    </SidebarProvider>
  );
}

export default App;