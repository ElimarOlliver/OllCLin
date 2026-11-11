# Integração fiscal real do OllCLin

## Decisão principal

A emissão deverá ser implementada por meio de um adaptador de provedor fiscal, sem acoplar o domínio do OllCLin a Focus NFe, eNotas ou a uma prefeitura específica. A NFS-e municipal não possui um leiaute único nacional em vigor para todos os municípios; cada prefeitura define webservice, regras e campos. A Focus documenta dois caminhos: NFS-e municipal (`/v2/nfse`) e NFS-e Nacional (`/v2/nfsen`). O endpoint correto depende do município e do regime da empresa.

A partir de 1º de setembro de 2026, empresas optantes pelo Simples Nacional devem emitir NFS-e pelo Emissor Nacional, por portal ou por ERP integrado à API da Sefin Nacional, conforme a Resolução nº 189/2026 divulgada pelo governo.

## Arquitetura recomendada

1. **Domínio fiscal do OllCLin**
   - prepara o snapshot da consulta;
   - valida paciente, tomador, serviço, valor e configuração fiscal;
   - cria uma referência idempotente, por exemplo `ollclin-org17-appointment123-v1`;
   - grava a nota como `ENFILEIRADA`;
   - nunca expõe credenciais ao frontend.

2. **Interface de adaptador**

```ts
interface FiscalProvider {
  registerIssuer(input: IssuerInput): Promise<IssuerResult>;
  emit(input: IssueInvoiceInput): Promise<AcceptedInvoice>;
  getStatus(ref: string): Promise<ProviderStatus>;
  cancel(ref: string, reason: string): Promise<CancelResult>;
  resendEmail(ref: string, emails: string[]): Promise<void>;
  download(ref: string, format: "xml" | "pdf"): Promise<Buffer>;
}
```

Implementações iniciais:

- `FocusNfeAdapter`;
- `ENotasAdapter`;
- `GatewayMockAdapter`, somente para testes automatizados.

3. **Fila assíncrona**
   - `ENFILEIRADA → ENVIANDO → AUTORIZADA/REJEITADA`;
   - retentativas somente para erros transitórios;
   - backoff e limite de tentativas;
   - consulta periódica quando o provedor não enviar webhook;
   - chave idempotente para impedir duplicidade por clique duplo, timeout ou retry.

4. **Webhook**
   - endpoint autenticado, com assinatura ou segredo do provedor;
   - validação de origem e payload;
   - deduplicação por `providerEventId`;
   - atualização da nota somente dentro do `organizationId` correto;
   - armazenamento do payload bruto redigido para auditoria, sem credenciais.

5. **Isolamento por estabelecimento**
   Cada organização possuirá seu próprio emissor fiscal, `providerCompanyId`, ambiente, certificado/token, série e configuração municipal. A referência da nota e todas as consultas devem incluir o `organizationId` do OllCLin. Uma clínica jamais poderá consultar ou baixar documentos de outra.

## Fluxo de integração

### Configuração inicial do estabelecimento

A tela deve coletar e validar:

- CNPJ;
- razão social e nome fantasia;
- inscrição municipal;
- inscrição estadual, quando aplicável;
- município e UF, preferencialmente também código IBGE;
- endereço fiscal completo;
- regime tributário e opção pelo Simples Nacional;
- regime especial de tributação, quando aplicável;
- código municipal do serviço;
- descrição municipal do serviço;
- item da lista LC 116;
- CNAE;
- alíquota de ISS;
- ISS retido na fonte;
- certificado digital ou credencial exigida pelo provedor;
- ambiente de homologação ou produção.

No eNotas, a empresa emissora precisa ser cadastrada e pode passar por homologação municipal antes de ser liberada. O fluxo documentado é cadastrar a empresa, emitir a nota, aguardar webhook ou consultar o status, e então baixar PDF/XML ou cancelar.

### Emissão por consulta

1. Consulta é marcada como `atendido`.
2. O OllCLin localiza o paciente por CPF/CNPJ dentro da organização.
3. O tomador e o atendimento são exibidos para revisão.
4. Valor, forma de pagamento e parcelas são confirmados explicitamente.
5. O backend cria o snapshot imutável.
6. O adaptador envia para o provedor com `idExterno`/`ref` idempotente.
7. A nota fica em processamento assíncrono.
8. Webhook ou polling atualiza o status.
9. Quando autorizada, XML, PDF, número, protocolo, código de verificação e chave ficam associados à consulta.

## Campos mínimos para o payload

### Prestador/emissor

- CNPJ;
- razão social;
- inscrição municipal;
- endereço, cidade, UF e CEP;
- regime tributário/Simples;
- código municipal do serviço;
- item LC 116 e/ou CNAE;
- alíquota de ISS;
- indicação de ISS retido;
- série e numeração, quando o município/provedor exigirem;
- certificado ou credencial válida.

### Tomador

- tipo de pessoa: física ou jurídica;
- CPF/CNPJ, quando exigido ou informado;
- nome/razão social;
- e-mail, se a clínica enviar a nota;
- endereço: cidade, UF, logradouro, número, bairro e CEP quando exigido pelo município;
- inscrição municipal/estadual quando aplicável.

O tomador pode ser opcional em alguns municípios, mas o sistema deve tratá-lo como obrigatório por padrão para consultas, permitindo exceção apenas por regra documentada do município.

