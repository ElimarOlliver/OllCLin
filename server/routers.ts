/**
 * OllCLin - Camada Controller/Rotas
 * Arquitetura MVC - Definição de rotas tRPC por módulo
 *
 * Cada módulo expõe procedures tRPC que atuam como controladores,
 * chamando os Models para acessar o banco de dados.
 */

import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

// Importar routers de cada módulo (Camada Controller)
import { patientRouter } from "./controllers/patient.controller";
import { appointmentRouter } from "./controllers/appointment.controller";
import { professionalRouter } from "./controllers/professional.controller";
import { procedureRouter } from "./controllers/procedure.controller";
import { expenseRouter } from "./controllers/expense.controller";
import { settingsRouter } from "./controllers/settings.controller";
import { healthPlanRouter } from "./controllers/health-plan.controller";
import { revenueRouter } from "./controllers/revenue.controller";
import { saleRouter } from "./controllers/sale.controller";
import { payoutRouter } from "./controllers/payout.controller";
import { statementRouter } from "./controllers/statement.controller";
import { receiptRouter } from "./controllers/receipt.controller";

export const appRouter = router({
  // Sistema / Saúde
  system: systemRouter,

  // Autenticação
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // === MÓDULOS MVC ===

  // Pacientes
  pacientes: patientRouter,

  // Agendamentos (com integração Google Calendar)
  agendamentos: appointmentRouter,

  // Profissionais de Saúde
  profissionais: professionalRouter,

  // Procedimentos
  procedimentos: procedureRouter,

  // Convênios (Configurações Gerais)
  convenios: healthPlanRouter,

  // Financeiro — Receitas
  receitas: revenueRouter,

  // Financeiro — Despesas + categorias
  despesas: expenseRouter,

  // Financeiro — Vendas (Cap. 15.1.2)
  vendas: saleRouter,

  // Financeiro — Repasse (Cap. 15.3)
  repasses: payoutRouter,

  // Financeiro — Extrato derivado (Cap. 15.4)
  extrato: statementRouter,

  // Financeiro — Recibos (Cap. 15.5)
  recibos: receiptRouter,

  // Configurações: locais/salas + campos obrigatórios
  configuracoes: settingsRouter,

  // TODO: Prontuário, Exames, Cirurgias, Despesas, Repasse, TISS, Telessaúde, Marketing, Relatórios
  // exemplo:
  // prontuario: prontuarioRouter,
  // exames: examesRouter,
});

export type AppRouter = typeof appRouter;