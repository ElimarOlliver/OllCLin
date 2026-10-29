# Estratégia do Sistema OllCLin

> **Nome do sistema:** OllCLin  
> **Base de referência:** Manual Ti.Clinic v2.0 (Manula) + Relatório de Estratégia Consolidado  
> **Arquitetura:** MVC (Model-View-Controller)  
> **Banco de dados:** Supabase (PostgreSQL)  
> **Integração de agenda:** Google Calendar API  
> **Frontend:** React + TypeScript + Tailwind CSS + shadcn/ui  
> **Backend:** Node.js + Express + tRPC  
> **Humor/design:** Claro, acessível, moderno  
> **Paleta de cores:** #F8FAFC (fundo), #D9E6F2 (suave), #2F80ED (primário/azul), #111827 (quase preto/texto), #10B981 (verde/sucesso)

---

## 1. Tudo que foi Captado da Documentação Ti.Clinic

### 1.1 Estrutura do Manual (20 blocos)

| Bloco | Conteúdo |
|-------|----------|
| 1. Bem-vindo ao Manual Ti.Clinic | Apresentação da plataforma, contato de suporte |
| 2. Ajustes Iniciais | Requisitos computacionais, conexão com internet, Google Chrome recomendado |
| 3. Credenciais de Acesso | Login/senha provisória, primeira troca obrigatória, senha mínima 10 caracteres (maiúscula, minúscula, número, especial), expiração 180 dias, bloqueio após tentativas incorretas, 2FA opcional (Google Authenticator), expiração de sessão após 7 dias, logout por inatividade |
| 4. Tela Inicial | Unificação de contas, informativos, anotações, busca, créditos, métricas |
| 5. Configurações Gerais | Convênios, procedimentos, locais de atendimento, estabelecimentos, campos obrigatórios, campos obrigatórios TISS, funcionalidades, perfis de acesso, equipes de saúde, mensagens (e-mail, SMS, WhatsApp, pesquisa, créditos), lista de espera, chamada de TV, fuso horário |
| 6. Integrações | Omie, Pagar.me, Conta Azul, eNotas, RD Station, Google Calendar, Google Contacts |
| 7. Usuários do Sistema | Criação, edição, tipos de perfis, módulos, horários, procedimentos, configurações de acesso, repasse, certificado digital, página web |
| 8. Configurações Financeiras | Tabela de valores, categorias de despesas, formas de recebimento |
| 9. Configurações de Prontuários | Modelos de descrição cirúrgica, orçamentos, odontograma, prontuários, receituários |
| 10. Configurações de Exames | Laboratórios, exames para solicitação |
| 11. Módulo de Pacientes | Cadastro, busca, importação, dados pessoais, unificador de pacientes, prontuário eletrônico, prescritor (medicamentos, exames, atestado, alergias, histórico de saúde), multimídia, mensagens, portlets (alergias, complicações, antecedentes, diagnósticos, IMC, gordura corporal, pressão arterial, guias, solicitação de exames, fluxograma, vacinas, endoscopias, IMC pré-natal, Fenton, crescimento, ABA aplicação, reforçadores, medicamentos) |
| 12. Módulo de Agenda | Visualizações (dia/semana/mês), calendário e legendas de cores, orientações, encaixes, ações, status (Falta, Desmarcado, Marcado, Em Espera, Atendido, Confirmado, Solicitado, Em Atendimento), desativação de dias/horários, funcionalidades do dia selecionado, novo agendamento, multiagendamentos, lista de espera, Totem, chamada de TV |
| 13. Módulo de Cirurgias | Nova cirurgia (tipo eletiva/urgência, CID pré/pós, procedimentos planejados/realizados, valores, datas, equipe, descrição, complicações, anexos, PDFs, guia TISS), agenda cirúrgica |
| 14. Módulo de Exames | Novo orçamento, nova solicitação, solicitações |
| 15. Módulo Financeiro | Receitas, vendas, despesas, repasse (aba receitas, aba repasses), extrato, recibos |
| 16. TISS | Nova guia TISS, listar guias TISS, lotes de guias TISS, XML |
| 17. Módulo de Marketing | Campanhas, e-mail marketing, SMS marketing, configurações de mensagens |
| 18. Módulo de Telessaúde | Agendamento de videoconferência, iniciar videoconferência, convidar paciente, multiconvidados, visão geral (tela profissional/paciente), configuração microfone/câmera, novo atendimento |
| 19. Módulo de Relatórios | Relatórios de prontuário (pacientes, diagnósticos, atendimentos, prontuário, odontológico, exames, internamentos), agenda (agendamentos, marcações, retornos), cirurgias, financeiros (receitas, despesas, demonstrativo, orçamentos, guias de serviço, recibos, repasses), comunicação (e-mails, SMS, WhatsApp), telessaúde (videoconferências, participantes), usuários, pesquisa de satisfação, prescritor |
| 20. Backup, Segurança e Arquitetura | Backup e importação, arquitetura do sistema |

