-- Migration 0012 — Módulo fiscal (FISCAL.md §6) — PostgreSQL/Supabase
-- Tabelas isoladas do domínio clínico. Todo registro fiscal tem organization_id (R01).
-- Inclui RLS (R03) — policy por organization_id via JWT do Supabase.
-- O restante do esquema clínico legado não é tocado.

-- 1. Empresas fiscais (emitente, 1:1 com organizations)
CREATE TABLE IF NOT EXISTS empresas_fiscais (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL UNIQUE,
  cnpj VARCHAR(18) NOT NULL UNIQUE,
  razao_social VARCHAR(255) NOT NULL,
  nome_fantasia VARCHAR(255),
  ie VARCHAR(20),
  im VARCHAR(20),
  regime_tributario VARCHAR(50) NOT NULL,
  cnae_principal VARCHAR(7),
  endereco_completo JSONB,
  municipio_ibge VARCHAR(7) NOT NULL,
  uf VARCHAR(2) NOT NULL,
  email_fiscal VARCHAR(320) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ef_org_idx ON empresas_fiscais (organization_id);

-- 2. Tomadores fiscais (reutilizáveis entre agendamentos — §11)
CREATE TABLE IF NOT EXISTS tomadores_fiscais (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL,
  tipo_pessoa VARCHAR(10) NOT NULL CHECK (tipo_pessoa IN ('FISICA','JURIDICA')),
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
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT tf_org_doc_uk UNIQUE (organization_id, cpf_cnpj)
);

-- 3. Certificados (metadados — NUNCA o segredo, R07)
CREATE TABLE IF NOT EXISTS certificados (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL,
  tipo VARCHAR(13) NOT NULL CHECK (tipo IN ('A1','A3','TOKEN_GATEWAY')),
  titular_cnpj VARCHAR(18) NOT NULL,
  thumbprint VARCHAR(128),
  valido_de TIMESTAMP,
  valido_ate TIMESTAMP NOT NULL,
  segredo_ref VARCHAR(64) NOT NULL,
  provedor VARCHAR(50),
  ambiente VARCHAR(12) NOT NULL CHECK (ambiente IN ('HOMOLOGACAO','PRODUCAO')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  revogado_em TIMESTAMP,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cert_org_idx ON certificados (organization_id);
CREATE INDEX IF NOT EXISTS cert_validade_idx ON certificados (valido_ate);

-- 4. Cofre fiscal (ciphertexts AES-256-GCM — R05)
CREATE TABLE IF NOT EXISTS cofre_fiscal (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL,
  ciphertext TEXT NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  revogado_em TIMESTAMP
);

-- 5. Configurações fiscais
CREATE TABLE IF NOT EXISTS configuracoes_fiscais (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL,
  tipo_documento VARCHAR(5) NOT NULL CHECK (tipo_documento IN ('NFS_E','NF_E','NFC_E')),
  ambiente VARCHAR(12) NOT NULL CHECK (ambiente IN ('HOMOLOGACAO','PRODUCAO')),
  provedor VARCHAR(50) NOT NULL,
  serie VARCHAR(10) NOT NULL,
  proximo_numero BIGINT NOT NULL,
  codigo_municipio VARCHAR(7) NOT NULL,
  item_lista_servico VARCHAR(10) NOT NULL,
  aliquota_iss_padrao NUMERIC(5,2) NOT NULL,
  regime_especial_tributacao INT,
  permite_emissao_retroativa BOOLEAN NOT NULL DEFAULT FALSE,
  dias_limite_retroativo INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT cf_org_doc_uk UNIQUE (organization_id, tipo_documento, ambiente, serie)
);

-- 6. Numeração fiscal (reserva atômica SELECT ... FOR UPDATE)
CREATE TABLE IF NOT EXISTS numeracao_fiscal (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL,
  tipo_documento VARCHAR(5) NOT NULL CHECK (tipo_documento IN ('NFS_E','NF_E','NFC_E')),
  ambiente VARCHAR(12) NOT NULL CHECK (ambiente IN ('HOMOLOGACAO','PRODUCAO')),
  serie VARCHAR(10) NOT NULL,
  ultimo_numero BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT nf_org_doc_uk UNIQUE (organization_id, tipo_documento, ambiente, serie)
);

-- 7. Notas fiscais (documento legal — XML autorizado imutável, R26/R28)
CREATE TABLE IF NOT EXISTS notas_fiscais (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL,
  tipo_documento VARCHAR(5) NOT NULL CHECK (tipo_documento IN ('NFS_E','NF_E','NFC_E')),
  ambiente VARCHAR(12) NOT NULL CHECK (ambiente IN ('HOMOLOGACAO','PRODUCAO')),
  serie VARCHAR(10) NOT NULL,
  numero BIGINT NOT NULL,
  chave_acesso VARCHAR(44), -- rejeitada sem protocolo não tem chave (§6)
  status VARCHAR(16) NOT NULL CHECK (status IN ('RASCUNHO','VALIDADA','ENFILEIRADA','ENVIANDO',
    'AUTORIZADA','REJEITADA','ERRO_TRANSITORIO','DENEGADA','CANCELADA','SUBSTITUIDA','EM_CONTINGENCIA')),
  agendamento_id INT NOT NULL,
  nota_substituida_id INT,

  -- snapshot do tomador (V3)
  tomador_tipo_pessoa VARCHAR(10) NOT NULL CHECK (tomador_tipo_pessoa IN ('FISICA','JURIDICA')),
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
  valor_servicos NUMERIC(12,2) NOT NULL,
  valor_iss NUMERIC(12,2) NOT NULL,
  valor_total NUMERIC(12,2) NOT NULL,
  aliquota_iss NUMERIC(5,2) NOT NULL,

  -- resultado
  xml_enviado TEXT,
  xml_autorizado TEXT,
  protocolo VARCHAR(64),
  c_stat VARCHAR(10),
  x_motivo VARCHAR(500),
  hash_xml VARCHAR(64),
  tentativas INT NOT NULL DEFAULT 0,
  criado_por INT,
  enfileirado_em TIMESTAMP,
  enviado_em TIMESTAMP,
  autorizado_em TIMESTAMP,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),

  -- UNIQUE da chave natural + idempotência (§7)
  CONSTRAINT nota_chave_natural_uk UNIQUE (organization_id, tipo_documento, ambiente, serie, numero)
);
CREATE INDEX IF NOT EXISTS nota_org_idx ON notas_fiscais (organization_id);
CREATE INDEX IF NOT EXISTS nota_status_idx ON notas_fiscais (status);
CREATE INDEX IF NOT EXISTS nota_agendamento_idx ON notas_fiscais (agendamento_id);
CREATE UNIQUE INDEX IF NOT EXISTS nota_chave_acesso_uk ON notas_fiscais (chave_acesso) WHERE chave_acesso IS NOT NULL;

-- UNIQUE parcial "uma nota ativa por agendamento" (V4) — Postgres suporta!
CREATE UNIQUE INDEX IF NOT EXISTS nota_ativa_por_agendamento_uk
  ON notas_fiscais (agendamento_id)
  WHERE status IN ('RASCUNHO','VALIDADA','ENFILEIRADA','ENVIANDO','AUTORIZADA',
                   'REJEITADA','ERRO_TRANSITORIO','DENEGADA','EM_CONTINGENCIA');

-- 8. Eventos fiscais
CREATE TABLE IF NOT EXISTS eventos_fiscais (
  id SERIAL PRIMARY KEY,
  nota_id INT NOT NULL,
  organization_id INT NOT NULL,
  tipo VARCHAR(13) NOT NULL CHECK (tipo IN ('CANCELAMENTO','CCE','SUBSTITUICAO','MANIFESTACAO','INUTILIZACAO')),
  sequencia INT NOT NULL,
  motivo VARCHAR(255) NOT NULL,
  xml_evento TEXT,
  protocolo VARCHAR(64),
  status VARCHAR(50) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ev_nota_idx ON eventos_fiscais (nota_id);
CREATE INDEX IF NOT EXISTS ev_org_idx ON eventos_fiscais (organization_id);

-- 9. Logs fiscais (12 meses, LGPD — CPF/CNPJ mascarado)
CREATE TABLE IF NOT EXISTS logs_fiscais (
  id SERIAL PRIMARY KEY,
  organization_id INT NOT NULL,
  nota_id INT,
  adapter VARCHAR(50) NOT NULL,
  operacao VARCHAR(50) NOT NULL,
  request_resumo VARCHAR(500),
  response_resumo VARCHAR(500),
  c_stat VARCHAR(10),
  duracao_ms INT,
  erro VARCHAR(500),
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lf_org_idx ON logs_fiscais (organization_id);
CREATE INDEX IF NOT EXISTS lf_nota_idx ON logs_fiscais (nota_id);

-- 10. Fila fiscal (tabela — pendência 3: Redis não confirmado)
CREATE TABLE IF NOT EXISTS fila_fiscal (
  id SERIAL PRIMARY KEY,
  destino VARCHAR(100) NOT NULL,
  nota_id INT NOT NULL,
  organization_id INT NOT NULL,
  operacao VARCHAR(9) NOT NULL CHECK (operacao IN ('EMITIR','CONSULTAR','EVENTO')),
  tentativas INT NOT NULL DEFAULT 0,
  disponivel_em TIMESTAMP NOT NULL DEFAULT NOW(),
  processado_em TIMESTAMP,
  erro VARCHAR(500),
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ff_destino_idx ON fila_fiscal (destino, disponivel_em);
CREATE INDEX IF NOT EXISTS ff_nota_idx ON fila_fiscal (nota_id);

-- ---------------------------------------------------------------------------
-- R03 — Row Level Security em TODAS as tabelas fiscais.
-- O backend usa service_role (bypass); os clients autenticados são limitados
-- pela policy por JWT. Helper fiscalQuery (R02) continua como segunda barreira.
-- ---------------------------------------------------------------------------
ALTER TABLE empresas_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE tomadores_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificados ENABLE ROW LEVEL SECURITY;
ALTER TABLE cofre_fiscal ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE numeracao_fiscal ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE fila_fiscal ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['empresas_fiscais','tomadores_fiscais','certificados','cofre_fiscal',
    'configuracoes_fiscais','numeracao_fiscal','notas_fiscais','eventos_fiscais','logs_fiscais','fila_fiscal']
  LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS fiscal_tenant_policy ON %I;
      CREATE POLICY fiscal_tenant_policy ON %I
        USING (organization_id = NULLIF(current_setting('request.jwt.claims', true)::json->>'organization_id', '')::int)
        WITH CHECK (organization_id = NULLIF(current_setting('request.jwt.claims', true)::json->>'organization_id', '')::int)
    $f$, t, t);
  END LOOP;
END $$;

-- Comentário de guarda legal (R30): notas_fiscais nunca é deletada por limpeza.
COMMENT ON TABLE notas_fiscais IS 'Documento fiscal legal. Guarda mínima 5 anos (R30). NUNCA deletar por limpeza.';
