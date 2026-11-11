-- Migration 0013 — Campos da configuração fiscal do Consultório Mágico (Etapa 1).
-- Complementa configuracoes_fiscais com os campos editáveis pelo administrador:
-- Simples Nacional, código de tributação do serviço, descrição padrão,
-- retenção de ISS e modo de certificado (A1 servidor / assinatura local / manual DF).
-- Nada aqui fixa valores no código: Brasília (5300108), "Consulta médica" e alíquota
-- entram como SUGESTÃO na tela de configuração, nunca como constante de emissão.

ALTER TABLE configuracoes_fiscais
  ADD COLUMN opcao_simples_nacional BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN codigo_tributacao_servico VARCHAR(10) NULL,
  ADD COLUMN descricao_servico_padrao VARCHAR(255) NULL,
  ADD COLUMN iss_retido BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN modo_certificado ENUM('A1_SERVIDOR','ASSINATURA_LOCAL','MANUAL_DF')
    NOT NULL DEFAULT 'A1_SERVIDOR';

-- DOWN (reversível):
-- ALTER TABLE configuracoes_fiscais
--   DROP COLUMN modo_certificado,
--   DROP COLUMN iss_retido,
--   DROP COLUMN descricao_servico_padrao,
--   DROP COLUMN codigo_tributacao_servico,
--   DROP COLUMN opcao_simples_nacional;
