# TODO — Site de estratégia do novo sistema clínico

## Incremento 2 — Despesas + Locais/Salas + Campos Obrigatórios [CONCLUÍDO]
- [x] Migração `0002_despesas_locais_campos.sql` aplicada no Supabase: `expense_categories` (hierárquica, Fixas/Variáveis), `expenses`, `expense_history`, `org_settings` (campos obrigatórios + inatividade + funcionalidades), colunas extras em `locations` (organization_id, telefone, e-mail).
- [x] Financeiro > Despesas: Model (`expense.model.ts`) + Controller (`expense.controller.ts`) com categorias hierárquicas (REQ-08-016..026), favorecido, parcelas condicionais, recorrência, resumo pago/a pagar/atrasado, cancelamento com motivo obrigatório e histórico por despesa (Cap. 15.2).
- [x] `DespesasView.tsx` (rota `/despesas`): listagem, nova despesa (tipo de custo → categoria, forma de pagamento, recorrência), gerenciador de categorias com subcategorias, resumo e cancelamento com motivo.
- [x] Configurações > Gerais: Controller `settings.controller.ts` com locais (REQ-05-010..012, só "Local" obrigatório), salas por local (REQ-05-013/014) e campos obrigatórios de pacientes (REQ-05-015..018) — campo Nome bloqueado contra desativação (REQ-05-019).
- [x] `ConfiguracoesView.tsx` (rota `/configuracoes`): locais com aba Salas (criar/excluir sala) + toggles de campos obrigatórios com salvamento imediato.
- [x] Menu atualizado: Despesas e Configurações; antigo atalho "Configurações" (que apontava para 404) removido.
- [x] Validação: `tsc --noEmit` sem erros; Vitest 6/6; tabelas verificadas via PostgREST (`expense_categories` com Fixas/Variáveis, locations com `organization_id`).

## Revisão final (rodada de auditoria)
- [x] `tsc --noEmit`: 0 erros. Vitest: 6/6 passando (`server/platform.test.ts` + 1).
- [x] Corrigido problema encontrado na revisão: o seed via SQL havia rodado múltiplas vezes durante o debug e deixou ~52 formas de pagamento duplicadas — banco limpo e repovoado apenas via `seed.ts` oficial (idempotente).
- [x] Estado final do banco validado via PostgREST: organizations=1, health_plans=2, payment_methods=7, revenues=4.
- [x] Removido log de debug `[proto]` do `pg-client.mjs`.

## Incremento 1 — Convênios + Financeiro (Receitas) [CONCLUÍDO]
- [x] Corrigir erro de TypeScript no schema Drizzle (`AnyMySqlColumn` não importado).
- [x] Migração SQL `drizzle/migrations/0001_convenios_financeiro.sql`: `health_plans`, `payment_methods`, `revenues`, `revenue_history` (isolamento por `organization_id`).
- [x] Model + Controller tRPC de Convênios (REQ-05-001 a REQ-05-004): listagem, criação (operadora predefinida ou livre), código ANS, versão XML TISS, edição e exclusão lógica com auditoria.
- [x] Model + Controller tRPC de Receitas (Cap. 15.1): múltiplas parcelas, pagador alternativo, resumo recebidos/a receber, intervalo de pesquisa limitado a 90 dias, cancelamento apenas com status `a_receber` e motivo obrigatório no histórico.
- [x] View `ConveniosView.tsx` (Convênios) com busca, modal de cadastro/edição e ações de editar/inativar; rota `/convenios` no menu.
- [x] `tsc --noEmit` sem erros; suíte Vitest passando (6/6).
- [x] Migração `0001` aplicada e validada no Supabase (ver nesta rodada):
  - Corrigida `DATABASE_URL` no `.env`: região correta é `aws-1-sa-east-1` (a senha foi URL-encodada: `@@` → `%40%40`).
  - Criado `scripts/pg-client.mjs`: cliente Postgres sem dependências (protocolo 3.0 + SCRAM-SHA-256) para rodar migrações via CLI: `node.cmd scripts/pg-client.mjs --file drizzle/migrations/0001_convenios_financeiro.sql`.
  - Criado `scripts/find-region.mjs`: localiza a região do pooler do projeto (foi como descobrimos `aws-1-sa-east-1`).
  - Criados `scripts/probe-db.mjs` e `scripts/probe-startup.mjs` para diagnóstico de conexão.
  - Validação: `health_plans`, `payment_methods`, `revenues`, `revenue_history` e índices criados; leitura OK via PostgREST (caminho usado pelos Models); dados de demonstração inseridos (2 convênios, 3 formas de pagamento, 1 receita).