### 1.2 Estado Atual do Projeto Clinicroad

- **Stack:** React 19, Express, tRPC v11, Drizzle ORM, MySQL, Tailwind CSS, shadcn/ui, Vitest
- **Estrutura:** Monorepo com client/, server/, shared/
- **Autenticação:** OAuth Manus (sessão JWT via cookie)
- **Banco:** Schema inicial apenas com tabela `users`
- **UI:** Layout com sidebar, dashboard, tema claro/escuro, componentes shadcn/ui completos
- **Páginas:** Home (estratégia/roadmap), ComponentShowcase, NotFound

---

## 2. Estratégia para o Sistema OllCLin

### 2.1 Visão do Produto

O OllCLin é um sistema clínico acessível, moderno e seguro, construído sobre um **núcleo transacional confiável** (identidade, organização, pacientes, agenda, atendimento, prontuário) antes de expandir para financeiro, TISS, integrações, telessaúde, marketing e analítica.

### 2.2 Identidade Visual (UI Kit)

| Atributo | Valor |
|----------|-------|
| Humor | Claro, acessível, moderno |
| Uso ideal | Kit UI para app de saúde acessível |
| Filosofia | Neutros limpos com azul e verde acentuados transmitem modernidade e alta legibilidade |
| Botões | Azul para ações primárias, verde para sucesso, estilo consistente (cor indica significado, não decoração) |

### 2.3 Paleta de Cores (Tailwind)

| Nome | HEX | Uso |
|------|-----|-----|
| Background | #F8FAFC | Fundo principal, telas com muito texto |
| Muted/Surface | #D9E6F2 | Elementos secundários, linhas sutis |
| Primary | #2F80ED | Ações primárias, botões principais, links importantes |
| Foreground/Text | #111827 | Texto principal, títulos, quase preto |
| Success | #10B981 | Sucesso, confirmações, ações positivas |

### 2.4 Arquitetura MVC

O projeto segue rigorosamente o padrão MVC:

```
src/
├── models/          (Camada Modelo - Drizzle schema, entidades, validações Zod)
├── views/           (Camada Visão - componentes React, páginas, templates)
├── controllers/     (Camada Controlador - tRPC procedures, lógica de negócio, services)
├── routes/          (Definição de rotas tRPC/Express)
├── middleware/      (Autenticação, autorização, validação, logging)
├── lib/             (Utilitários, config Supabase, config Google Calendar)
└── types/           (Tipos TypeScript compartilhados)
```

**Fluxo MVC:**
1. **View** (React) envia ação via tRPC
2. **Controller** (tRPC procedure) recebe, valida, chama serviços
3. **Model** (Drizzle/Supabase) persiste/consulta dados
4. **Controller** retorna resultado para a **View**

---

## 3. Mapa de Módulos e Prioridades

