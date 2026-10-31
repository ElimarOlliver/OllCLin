/**
 * OllCLin - Smoke test da API (uso local)
 *
 * Verifica, com o servidor de desenvolvimento rodando em :3000, se as rotas
 * principais respondem. Útil para confirmar rapidamente que uma migração
 * pendente não derrubou módulos já existentes.
 *
 * Uso: node scripts/smoke-api.mjs
 */
const base = "http://localhost:3000";

const calls = [
  ["/api/trpc/auth.me", null],
  ["/api/trpc/pacientes.requiredFields", { organizationId: 1 }],
  ["/api/trpc/profissionais.list", { organizationId: 1, isActive: true, limit: 5 }],
  ["/api/trpc/receitas.paymentMethods", { organizationId: 1 }],
  ["/api/trpc/receitas.list", { organizationId: 1, limit: 3 }],
  ["/api/trpc/vendas.list", { organizationId: 1, limit: 3 }],
  ["/api/trpc/repasses.list", { organizationId: 1, limit: 3 }],
  ["/api/trpc/extrato.list", { organizationId: 1, limit: 3 }],
  ["/api/trpc/recibos.list", { organizationId: 1, limit: 3 }],
];

const home = await fetch(base + "/");
console.log("GET / ->", home.status, home.headers.get("content-type"));

for (const [path, input] of calls) {
  const url = input
    ? `${base}${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
    : `${base}${path}`;
  const res = await fetch(url, { headers: { "content-type": "application/json" } });
  const body = await res.text();
  let short = body.replace(/\s+/g, " ").slice(0, 220);
  if (body.length > 400) short = body.replace(/\s+/g, " ").slice(0, 220) + "...";
  console.log(path, "->", res.status, short);
}