- [x] Seed de formas de recebimento e Receitas (ver nesta rodada):
  - `scripts/seed.ts` estendido (`npm.cmd run db:seed`): 7 formas de recebimento (REQ-08-027..035) e 4 receitas demo (recebido/a_receber), tudo idempotente.
  - Convênios demo (Unimed/Amil) inseridos via `pg-client.mjs` — o seed oficial não os cobre.
  - Nova `ReceitasView.tsx` (rota `/receitas`, menu "Receitas"): listagem com parcelas n/N, novo recebimento (valor, parcelas, pagador alternativo, forma, convênio, vencimento, descrição), resumo Recebido/A Receber, histórico por receita, cancelamento com motivo obrigatório (Cap. 15.1.1).
  - Backend: procedure `receitas.paymentMethods` lista formas ativas para o formulário (REQ-08-036).
  - Criado `scripts/fix-mojibake.mjs` para reparar acentos em arquivos UTF-8 mal gravados.
  - `tsc --noEmit` sem erros; Vitest 6/6 passando.

## Incremento 3 — Financeiro completo (Vendas, Repasse, Extrato, Recibos) [CÓDIGO CONCLUÍDO — MIGRAÇÃO PENDENTE]
- [x] Migração `drizzle/migrations/0003_financeiro_completo.sql` criada: `sales`/`sale_items`/`sale_history`, `payouts`/`payout_items`/`payout_history`, `receipts`/`receipt_history`, colunas `revenues.professional_id`/`revenues.location_id` (com backfill por agendamento) e `professionals.commission_percentage`.
- [ ] **Aplicar a migração 0003 no Supabase** (SQL Editor) ou rodar `node scripts/pg-client.mjs --file drizzle/migrations/0003_financeiro_completo.sql`. Sem `DATABASE_URL`/senha do banco a aplicação não é possível por CLI/REST; enquanto isso, os módulos novos exibem uma mensagem clara pedindo a migração.
- [x] `server/lib/schema-capabilities.ts`: detecta (com cache de 60s) se a migração 0003 já foi aplicada. Profissionais/Receitas continuam funcionando nas colunas legadas e os módulos novos respondem com instrução objetiva em vez de erro cru do PostgREST; aplicar a migração com o servidor ligado já é reconhecido na próxima operação.
- [x] Financeiro > Vendas (Cap. 15.1.2): Model/Controller + `VendasView.tsx` — cabeçalho + múltiplos itens, status A Receber/Recebido/Cancelada, totais (a receber, recebido, geral), histórico e cancelamento com motivo obrigatório.
- [x] Financeiro > Repasse (Cap. 15.3): Model/Controller + `RepasseView.tsx` — abas Receitas/Repasses, elegibilidade por profissional/local/período, percentual padrão do profissional (ajustável), retroativo automático entre repasses, cancelamento com motivo devolvendo as receitas à elegibilidade.
- [x] Financeiro > Extrato (Cap. 15.4): Model/Controller + `ExtratoView.tsx` — extrato derivado de receitas/vendas/despesas/repasses, filtros por período/tipo/origem, saldo do período e exportação CSV.
- [x] Financeiro > Recibos (Cap. 15.5): Model/Controller + `RecibosView.tsx` — emitente usuário ou estabelecimento, vínculo opcional a receita, impressão, histórico e cancelamento com motivo.
- [x] `revenues` estendida com `professionalId`/`locationId` (create/update/filtros) e preenchimento automático de `received_at` ao marcar como recebido; `ReceitasView.tsx` ganhou selects de profissional/local e ação "Marcar como recebido".
- [x] `professionals.commissionPercentage` (0–100) no Model/Controller; `ProfissionaisView.tsx` reescrita com cadastro/edição reais, campo de repasse (%) e desativação com confirmação (soft delete).
- [x] Campos obrigatórios de paciente aplicados de verdade (REQ-05-015..019): helper compartilhado `server/lib/patient-requirements.ts` usado no create (payload) e no update (registro atual + alterações); Nome sempre obrigatório; `PacientesView.tsx` marca dinamicamente os campos exigidos e o backend retorna mensagem clara.
- [x] Rotas tRPC `vendas`, `repasses`, `extrato`, `recibos` registradas; menu e rotas do frontend atualizados.
- [x] `scripts/smoke-api.mjs`: verificação rápida das rotas principais com o servidor local, usada para confirmar que a migração pendente não derrubou módulos existentes.
- [x] Validação: `tsc --noEmit` sem erros; Vitest 6/6.

