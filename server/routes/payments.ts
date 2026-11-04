/**
 * OllCLin - Rotas HTTP para pagamentos (Fase 5 — SaaS).
 *
 * - GET  /api/payments/openapi.json : contrato OpenAPI 3.1 para integração
 *   futura com maquininhas de cartão (Stone, Cielo, PagSeguro, SumUp...).
 * - GET  /api/payments/docs         : página de documentação (Redoc-like simples).
 * - POST /api/payments/webhooks/:provider : webhook das adquirentes.
 */

import type { Express, Request, Response } from "express";
import { activePaymentProvider } from "../lib/payment-mock";
import { paymentModel } from "../models/payment.model";
import { writeAuditLog } from "../lib/audit";
import { provisionTenant, suspendTenantByGatewayRef } from "../lib/provisioning";
import * as provisioningModel from "../models/provisioning.model";

const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "OllCLin Payments API",
    version: "1.0.0",
    description:
      "API de pagamentos do OllCLin para integração com maquininhas de cartão e adquirentes. " +
      "Valores sempre em centavos (BRL). Autenticação via Bearer JWT do Supabase (service) ou " +
      "assinatura HMAC no webhook. Nenhum dado de cartão (PAN/CVV) transita ou é armazenado — " +
      "somente tokens da adquirente (PCI-DSS SAQ-A).",
    contact: { name: "OllCLin", email: "dev@ollclin.local" },
  },
  servers: [{ url: "{publicUrl}/api/payments", variables: { publicUrl: { default: "http://localhost:3000" } } }],
  paths: {
    "/v1/payments/intents": {
      post: {
        summary: "Cria intenção de pagamento",
        description: "Idempotente via header `Idempotency-Key`. Retorna o estado atual da intenção.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreatePaymentIntent" },
            },
          },
        },
        responses: {
          "201": { description: "Criada", content: { "application/json": { schema: { $ref: "#/components/schemas/PaymentIntent" } } } },
          "409": { description: "Idempotência: já existe (retorna a intenção original)" },
        },
      },
    },
    "/v1/payments/{id}": {
      get: {
        summary: "Consulta pagamento",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/PaymentIntent" } } } },
          "404": { description: "Não encontrado" },
        },
      },
    },
    "/v1/payments/{id}/cancel": {
      post: {
        summary: "Cancela pagamento autorizado (antes da captura)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Cancelado" } },
      },
    },
    "/v1/payments/{id}/refund": {
      post: {
        summary: "Estorna total ou parcialmente um pagamento capturado",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { amountCents: { type: "integer", minimum: 1, description: "Omitir = estorno total" } },
              },
            },
          },
        },
        responses: { "200": { description: "Estornado (total ou parcial)" } },
      },
    },
    "/v1/payments/{id}/transactions": {
      get: {
        summary: "Histórico de transições de estado",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/payments/webhooks/{provider}": {
      post: {
        summary: "Webhook de adquirente",
        description:
          "Validado por assinatura HMAC-SHA256 no header `x-signature`. " +
          "Deduplicado por `event_id`. Estados aceitos: authorized, captured, failed, cancelled, refunded.",
        parameters: [{ name: "provider", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "200": { description: "Recebido" }, "401": { description: "Assinatura inválida" } },
      },
    },
  },
  components: {
    schemas: {
      CreatePaymentIntent: {
        type: "object",
        required: ["amountCents", "method", "referenceType", "referenceId"],
        properties: {
          amountCents: { type: "integer", minimum: 1, description: "Valor em centavos (ex.: R$ 150,00 = 15000)" },
          method: { type: "string", enum: ["card_credit", "card_debit", "pix", "cash", "voucher"] },
          installments: { type: "integer", minimum: 1, maximum: 24, default: 1 },
          capture: { type: "boolean", default: true },
          cardToken: { type: "string", description: "Token do cartão gerado pela adquirente (nunca PAN)" },
          referenceType: { type: "string", enum: ["sale", "revenue", "appointment"] },
          referenceId: { type: "integer" },
        },
      },
      PaymentIntent: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["created", "pending", "authorized", "captured", "failed", "cancelled", "refunded", "partially_refunded"] },
          amountCents: { type: "integer" },
          currency: { type: "string", enum: ["BRL"] },
          method: { type: "string" },
          installments: { type: "integer" },
          providerName: { type: "string" },
          providerTransactionId: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
};

const DOCS_HTML = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>OllCLin Payments API</title>
<style>body{font-family:system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#172022}
h1{color:#075e63}code,pre{background:#f1f5f4;border-radius:6px;padding:2px 6px}pre{padding:12px;overflow-x:auto}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #d9e0df;padding:6px 10px;text-align:left}</style>
</head><body>
<h1>OllCLin Payments API</h1>
<p>Contrato OpenAPI 3.1 para integração com maquininhas de cartão.</p>
<p>Baixe o spec: <code><a href="/api/payments/openapi.json">/api/payments/openapi.json</a></code></p>
<h2>Endpoints</h2>
<table>
<tr><th>Método</th><th>Rota</th><th>Descrição</th></tr>
<tr><td>POST</td><td>/v1/payments/intents</td><td>Cria intenção de pagamento (idempotente)</td></tr>
<tr><td>GET</td><td>/v1/payments/{id}</td><td>Consulta status</td></tr>
<tr><td>POST</td><td>/v1/payments/{id}/cancel</td><td>Cancela antes da captura</td></tr>
<tr><td>POST</td><td>/v1/payments/{id}/refund</td><td>Estorno total/parcial</td></tr>
<tr><td>GET</td><td>/v1/payments/{id}/transactions</td><td>Histórico de estados</td></tr>
<tr><td>POST</td><td>/v1/payments/webhooks/{provider}</td><td>Webhook assinado (HMAC)</td></tr>
</table>
<h2>Estados</h2>
<p><code>created → pending → authorized → captured</code>; falhas: <code>failed</code>, <code>cancelled</code>; pós-captura: <code>refunded</code>, <code>partially_refunded</code>.</p>
<h2>Segurança</h2>
<ul><li>Valores em <b>centavos</b> (inteiros) — nunca float.</li>
<li>Nenhum PAN/CVV armazenado — apenas tokens da adquirente (PCI SAQ-A).</li>
<li>Webhook validado por HMAC-SHA256 (<code>x-signature</code>) + dedupe por <code>event_id</code>.</li>
<li>Isolamento total por <code>organization_id</code> (RLS + service role).</li></ul>
</body></html>`;

export function registerPaymentRoutes(app: Express): void {
  app.get("/api/payments/openapi.json", (_req: Request, res: Response) => {
    res.json(OPENAPI_SPEC);
  });

  app.get("/api/payments/docs", (_req: Request, res: Response) => {
    res.type("text/html").send(DOCS_HTML);
  });

  /**
   * Webhook de adquirente. Assinatura HMAC obrigatória; dedupe por event_id.
   * Em produção, cada provider implementa seu próprio parse do payload.
   */
  app.post("/api/payments/webhooks/:provider", async (req: Request, res: Response) => {
    const provider = String(req.params.provider ?? "").toLowerCase();
    const signature = String(req.headers["x-signature"] ?? "");
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});

    if (!activePaymentProvider.verifyWebhookSignature(rawBody, signature)) {
      res.status(401).json({ error: "Assinatura inválida" });
      return;
    }

    const payload = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const eventId = String(payload.event_id ?? `evt_${Date.now()}`);
    const providerTransactionId = payload.transaction_id ? String(payload.transaction_id) : null;
    const toStatus = payload.status ? String(payload.status) : null;

    // Dedupe: evento já processado?
    const inserted = await paymentModel.recordWebhookEvent({
      organizationId: 0, // resolvido pelo provider real em produção
      providerName: provider,
      eventId,
      payload,
    });
    if (!inserted) {
      res.json({ received: true, duplicated: true });
      return;
    }

    // ---------------------------------------------------------------------
    // Provisionamento SaaS: pagamento confirmado → ativa/cria tenant.
    // Eventos de ASSINATURA (plan_key presente) disparam provisionamento;
    // eventos de maquininha (payment_intents) seguem o fluxo legado abaixo.
    // ---------------------------------------------------------------------
    const planKey = payload.plan_key ? String(payload.plan_key) : null;
    const buyerEmail = payload.buyer_email ? String(payload.buyer_email) : null;

    if (planKey && buyerEmail) {
      try {
        if (toStatus === "captured" || toStatus === "authorized") {
          const result = await provisionTenant(
            {
              provider,
              eventId,
              buyerEmail,
              buyerName: payload.buyer_name ? String(payload.buyer_name) : null,
              organizationName: payload.organization_name ? String(payload.organization_name) : null,
              planKey,
              gatewayCustomerId: payload.customer_id ? String(payload.customer_id) : null,
              gatewaySubscriptionId: payload.subscription_id ? String(payload.subscription_id) : null,
            },
            req,
          );
          res.json({ received: true, provisioned: result });
          return;
        }

        if (["failed", "cancelled", "refunded"].includes(toStatus ?? "")) {
          const suspended = await suspendTenantByGatewayRef(
            payload.customer_id ? String(payload.customer_id) : null,
            payload.subscription_id ? String(payload.subscription_id) : null,
            `webhook:${provider}:${toStatus}`,
            req,
          );
          res.json({ received: true, suspended });
          return;
        }
      } catch (error) {
        console.error(
          "[Webhook] Falha no provisionamento:",
          error instanceof Error ? error.message : error,
        );
        res.status(500).json({ received: true, error: "provisioning_failed" });
        return;
      }
    }

    if (providerTransactionId && toStatus) {
      // Atualiza a intenção correspondente (busca por provider_transaction_id).
      const intent = await paymentModel.findByIdempotencyKey(
        `payment:webhook:${provider}:${providerTransactionId}`,
      );
      if (intent) {
        await paymentModel.updateStatus({
          id: intent.id,
          organizationId: intent.organizationId,
          fromStatus: intent.status,
          toStatus: toStatus as never,
          payload: { webhook: eventId },
        });
      }
    }

    await writeAuditLog({
      organizationId: null,
      userId: null,
      action: "UPDATE",
      entity: "payment_webhook",
      newValues: { provider, eventId },
      request: req,
    });

    res.json({ received: true });
  });
}
