// OllCLin - Criação de usuário de acesso (Supabase Auth + vínculo local)
//
// Uso:
//   node.cmd scripts/create-user.mjs <email> <senha> [nome] [papel] [organization_id]
//
// Exemplo:
//   node.cmd scripts/create-user.mjs admin@clinica.com "SenhaForte@123" "Administrador" admin 1
//
// Papel "owner" marca o usuário como titular (is_owner) e concede acesso
// total em todas as áreas (member_permissions = full).
//
// Requer SUPABASE_URL e SUPABASE_SECRET_KEY no .env (backend apenas — nunca
// expor essas chaves ao frontend).
//
// O que o script faz:
//   1. Cria (ou atualiza a senha do) usuário no Supabase Auth, e-mail confirmado;
//   2. Cria/atualiza o registro local na tabela `users` (vínculo por e-mail);
//   3. Cria/atualiza o vínculo em `organization_members` (papel + status active);
//   4. Para papel "owner", grava permissão total nas áreas do sistema.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/* ----------------------------- env (.env) -------------------------------- */

function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env é opcional se as variáveis já estiverem no ambiente
  }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    "❌ Defina SUPABASE_URL e SUPABASE_SECRET_KEY no .env (backend apenas).",
  );
  process.exit(1);
}

/* ------------------------------ argumentos ------------------------------- */

const [email, password, nameArg, roleArg, orgArg] = process.argv.slice(2);

if (!email || !password) {
  console.error(
    "Uso: node.cmd scripts/create-user.mjs <email> <senha> [nome] [papel] [organization_id]",
  );
  process.exit(1);
}

const name = nameArg || email.split("@")[0];
const role = roleArg || "admin";
const ORGANIZATION_ID = Number(orgArg ?? 1);

if (!Number.isInteger(ORGANIZATION_ID) || ORGANIZATION_ID <= 0) {
  console.error("❌ organization_id inválido.");
  process.exit(1);
}

const isOwner = role === "owner";

/* ------------------------------- execução -------------------------------- */

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function findAuthUserByEmail(targetEmail) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Supabase Auth (listUsers): ${error.message}`);
    const users = data?.users ?? [];
    const found = users.find(
      (user) => user.email?.toLowerCase() === targetEmail.toLowerCase(),
    );
    if (found) return found;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function main() {
  console.log(`\nCriando usuário: ${email} (papel: ${role})\n`);

  // 1. Criar no Supabase Auth (e-mail já confirmado, sem convite por e-mail)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, full_name: name },
  });

  if (authError) {
    const msg = authError.message ?? String(authError);
    if (/already|registered|exists/i.test(msg)) {
      console.log("ℹ Usuário já existe no Supabase Auth — atualizando a senha.");
      const existingAuth = await findAuthUserByEmail(email);
      if (!existingAuth) {
        throw new Error("não encontrei o usuário existente no Supabase Auth");
      }
      const { error: updAuthError } = await supabase.auth.admin.updateUserById(
        existingAuth.id,
        { password, email_confirm: true, user_metadata: { name, full_name: name } },
      );
      if (updAuthError) {
        throw new Error(`Supabase Auth (updateUserById): ${updAuthError.message}`);
      }
      console.log("✓ Senha atualizada no Supabase Auth");
    } else {
      console.error(`❌ Falha ao criar usuário no Supabase Auth: ${msg}`);
      process.exit(1);
    }
  } else {
    console.log(`✓ Usuário criado no Supabase Auth (id: ${authData?.user?.id ?? "?"})`);
  }

  // 2. Registro local na tabela `users`
  const { data: existing } = await supabase
    .from("users")
    .select("id, email, organization_id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (existing) {
    console.log(`ℹ Registro local já existe (users.id=${existing.id})`);
    const { error: updErr } = await supabase
      .from("users")
      .update({
        organization_id: ORGANIZATION_ID,
        role,
        is_owner: isOwner,
        ...(name ? { name } : {}),
      })
      .eq("id", existing.id);
    if (updErr) throw new Error(`users: ${updErr.message}`);
    console.log(
      `✓ users atualizado (organization_id=${ORGANIZATION_ID}, role=${role}, is_owner=${isOwner})`,
    );
  } else {
    const { data: created, error: userErr } = await supabase
      .from("users")
      .insert({
        open_id: `supabase:${email.toLowerCase()}`,
        name,
        email: email.toLowerCase(),
        login_method: "supabase",
        role,
        organization_id: ORGANIZATION_ID,
        is_owner: isOwner,
      })
      .select("id")
      .single();
    if (userErr) throw new Error(`users: ${userErr.message}`);
    console.log(`✓ Registro local criado (users.id=${created.id})`);
  }

  // 3. Vínculo organization_members (tenant/RBAC)
  const localUser = await supabase
    .from("users")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (!localUser?.data) throw new Error("não encontrei o usuário local após criação");

  const { data: member, error: memberSelErr } = await supabase
    .from("organization_members")
    .select("id, status, role")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("user_id", localUser.data.id)
    .maybeSingle();

  if (memberSelErr) throw new Error(`organization_members: ${memberSelErr.message}`);

  if (member) {
    if (member.status !== "active" || member.role !== role) {
      const { error: updErr } = await supabase
        .from("organization_members")
        .update({ status: "active", role })
        .eq("id", member.id);
      if (updErr) throw new Error(`organization_members: ${updErr.message}`);
      console.log(`✓ Vínculo atualizado (org ${ORGANIZATION_ID}, papel ${role}, active)`);
    } else {
      console.log(`ℹ Vínculo já existe e está ativo (org ${ORGANIZATION_ID}, papel ${role})`);
    }
  } else {
    const { error: insErr } = await supabase.from("organization_members").insert({
      organization_id: ORGANIZATION_ID,
      user_id: localUser.data.id,
      role,
      status: "active",
    });
    if (insErr) throw new Error(`organization_members: ${insErr.message}`);
    console.log(`✓ Vínculo criado (org ${ORGANIZATION_ID}, papel ${role}, status active)`);
  }

  // 4. Titular: acesso total em todas as áreas do sistema
  if (isOwner) {
    const { data: areas, error: areasErr } = await supabase
      .from("permission_areas")
      .select("key");
    if (areasErr) throw new Error(`permission_areas: ${areasErr.message}`);

    const rows = (areas ?? []).map((area) => ({
      organization_id: ORGANIZATION_ID,
      user_id: localUser.data.id,
      area_key: area.key,
      access_level: "full",
      granted_by: localUser.data.id,
      updated_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      const { error: permErr } = await supabase
        .from("member_permissions")
        .upsert(rows, { onConflict: "organization_id,user_id,area_key" });
      if (permErr) throw new Error(`member_permissions: ${permErr.message}`);
      console.log(`✓ Permissão total concedida em ${rows.length} áreas`);
    }
  }

  console.log("\n✅ Usuário pronto para logar em /entrar.\n");
}

main().catch((error) => {
  console.error("\n❌ Falha:", error instanceof Error ? error.message : error);
  process.exit(1);
});
