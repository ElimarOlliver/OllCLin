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

  // TODO: Prontuário, Exames, Cirurgias, Financeiro, TISS, Telessaúde, Marketing, Relatórios
  // exemplo:
  // prontuario: prontuarioRouter,
  // exames: examesRouter,
});

export type AppRouter = typeof appRouter;