| Módulo | Prioridade | Status | Base Ti.Clinic |
|--------|-----------|--------|---------------|
| Identidade & Administração | P0 | Planejado | Login, 2FA, sessões, usuários, perfis, RBAC |
| Pacientes | P0 | Planejado | Cadastro, busca, unificação, prontuário |
| Agenda + Google Calendar | P0 | **Em desenvolvimento** | Dia/semana/mês, status, encaixes, sincronização Google |
| Prontuário | P0 | Planejado | Fichas versionadas, prescrições, anexos |
| Exames | P1 | Planejado | Laboratórios, solicitações, resultados |
| Cirurgias | P1 | Planejado | Planejamento, equipe, agenda cirúrgica |
| Financeiro & TISS | P1/P2 | Planejado | Receitas, despesas, repasses, guias TISS, XML |
| Telessaúde | P1 | Planejado | Videoconferência, sala de espera, convidados |
| Marketing | P2 | Planejado | Campanhas, e-mail, SMS, WhatsApp |
| Relatórios | P1/P2 | Planejado | Clínicos, agenda, financeiros, comunicação |
| Integrações | P2 | Planejado | Omie, Pagar.me, Conta Azul, eNotas, RD Station |

---

## 4. Roadmap por Fases

| Fase | Período | Foco | Entregas-chave |
|------|---------|------|----------------|
| 0 - Fundamentos | 0-8 semanas | Segurança e base | Tenant, identidade, MFA, RBAC, modelo de dados, auditoria, design system, Supabase conectado |
| 1 - MVP Clínico | 2-5 meses | Operação segura | Pacientes, Agenda (com Google Calendar), Atendimento, Prontuário mínimo |
| 2 - Operação Ampliada | 5-8 meses | Mais contexto | Exames, Cirurgias, Telessaúde, Financeiro básico, Mensageria |
| 3 - Faturamento & Escala | 8-12 meses | Integrações | TISS homologado, Repasses, Integrações governadas, BI |
| 4 - Otimização | 12+ meses | Ecossistema | Marketing, portal paciente, app, alta disponibilidade |

---

## 5. Entidades Centrais (Modelo de Dados)

```
Organização 1:N Estabelecimento 1:N Local 1:N Sala
Usuário N:N Papel (RBAC + ABAC com escopos)
Profissional 1:N Especialidade, Conselho, Horário, Procedimento habilitado, Repasse
Equipe N:N Profissional
Paciente 1:N Agendamento, Atendimento, Ficha, Documento, Mídia, Receita, Solicitação de Exame, Cirurgia, Lançamento financeiro
Agendamento → Paciente, Profissional, Procedimento, Local, Sala, Convênio, Status, Eventos de comunicação
Atendimento → Versões de Ficha/Prontuário, prescrições, exames, atestados, anexos
Solicitação de Exame 1:N Item de exame → Laboratório, resultado/laudo, lançamentos
Cirurgia N:N Procedimento, Profissional (equipe por função), anexos, guias
Receita/Venda/Despesa → Parcela, Pagamento, Recibo, Repasse, Extrato, Guia TISS/Lote
Integração → credencial/token, escopo, versão, sincronização, evento, tentativa, erro, auditoria
```

---

## 6. Papéis e Permissões (RBAC + ABAC)

- **RBAC:** Papel define capacidades (visualizar, criar, editar, finalizar, assinar, cancelar, exportar, administrar)
- **ABAC:** Regras por tenant, estabelecimento, local, equipe, profissional responsável, paciente relacionado, sensibilidade, estado do registro
- **Segregação de funções:** Quem cadastra não aprova; quem lança não concilia; quem prepara lote não transmite
- **Break-glass:** Acesso emergencial com motivo obrigatório, alerta e revisão posterior
- **Auditoria:** Login, MFA, falhas, consulta clínica, exportação, impressão, compartilhamento, alteração, invalidação, cancelamento, integração, administração

---

## 7. Segurança e Governança

- TLS em trânsito, criptografia em repouso, chaves gerenciadas e rotação
- MFA para administradores e ações sensíveis
- Segredos em cofre (variáveis de ambiente), nunca em banco/logs
- WAF, rate limit, proteção CSRF/XSS/SQLi, headers seguros
- Auditoria protegida contra alteração, retenção definida
- DLP e política de exportação para dados clínicos/financeiros
- Backup automático criptografado, cópia imutável, testes de restore, RPO/RTO definido
- LGPD: consentimento, opt-out, preferências por canal, supressão de contatos

