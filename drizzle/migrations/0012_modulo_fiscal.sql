-- Migration 0012 — Módulo fiscal (FISCAL.md §6)
-- Tabelas isoladas do domínio clínico. Todo registro fiscal tem organization_id (R01).
-- MySQL não tem RLS do Postgres: o isolamento é garantido pelo helper fiscalQuery()
-- (R02) + verificação de escopo no router tRPC. Constraints de app-level abaixo.

-- 1. Empresas fiscais (emitente, 1:1 com organizations)
CREATE TABLE IF NOT EXISTS empresas_fiscais (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL UNIQUE,
  cnpj VARCHAR(18) NOT NULL UNIQUE,
  razao_social VARCHAR(255) NOT NULL,
  nome_fantasia VARCHAR(255),
  ie VARCHAR(20),
  im VARCHAR(20),
  regime_tributario VARCHAR(50) NOT NULL,
  cnae_principal VARCHAR(7),
  endereco_completo JSON,
  municipio_ibge VARCHAR(7) NOT NULL,
  uf VARCHAR(2) NOT NULL,
  email_fiscal VARCHAR(320) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX ef_org_idx (organization_id),
  CONSTRAINT fk_ef_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Tomadores fiscais (reutilizáveis entre agendamentos — §11)
CREATE TABLE IF NOT EXISTS tomadores_fiscais (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  tipo_pessoa ENUM('FISICA','JURIDICA') NOT NULL,
  cpf_cnpj VARCHAR(18) NOT NULL,
  nome_para_nota VARCHAR(255) NOT NULL,
  email VARCHAR(320),
  celular VARCHAR(20),
  logradouro VARCHAR(255),
  numero VARCHAR(20),
  complemento VARCHAR(255),
  bairro VARCHAR(100),
  cidade VARCHAR(100),
  uf VARCHAR(2),
  cep VARCHAR(9),
  codigo_ibge VARCHAR(7),
  inscricao_estadual VARCHAR(20),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY tf_org_doc_idx (organization_id, cpf_cnpj),
  CONSTRAINT fk_tf_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Certificados (metadados — NUNCA o segredo, R07)
CREATE TABLE IF NOT EXISTS certificados (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  tipo ENUM('A1','A3','TOKEN_GATEWAY') NOT NULL,
  titular_cnpj VARCHAR(18) NOT NULL,
  thumbprint VARCHAR(128),
  valido_de TIMESTAMP NULL,
  valido_ate TIMESTAMP NOT NULL,
  segredo_ref VARCHAR(64) NOT NULL,
  provedor VARCHAR(50),
  ambiente ENUM('HOMOLOGACAO','PRODUCAO') NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  revogado_em TIMESTAMP NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX cert_org_idx (organization_id),
  INDEX cert_validade_idx (valido_ate),
  CONSTRAINT fk_cert_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Cofre fiscal (ciphertexts AES-256-GCM — R05)
CREATE TABLE IF NOT EXISTS cofre_fiscal (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  ciphertext TEXT NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revogado_em TIMESTAMP NULL,
  INDEX cofre_org_idx (organization_id),
  CONSTRAINT fk_cofre_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Configurações fiscais
CREATE TABLE IF NOT EXISTS configuracoes_fiscais (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  tipo_documento ENUM('NFS_E','NF_E','NFC_E') NOT NULL,
  ambiente ENUM('HOMOLOGACAO','PRODUCAO') NOT NULL,
  provedor VARCHAR(50) NOT NULL,
  serie VARCHAR(10) NOT NULL,
  proximo_numero BIGINT NOT NULL,
  codigo_municipio VARCHAR(7) NOT NULL,
  item_lista_servico VARCHAR(10) NOT NULL,
  aliquota_iss_padrao DECIMAL(5,2) NOT NULL,
  regime_especial_tributacao INT,
  permite_emissao_retroativa BOOLEAN NOT NULL DEFAULT FALSE,
  dias_limite_retroativo INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY cf_org_doc_idx (organization_id, tipo_documento, ambiente, serie),
  CONSTRAINT fk_cf_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Numeração fiscal (reserva atômica SELECT ... FOR UPDATE)
CREATE TABLE IF NOT EXISTS numeracao_fiscal (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  tipo_documento ENUM('NFS_E','NF_E','NFC_E') NOT NULL,
  ambiente ENUM('HOMOLOGACAO','PRODUCAO') NOT NULL,
  serie VARCHAR(10) NOT NULL,
  ultimo_numero BIGINT NOT NULL DEFAULT 0,
  UNIQUE KEY nf_org_doc_idx (organization_id, tipo_documento, ambiente, serie),
  CONSTRAINT fk_nf_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Notas fiscais (documento legal — XML autorizado imutável, R26/R28)
CREATE TABLE IF NOT EXISTS notas_fiscais (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  tipo_documento ENUM('NFS_E','NF_E','NFC_E') NOT NULL,
  ambiente ENUM('HOMOLOGACAO','PRODUCAO') NOT NULL,
  serie VARCHAR(10) NOT NULL,
  numero BIGINT NOT NULL,
  chave_acesso VARCHAR(44) NULL, -- rejeitada sem protocolo não tem chave (§6)
  status ENUM('RASCUNHO','VALIDADA','ENFILEIRADA','ENVIANDO','AUTORIZADA','REJEITADA',
              'ERRO_TRANSITORIO','DENEGADA','CANCELADA','SUBSTITUIDA','EM_CONTINGENCIA') NOT NULL,
  agendamento_id INT NOT NULL,
  nota_substituida_id INT NULL,

  -- snapshot do tomador (V3)
  tomador_tipo_pessoa ENUM('FISICA','JURIDICA') NOT NULL,
  tomador_nome VARCHAR(255) NOT NULL,
  tomador_cpf_cnpj VARCHAR(18) NOT NULL,
  tomador_email VARCHAR(320),
  tomador_celular VARCHAR(20),
  tomador_logradouro VARCHAR(255),
  tomador_numero VARCHAR(20),
  tomador_complemento VARCHAR(255),
  tomador_bairro VARCHAR(100),
  tomador_cidade VARCHAR(100),
  tomador_uf VARCHAR(2),
  tomador_cep VARCHAR(9),

  -- snapshot do serviço e do profissional (V3)
  nome_medico VARCHAR(255),
  crm_medico VARCHAR(50),
  uf_crm VARCHAR(2),
  tipo_conselho VARCHAR(50),
  codigo_servico VARCHAR(10) NOT NULL,
  descricao_servico TEXT NOT NULL,
  data_competencia TIMESTAMP NOT NULL,

  -- valores (snapshot no momento da gravação ENFILEIRADA)
  valor_servicos DECIMAL(12,2) NOT NULL,
  valor_iss DECIMAL(12,2) NOT NULL,
  valor_total DECIMAL(12,2) NOT NULL,
  aliquota_iss DECIMAL(5,2) NOT NULL,

  -- resultado
  xml_enviado TEXT,
  xml_autorizado TEXT,
  protocolo VARCHAR(64),
  c_stat VARCHAR(10),
  x_motivo VARCHAR(500),
  hash_xml VARCHAR(64),
  tentativas INT NOT NULL DEFAULT 0,
  criado_por INT,
  enfileirado_em TIMESTAMP NULL,
  enviado_em TIMESTAMP NULL,
  autorizado_em TIMESTAMP NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- UNIQUE da chave natural + idempotência (§7)
  UNIQUE KEY nota_chave_natural_idx (organization_id, tipo_documento, ambiente, serie, numero),
  INDEX nota_org_idx (organization_id),
  INDEX nota_status_idx (status),
  INDEX nota_agendamento_idx (agendamento_id),
  INDEX nota_chave_acesso_idx (chave_acesso),
  CONSTRAINT fk_nota_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- UNIQUE parcial "uma nota ativa por agendamento" (V4): MySQL não tem índice
-- parcial, então aplica-se via constraint de aplicação no service
-- (server/fiscal/nota.service.ts) — verificada dentro da transação com lock.

-- 8. Eventos fiscais
CREATE TABLE IF NOT EXISTS eventos_fiscais (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nota_id INT NOT NULL,
  organization_id INT NOT NULL,
  tipo ENUM('CANCELAMENTO','CCE','SUBSTITUICAO','MANIFESTACAO','INUTILIZACAO') NOT NULL,
  sequencia INT NOT NULL,
  motivo VARCHAR(255) NOT NULL,
  xml_evento TEXT,
  protocolo VARCHAR(64),
  status VARCHAR(50) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ev_nota_idx (nota_id),
  INDEX ev_org_idx (organization_id),
  CONSTRAINT fk_ev_nota FOREIGN KEY (nota_id) REFERENCES notas_fiscais(id) ON DELETE CASCADE,
  CONSTRAINT fk_ev_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. Logs fiscais (12 meses, LGPD — CPF/CNPJ mascarado)
CREATE TABLE IF NOT EXISTS logs_fiscais (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  nota_id INT NULL,
  adapter VARCHAR(50) NOT NULL,
  operacao VARCHAR(50) NOT NULL,
  request_resumo VARCHAR(500),
  response_resumo VARCHAR(500),
  c_stat VARCHAR(10),
  duracao_ms INT,
  erro VARCHAR(500),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX lf_org_idx (organization_id),
  INDEX lf_nota_idx (nota_id),
  CONSTRAINT fk_lf_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. Fila fiscal (tabela MySQL — pendência 3 do FISCAL.md: Redis não confirmado)
CREATE TABLE IF NOT EXISTS fila_fiscal (
  id INT AUTO_INCREMENT PRIMARY KEY,
  destino VARCHAR(100) NOT NULL,       -- fila:fiscal:nfse:{provedor}
  nota_id INT NOT NULL,
  organization_id INT NOT NULL,
  operacao ENUM('EMITIR','CONSULTAR','EVENTO') NOT NULL,
  tentativas INT NOT NULL DEFAULT 0,
  disponivel_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processado_em TIMESTAMP NULL,
  erro VARCHAR(500),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ff_destino_idx (destino, disponivel_em),
  INDEX ff_nota_idx (nota_id),
  CONSTRAINT fk_ff_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. Alterações em tabelas existentes (FISCAL.md §6)
ALTER TABLE appointments
  ADD COLUMN fiscal_tomador_id INT NULL,
  ADD COLUMN valor_consulta DECIMAL(12,2) NULL,
  ADD COLUMN valor_pago DECIMAL(12,2) NULL,
  ADD COLUMN forma_pagamento ENUM('PIX','DINHEIRO','CARTAO_CREDITO','CARTAO_DEBITO','CONVENIO','OUTRO') NULL,
  ADD COLUMN fiscal_status ENUM('NAO_EMITIDA','PENDENTE','EMITIDA','CANCELADA','ERRO')
    NOT NULL DEFAULT 'NAO_EMITIDA',
  ADD COLUMN fiscal_nota_id INT NULL,
  ADD COLUMN concluido_em TIMESTAMP NULL,
  ADD COLUMN fiscal_observacao TEXT NULL,
  ADD INDEX apt_fiscal_status_idx (fiscal_status);

ALTER TABLE professionals
  ADD COLUMN fiscal_uf_conselho VARCHAR(2) NULL,
  ADD COLUMN fiscal_tipo_conselho ENUM('CRM','CRO','CREFITO','OUTRO') NULL;