### Serviço

- descrição da consulta/procedimento;
- valor total;
- data de competência/emissão;
- código de serviço municipal;
- descrição municipal;
- item LC 116;
- CNAE;
- município e UF da prestação, quando diferente do estabelecimento;
- alíquota de ISS;
- ISS retido;
- retenções federais, quando aplicáveis: PIS, COFINS, INSS, IR e CSLL;
- descontos/deduções, se aceitos pelo município;
- número do atendimento como identificador interno, não como substituto do código fiscal.

Forma de pagamento e parcelas devem permanecer no registro financeiro do OllCLin. Só devem ser enviados ao provedor se o leiaute municipal ou nacional exigir esse grupo; não se deve presumir que esses campos alterem o cálculo do ISS.

## NFS-e municipal versus nacional

### Focus NFe municipal

A Focus documenta `POST /v2/nfse?ref=...`, consulta por `GET /v2/nfse/{referencia}` e cancelamento por `DELETE /v2/nfse/{referencia}`. A emissão retorna aceitação para processamento, não autorização imediata. O cancelamento exige justificativa de 15 a 255 caracteres, mas algumas prefeituras não permitem cancelamento via webservice.

### Focus NFe Nacional

O padrão nacional usa DPS. A Focus documenta `POST /v2/nfsen?ref=...`; entre os campos principais estão data de emissão, número e série da DPS, código do município emissor, CNPJ do prestador, código de tributação nacional do ISS, descrição do serviço e valor do serviço.

### eNotas

eNotas usa API REST com API Key, recomendando HTTP Basic Auth com a chave como usuário e senha vazia. O fluxo documentado cadastra a empresa emissora, emite em `POST /v1/empresas/{empresaId}/nfes`, consulta por `nfeId` ou `idExterno`, recebe webhooks de mudança de status e permite baixar PDF/XML. Os estados documentados incluem aguardando autorização, em processo, autorizada, negada, em cancelamento, cancelada e cancelamento negado.

## Validações antes de chamar o provedor

O OllCLin deve bloquear a chamada se:

- o atendimento não estiver concluído;
- o valor for nulo ou zero;
- o profissional não tiver CRM/conselho quando exigido;
- não existir configuração fiscal ativa da organização;
- CNPJ, inscrição municipal ou município estiverem ausentes;
- código municipal/LC 116/CNAE não estiver definido;
- alíquota estiver fora da regra configurada;
- CPF/CNPJ estiver inválido quando informado;
- campos obrigatórios do tomador estiverem ausentes;
- certificado/token estiver expirado ou não liberado;
- a empresa emissora ainda não estiver homologada/liberada;
- a consulta já possuir nota ativa e não houver reemissão explícita.

A pré-validação do provedor continua necessária. A Focus informa que primeiro valida campos essenciais, formatos e cadastro do prestador de forma síncrona, e só depois processa a autorização de forma assíncrona.

## Dados fiscais que devem ser persistidos

Na tabela fiscal, manter:

- `provider`;
- `providerCompanyId`;
- `externalReference`;
- `providerInvoiceId`;
- `status` interno e status original do provedor;
- `motivoStatus`/mensagem de rejeição;
- número, série, protocolo, código de verificação e chave de acesso;
- URLs ou referências protegidas para PDF/XML;
- payload enviado redigido;
- resposta recebida redigida;
- timestamps de envio, autorização e cancelamento;
- `organizationId`, `appointmentId` e usuário que confirmou o snapshot.

## Estratégia de implantação

1. Escolher o município real do Consultório Mágico e confirmar se usará NFS-e municipal ou nacional.
2. Comparar Focus NFe e eNotas com base em cobertura do município, certificado, cancelamento, custo, webhooks e suporte.
3. Implementar a interface `FiscalProvider` mantendo o mock para testes.
4. Criar configuração por organização e guardar segredos apenas no backend/cofre.
5. Implementar homologação com uma nota de teste, consulta, rejeição, autorização, cancelamento e webhook duplicado.
6. Liberar produção somente após validar empresa emissora, código do serviço, alíquota, certificado e política da prefeitura.
7. Monitorar fila, rejeições, latência, retries e divergência entre nota autorizada e receita.

A integração não deve ser considerada pronta apenas porque o provedor aceitou o POST. Pronta significa: nota autorizada pela prefeitura/SEFIN, documento recuperável e status refletido no atendimento correto.

## Fontes

- [1] https://doc.focusnfe.com.br/docs/nfse-operacoes-disponiveis-na-api — Operações NFS-e municipal e nacional, processamento assíncrono e campos principais.
- [2] https://portal.enotasgw.com.br/knowledge-base/empresa-nota-fiscal-eletronica/ — Fluxo de empresa emissora, emissão, consulta, status e campos eNotas.
- [3] https://portal.enotasgw.com.br/knowledge-base/introducao/ — Autenticação, webhooks, versionamento e códigos HTTP da eNotas.
- [4] https://www.gov.br/nfse/pt-br/noticias/nfs-e-e-simples-nacional-obrigatoriedade-de-emissao-atraves-do-emissor-nacional — Obrigatoriedade do Emissor Nacional para optantes do Simples a partir de 01/09/2026.
- [5] https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao — Referência oficial do governo para APIs em produção e produção restrita.
