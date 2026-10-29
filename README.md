# OllCLin

Sistema clínico acessível, moderno e seguro, construído com base na documentação do Ti.Clinic v2.0 e no Relatório de Estratégia OllCLin.

## 🏗️ Arquitetura

- **Arquitetura:** MVC (Model-View-Controller)
- **Frontend:** React 19 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Node.js + Express + tRPC v11
- **Banco de dados:** Supabase (PostgreSQL) via Drizzle ORM
- **Integração:** Google Calendar API (agendamentos)

## 🔒 Segurança e LGPD ⚠️

Este repositório é **público**. Leia atentamente antes de começar:

### 🚨 Nunca commitar credenciais

O arquivo `.env` **não deve ser commitado**. Ele já está no `.gitignore`.

| Variável | Escopo | Nunca exponha |
|----------|--------|---------------|
| `SUPABASE_SECRET_KEY` | Backend apenas | ❌ Nunca no frontend |
| `GOOGLE_CLIENT_SECRET` | Backend apenas | ❌ Nunca no frontend |
| `MANUS_JWT_SECRET` | Backend apenas | ❌ Nunca no frontend |
| `DATABASE_URL` | Backend apenas | ❌ Nunca no frontend |

Leia o documento completo: **[SEGURANCA_LGPD.md](./SEGURANCA_LGPD.md)**

---

## 🚀 Como rodar o projeto

### 1. Instalar dependências

```bash
pnpm install
# ou
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Preencha o `.env` com suas credenciais reais (Supabase, Google Calendar, etc.).

### 3. Rodar em desenvolvimento

```bash
pnpm dev
# ou
npm run dev
```

O servidor iniciará na porta 3000.

### 4. Build para produção

```bash
pnpm build
pnpm start
```

---

## 📋 Módulos implementados (MVP)

| Módulo | Status | Descrição |
|--------|--------|-----------|
| Pacientes | ✅ | Cadastro, busca, listagem |
| Agenda | ✅ | Visualização dia/semana, conflito de horário, Google Calendar |
| Profissionais | ✅ | Cadastro e listagem de profissionais de saúde |
| Procedimentos | ✅ | Catálogo de procedimentos com duração e preço |
| Autenticação | ✅ | Login, sessão, logout |
| Auditoria | ✅ | Log de todas as operações (CREATE, UPDATE, DELETE) |

---

## 📄 Documentação

- **[ESTRATEGIA_OLLCLIN.md](./ESTRATEGIA_OLLCLIN.md)** — Estratégia completa do produto
- **[SEGURANCA_LGPD.md](./SEGURANCA_LGPD.md)** — Política de segurança e LGPD

---

## 📄 Licença

MIT