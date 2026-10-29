# 🔒 Política de Segurança e LGPD — OllCLin

> **Sistema:** OllCLin — Sistema Clínico Acessível e Moderno  
> **Conformidade:** LGPD (Lei Geral de Proteção de Dados — Lei 13.709/2018)  
> **Repositório:** https://github.com/ElimarOlliver/OllCLin.git (público)

---

## 1. Nunca commitar credenciais no repositório público

Este repositório é **público**. Sob nenhuma circunstância devem ser commitados:

| Tipo de dado | Exemplo | Onde deve ficar |
|-------------|---------|-----------------|
| Chaves de API | `sb_secret_...`, `sk_live_...`, `AIza...` | `.env` (local) / CoFre de segredos (produção) |
| Senhas de banco | `DATABASE_URL` com usuário/senha | `.env` (local) / Variáveis de ambiente (produção) |
| Tokens OAuth | `client_secret`, `refresh_token` | `.env` (backend apenas) |
| Chaves JWT | `MANUS_JWT_SECRET` | `.env` (backend apenas) |
| Dados de pacientes | CPF, nome, telefone, prontuário | Nunca no repositório |

### Arquivos que NUNCA devem ser commitados (já estão no `.gitignore`):

```
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
*.log
*.db
*.sqlite
```

---

## 2. Separação Frontend × Backend

### ⚠️ Regras críticas (LGPD)

| Variável | Escopo | Pode ir no frontend? |
|----------|--------|---------------------|
| `VITE_SUPABASE_URL` | Frontend | ✅ Sim (URL pública) |
| `VITE_SUPABASE_ANON_KEY` | Frontend | ✅ Sim (chave pública anon) |
| `VITE_GOOGLE_CLIENT_ID` | Frontend | ✅ Sim (ID público OAuth) |
| `VITE_GOOGLE_API_KEY` | Frontend | ⚠️ Apenas se restrita por domínio |
| `SUPABASE_SECRET_KEY` | Backend | ❌ **NUNCA** (service role) |
| `GOOGLE_CLIENT_SECRET` | Backend | ❌ **NUNCA** (somente servidor) |
| `MANUS_JWT_SECRET` | Backend | ❌ **NUNCA** (assinatura de sessão) |
| `DATABASE_URL` | Backend | ❌ **NUNCA** (contém senha) |

### Por que o `client_secret` não pode estar no frontend?

O `client_secret` do Google OAuth permite trocar códigos de autorização por tokens de acesso. Se estiver exposto no JavaScript do navegador, qualquer pessoa pode:
- Obter tokens de acesso em nome da sua aplicação
- Acessar dados do Google Calendar da sua organização
- Comprometer a confidencialidade dos agendamentos de pacientes

**Correção aplicada:** A função `exchangeGoogleCodeForTokens` foi removida do frontend. A troca de código agora é feita exclusivamente pelo backend no endpoint `/api/google-calendar/callback`.

---

## 3. Proteção de Dados de Saúde (LGPD Art. 11)

Dados de saúde são **dados pessoais sensíveis** (Art. 11, LGPD). O OllCLin adota as seguintes medidas:

### 3.1. Consentimento informado
- O paciente deve fornecer consentimento explícito para tratamento de dados de saúde
- Campos `consentDataSharing` e `consentMarketing` no schema de pacientes
- Registro de consentimento com data e versão da política

### 3.2. Controle de acesso (RBAC + ABAC)
- Acesso baseado em papel (RBAC): administrador, profissional, recepcionista
- Acesso baseado em atributo (ABAC): tenant, estabelecimento, local, equipe
- Segregação de funções: quem cadastra não aprova; quem lança não concilia

### 3.3. Auditoria de acessos
Toda operação é registrada na tabela `audit_log`:
- Quem acessou (usuário)
- Quando (timestamp)
- O quê (entidade e ID)
- Como (ação: CREATE, UPDATE, DELETE, READ)
- De onde (IP, User-Agent)

### 3.4. Exclusão lógica (soft delete)
- Pacientes, agendamentos e prontuários não são excluídos fisicamente
- Campo `isActive = false` preserva o histórico para auditoria
- Dados podem ser recuperados se necessário

---

## 4. Checklist de Segurança antes de subir para produção

- [ ] `.env` não está commitado (verificar `.gitignore`)
- [ ] `SUPABASE_SECRET_KEY` está apenas no backend
- [ ] `GOOGLE_CLIENT_SECRET` está apenas no backend
- [ ] `MANUS_JWT_SECRET` está apenas no backend
- [ ] Banco de dados usa SSL/TLS (Supabase já fornece por padrão)
- [ ] Row Level Security (RLS) ativado no Supabase para isolamento por tenant
- [ ] Cookies de sessão com `HttpOnly`, `Secure`, `SameSite=Strict`
- [ ] Rate limiting em endpoints de autenticação
- [ ] Logs não contêm senhas, tokens ou dados clínicos sensíveis
- [ ] Backup automático criptografado
- [ ] Plano de resposta a incidentes (vazamento de dados)

---

## 5. O que fazer em caso de vazamento de dados

Se houver suspeita de vazamento de dados pessoais ou de saúde:

1. **Contenha o incidente** imediatamente (revogue chaves, desative acessos)
2. **Avalie o escopo** (quais dados, quantos pacientes, por quanto tempo)
3. **Notifique a ANPD** (Autoridade Nacional de Proteção de Dados) em até 2 dias úteis
4. **Comunique os titulares** (pacientes afetados) sobre o vazamento
5. **Documente tudo** no `audit_log` e em relatório interno
6. **Rotacione todas as credenciais** expostas (Supabase, Google, JWT, etc.)

---

## 6. Contato de segurança

Para reportar vulnerabilidades de segurança ou dúvidas sobre LGPD:

- **E-mail:** seguranca@ollclin.com (exemplo — configurar antes da produção)
- **Responsável:** Encarregado de Dados (DPO) da clínica

---

## 7. Referências legais

- **Lei 13.709/2018** — Lei Geral de Proteção de Dados (LGPD)
- **Art. 11** — Tratamento de dados pessoais sensíveis (saúde)
- **Art. 46** — Boas práticas e governança
- **Art. 48** — Comunicação de incidente de segurança

---

> ⚠️ **Aviso:** Este documento é uma política interna de segurança. Não substitui consulta jurídica especializada em LGPD e regulamentação de dados de saúde (ANVISA, CFM, etc.) antes de colocar o sistema em produção com dados reais de pacientes.