---

## 8. Integração com Supabase

- Banco relacional PostgreSQL hospedado no Supabase
- Drizzle ORM como camada de mapeamento (mantendo compatibilidade com schema existente)
- Row Level Security (RLS) para isolamento por tenant
- Autenticação via Supabase Auth (paralelamente ao OAuth existente durante transição)
- Realtime para notificações de agenda e mensagens
- Storage para anexos de prontuário e documentos

---

## 9. Integração com Google Calendar API

- Sincronização bidirecional de agendamentos OllCLin ↔ Google Calendar
- OAuth2 do Google para autenticação de profissionais
- Webhooks do Google Calendar para atualizações em tempo real
- Idempotency key para evitar duplicações em reenvio
- Mapeamento de cores do OllCLin para cores do Google Calendar
- Tratamento de fusos horários (Brasília UTC-03 como padrão)

---

## 10. Critérios de Aceite do MVP

1. Administrador cria clínica, configura papéis e convida usuários sem conceder acesso além do escopo
2. Usuário autorizado cadastra paciente, agenda procedimento, sistema impede conflito de profissional/sala
3. Recepção altera status de agendamento conforme transições permitidas, cada mudança auditada
4. Profissional registra, finaliza e assina ficha; alteração posterior apenas por adendo/invalidação autorizada
5. Usuário sem permissão não consegue abrir prontuário, exportar relatório ou ver financeiro (inclusive manipulando URL/API)
6. Paciente duplicado é sinalizado; unificação exige confirmação prévia e auditoria
7. Mensagem respeita opt-out e não expõe diagnóstico ou conteúdo clínico
8. Backup restaurado em ambiente de teste dentro do RTO definido, com verificação de integridade
9. Logs não contêm senha, token, certificado ou conteúdo clínico desnecessário
10. Operação permanece consistente após retry, timeout e refresh; nenhuma criação duplica por reenvio

---

## 11. Riscos e Decisões em Aberto

### Riscos principais
- Acesso excessivo a prontuário, financeiro, certificados, XML e exportações
- Modelo de tenant inadequado ou mistura de dados entre clínicas
- Exclusões destrutivas e edição silenciosa de documentos clínicos/financeiros
- Integrações sem idempotência, retry, reconciliação ou revogação de credenciais
- TISS implementado sem versão/homologação e tratamento de glosa
- Backup sem restore testado, RPO/RTO ou cadeia de custódia
- Marketing sem consentimento e telessaúde sem segurança de links/convidados
- Dependência de rede e navegador sem modo de falha ou preservação de rascunho

### Decisões a tomar
1. Escopo inicial: clínica única, grupo multiunidade ou SaaS multi-tenant?
2. Quais papéis existem e quais ações exigem dupla aprovação?
3. O prontuário será assinado digitalmente? Qual padrão?
4. Quais campos clínicos são estruturados no MVP vs texto/modelo?
5. Financeiro é caixa, competência ou ambos?
6. Qual versão TISS e estratégia de homologação?
7. Quais integrações entram primeiro?
8. Quais canais de comunicação e consentimentos?
9. Qual RPO/RTO, retenção, região e política de restore?
10. Haverá portal/app do paciente?

---

## 12. Próximos Passos Imediatos

1. ✅ Configurar git e conectar ao repositório GitHub (OllCLin)
2. ✅ Definir paleta de cores e design system no Tailwind
3. 🔄 Migrar schema do MySQL para PostgreSQL (Supabase)
4. 🔄 Implementar arquitetura MVC completa
5. 🔄 Implementar módulo de Agenda com sincronização Google Calendar
6. 🔄 Implementar autenticação com Supabase Auth
7. 🔄 Implementar módulo de Pacientes (MVP)
8. 🔄 Implementar Prontuário mínimo (MVP)
9. Configurar variáveis de ambiente (.env.example)
10. Criar documentação de API e guia de contribuição
