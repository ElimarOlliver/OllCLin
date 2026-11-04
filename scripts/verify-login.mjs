// Validação: login com e-mail/senha no Supabase Auth + resolução local.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq > 0) process.env[t.slice(0, eq).trim()] ??= t.slice(eq + 1).trim();
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const [email, password] = process.argv.slice(2);
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) {
  console.error("❌ Login falhou:", error.message);
  process.exit(1);
}
console.log("✅ Login OK");
console.log("  user id:", data.user.id);
console.log("  email  :", data.user.email);
console.log("  token  :", data.session.access_token.slice(0, 24) + "...");

// Resolução local (mesma lógica do backend): users + organization_members
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { data: local } = await admin.from("users").select("id, name, role, organization_id").ilike("email", email).maybeSingle();
const { data: member } = await admin.from("organization_members").select("role, status").eq("user_id", local.id).eq("organization_id", local.organization_id).maybeSingle();
console.log("  local  : users.id=" + local.id + " role=" + local.role + " org=" + local.organization_id);
console.log("  tenant : papel=" + member.role + " status=" + member.status);