## Próximos passos (roadmap Cap. 15)
- [x] Financeiro: Vendas, Repasse, Extrato, Recibos (menu completo).
- [x] Aplicar Campos Obrigatórios na validação real do cadastro de pacientes (criar/atualizar consultam `org_settings`).
- [ ] Aplicar a migração `0003_financeiro_completo.sql` e fazer o smoke test real dos quatro módulos financeiros.
- [ ] Habilitar RLS por `organization_id` e concluir a integração com o Supabase Auth (hoje há bypass de desenvolvimento `ALLOW_DEV_AUTH`).
- [ ] Integrar o Google Calendar (bloqueado até receber as credenciais OAuth).

## Experiência de roadmap baseada no relatório
- [ ] Entregar uma página inicial em português do Brasil que explique a tese do produto: construir um núcleo clínico transacional confiável antes de expandir para financeiro, TISS, integrações, telessaúde, marketing e analítica.
- [ ] Apresentar objetivos, contexto estratégico e direcionadores em uma leitura executiva clara para stakeholders e equipe de produto.
- [ ] Organizar os aprendizados do Ti.Clinic em evidências observadas, implicações para o novo sistema e limitações da fonte.
- [ ] Exibir mapa navegável dos domínios e módulos do novo sistema, com hierarquia e relações entre áreas.
- [ ] Representar as jornadas ponta a ponta como fluxos sequenciais com dependências explícitas.
- [ ] Mostrar a arquitetura de informação proposta, incluindo navegação principal e entidades centrais.
- [ ] Estruturar segurança e governança com princípios de controle de acesso, imutabilidade, privacidade/LGPD, auditoria e resiliência.
- [ ] Priorizar o MVP com itens ordenados e justificativas derivadas do relatório.
- [ ] Exibir roadmap por fases com progressão visual, entregas e dependências.
- [ ] Manter critérios de aceite e decisões em aberto em áreas claramente separadas.
- [ ] Aplicar um sistema visual consistente para distinguir Observado, Recomendação e Não documentado em todo o site.
- [ ] Incluir navegação por âncoras, filtros de evidência e comportamento responsivo para desktop e mobile.
- [ ] Servir /manus-routes.json com a rota principal do site antes de iniciar o servidor.

## Validação e entrega
- [ ] Confirmar diagnósticos TypeScript sem erros acionáveis.
- [ ] Confirmar que o site responde no Preview e que a interface principal renderiza sem overflow horizontal indevido.
- [ ] Confirmar que o build estático gera a saída esperada.
- [ ] Definir metadados de marca em app.config.ts antes do checkpoint.