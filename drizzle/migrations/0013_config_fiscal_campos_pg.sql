-- Migration 0013 (Postgres/Supabase) — Campos da configuração fiscal (Etapa 1).
-- Espelho de 0013_config_fiscal_campos.sql; o banco de produção do OllCLin é Postgres.

ALTER TABLE configuracoes_fiscais
  ADD COLUMN opcao_simples_nacional BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN codigo_tributacao_servico VARCHAR(10) NULL,
  ADD COLUMN descricao_servico_padrao VARCHAR(255) NULL,
  ADD COLUMN iss_retido BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN modo_certificado TEXT NOT NULL DEFAULT 'A1_SERVIDOR';

-- DOWN (reversível):
-- ALTER TABLE configuracoes_fiscais
--   DROP COLUMN modo_certificado,
--   DROP COLUMN iss_retido,
--   DROP COLUMN descricao_servico_padrao,
--   DROP COLUMN codigo_tributacao_servico,
--   DROP COLUMN opcao_simples_nacional;
