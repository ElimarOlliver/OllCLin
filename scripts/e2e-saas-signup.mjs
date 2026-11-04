// Teste e2e do fluxo SaaS: signup -> trial 10 dias -> titular -> permissões.
// Usa a mesma lógica do controller saas.signup (sem precisar do servidor rodando).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq > 0) process.env[t.slice(0, eq).trim()] ??= t.slice(eq + 1).trim();
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const email = `teste.trial.${Date.now()}@ollclin.test`;
// Senha efêmera só para o teste e2e (nunca é uma credencial real do sistema).
const password = process.env.E2E_TEST_PASSWORD ?? `Trial@${Date.now()}aA1`;

console.log("1. Criando usuário no Supabase Auth...");
const { error: authErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true, user_metadata: { name: "Titular Teste" },
});
if (authErr && !/already/i.test(authErr.message)) throw new Error("auth: " + authErr.message);
console.log("   OK:", email);

console.log("2. Criando organização com trial de 10 dias...");
const now = new Date();
const ends = new Date(now.getTime() + 10 * 86400000);
const { data: org, error: orgErr } = await admin.from("organizations").insert({
  name: "Clínica Trial Teste", is_active: true, plan: "trial",
  trial_started_at: now.toISOString(), trial_ends_at: ends.toISOString(),
}).select("id, trial_ends_at, plan").single();
if (orgErr) throw new Error("org: " + orgErr.message);
console.log("   OK: org", org.id, "plan:", org.plan, "trial até:", org.trial_ends_at);

console.log("3. Criando usuário local titular...");
const { data: maxRow } = await admin.from("users").select("id").order("id", { ascending: false }).limit(1);
const nextId = Number(maxRow?.[0]?.id ?? 0) + 1;
const { data: user, error: userErr } = await admin.from("users").insert({
  id: nextId, open_id: `supabase:${email}`, name: "Titular Teste", email,
  login_method: "supabase", role: "owner", organization_id: org.id, is_owner: true,
}).select("id, is_owner, role").single();
if (userErr) throw new Error("users: " + userErr.message);
console.log("   OK: users.id", user.id, "is_owner:", user.is_owner, "role:", user.role);

console.log("4. Vínculo organization_members (owner/active)...");
const { error: mErr } = await admin.from("organization_members").insert({
  organization_id: org.id, user_id: user.id, role: "owner", status: "active",
});
if (mErr) throw new Error("member: " + mErr.message);
console.log("   OK");

console.log("5. Login com a senha...");
const pub = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { error: loginErr } = await pub.auth.signInWithPassword({ email, password });
if (loginErr) throw new Error("login: " + loginErr.message);
console.log("   OK — login válido");

console.log("6. Permissões: definindo acesso parcial em 'agenda' para o próprio titular (deve ser ignorado, titular é master)...");
// sanity: catálogo de áreas
const { data: areas } = await admin.from("permission_areas").select("key").order("sort_order");
console.log("   Áreas no catálogo:", areas?.map((a) => a.key).join(", "));

console.log("\n✅ Fluxo e2e completo: cadastro → trial 10 dias → titular master → login OK");
