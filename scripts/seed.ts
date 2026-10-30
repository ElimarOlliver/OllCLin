/**
 * OllCLin - Seed de desenvolvimento
 *
 * Cria a organização padrão (id 1), o usuário local de desenvolvimento e alguns
 * registros de exemplo para navegar no sistema.
 *
 * Uso: npm run db:seed
 * Requer SUPABASE_URL e SUPABASE_SECRET_KEY no .env.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { toDbTimestamp } from "../server/lib/datetime";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error(
    "❌ Defina SUPABASE_URL e SUPABASE_SECRET_KEY no .env antes de rodar o seed.",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ORGANIZATION_ID = 1;

async function seedOrganization() {
  const { error } = await supabase.from("organizations").upsert(
    {
      id: ORGANIZATION_ID,
      name: "Clínica OllCLin",
      trade_name: "OllCLin",
      email: "contato@ollclin.local",
      city: "São Paulo",
      state: "SP",
      timezone: "America/Sao_Paulo",
      is_active: true,
    },
    { onConflict: "id" },
  );

  if (error) throw new Error(`organizations: ${error.message}`);
  console.log("✓ Organização padrão (id 1)");
}

async function seedDevUser() {
  const { error } = await supabase.from("users").upsert(
    {
      id: 1,
      open_id: "dev-local",
      name: "Administrador (dev)",
      email: "dev@ollclin.local",
      login_method: "dev",
      role: "admin",
      organization_id: ORGANIZATION_ID,
      last_signed_in: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) throw new Error(`users: ${error.message}`);
  console.log("✓ Usuário local de desenvolvimento (id 1)");
}

async function seedProfessionals() {
  const { count, error } = await supabase
    .from("professionals")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ORGANIZATION_ID);

  if (error) throw new Error(`professionals: ${error.message}`);
  if ((count ?? 0) > 0) {
    console.log("• Profissionais já existem, nada a fazer");
    return;
  }

  const { error: insertError } = await supabase.from("professionals").insert([
    {
      organization_id: ORGANIZATION_ID,
      full_name: "Dra. Ana Beatriz Souza",
      council: "CRM",
      council_number: "123456",
      specialty: "Clínica Geral",
      phone: "(11) 99999-0001",
      email: "ana.souza@ollclin.local",
      is_active: true,
    },
    {
      organization_id: ORGANIZATION_ID,
      full_name: "Dr. Carlos Eduardo Lima",
      council: "CRM",
      council_number: "654321",
      specialty: "Dermatologia",
      phone: "(11) 99999-0002",
      email: "carlos.lima@ollclin.local",
      is_active: true,
    },
  ]);

  if (insertError) throw new Error(`professionals: ${insertError.message}`);
  console.log("✓ Profissionais de exemplo");
}

async function seedProcedures() {
  const { count, error } = await supabase
    .from("procedures")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ORGANIZATION_ID);

  if (error) throw new Error(`procedures: ${error.message}`);
  if ((count ?? 0) > 0) {
    console.log("• Procedimentos já existem, nada a fazer");
    return;
  }

  const { error: insertError } = await supabase.from("procedures").insert([
    {
      organization_id: ORGANIZATION_ID,
      name: "Consulta clínica",
      description: "Consulta médica de rotina",
      duration_minutes: 30,
      price: "250.00",
      is_active: true,
    },
    {
      organization_id: ORGANIZATION_ID,
      name: "Retorno",
      description: "Consulta de retorno",
      duration_minutes: 20,
      price: "120.00",
      is_active: true,
    },
    {
      organization_id: ORGANIZATION_ID,
      name: "Avaliação dermatológica",
      description: "Avaliação de pele e anexos",
      duration_minutes: 40,
      price: "320.00",
      is_active: true,
    },
  ]);

  if (insertError) throw new Error(`procedures: ${insertError.message}`);
  console.log("✓ Procedimentos de exemplo");
}

async function seedPatients() {
  const { count, error } = await supabase
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ORGANIZATION_ID);

  if (error) throw new Error(`patients: ${error.message}`);
  if ((count ?? 0) > 0) {
    console.log("• Pacientes já existem, nada a fazer");
    return;
  }

  const { error: insertError } = await supabase.from("patients").insert([
    {
      organization_id: ORGANIZATION_ID,
      full_name: "Paciente Demonstração",
      cpf: "000.000.000-00",
      phone: "(11) 98888-0000",
      email: "paciente.demo@ollclin.local",
      city: "São Paulo",
      state: "SP",
      consent_data_sharing: true,
      consent_marketing: false,
      is_active: true,
    },
  ]);

  if (insertError) throw new Error(`patients: ${insertError.message}`);
  console.log("✓ Paciente de demonstração");
}

async function seedAppointment() {
  const { count, error } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ORGANIZATION_ID);

  if (error) throw new Error(`appointments: ${error.message}`);
  if ((count ?? 0) > 0) {
    console.log("• Agendamentos já existem, nada a fazer");
    return;
  }

  const [{ data: patient }, { data: professional }, { data: procedure }] =
    await Promise.all([
      supabase
        .from("patients")
        .select("id")
        .eq("organization_id", ORGANIZATION_ID)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("professionals")
        .select("id")
        .eq("organization_id", ORGANIZATION_ID)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("procedures")
        .select("id")
        .eq("organization_id", ORGANIZATION_ID)
        .limit(1)
        .maybeSingle(),
    ]);

  if (!patient || !professional || !procedure) {
    console.log("• Dados insuficientes para criar agendamento de exemplo");
    return;
  }

  const startsAt = new Date();
  startsAt.setHours(10, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

  const { error: insertError } = await supabase.from("appointments").insert({
    organization_id: ORGANIZATION_ID,
    patient_id: patient.id,
    professional_id: professional.id,
    procedure_id: procedure.id,
    starts_at: toDbTimestamp(startsAt),
    ends_at: toDbTimestamp(endsAt),
    status: "confirmado",
    notes: "Agendamento de demonstração",
    created_by: 1,
  });

  if (insertError) throw new Error(`appointments: ${insertError.message}`);
  console.log("✓ Agendamento de demonstração (hoje às 10:00)");
}

/* -------------------------------------------------------------------------- */
/*  FORMAS DE RECEBIMENTO (REQ-08-027..035): Nome e Tipo obrigatórios          */
/* -------------------------------------------------------------------------- */
async function seedPaymentMethods() {
  const { count, error } = await supabase
    .from("payment_methods")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ORGANIZATION_ID);

  if (error) throw new Error(`payment_methods: ${error.message}`);
  if ((count ?? 0) > 0) {
    console.log("• Formas de recebimento já existem, nada a fazer");
    return;
  }

  // [nome, tipo, permite parcelamento — exibe campo Parcelas quando true]
  const methods: Array<[string, string, boolean]> = [
    ["Dinheiro", "dinheiro", false],
    ["Pix", "pix", false],
    ["Cartão de Crédito", "cartao", true],
    ["Cartão de Débito", "cartao", false],
    ["Boleto", "boleto", true],
    ["Transferência Bancária", "transferencia", false],
    ["Convênio", "convenio", true],
  ];

  const { error: insertError } = await supabase.from("payment_methods").insert(
    methods.map(([name, type, allowsInstallments]) => ({
      organization_id: ORGANIZATION_ID,
      name,
      type,
      allows_installments: allowsInstallments,
      is_active: true,
    })),
  );

  if (insertError) throw new Error(`payment_methods: ${insertError.message}`);
  console.log("✓ Formas de recebimento (7)");
}

/* -------------------------------------------------------------------------- */
/*  RECEITAS DEMO (Cap. 15.1): status a_receber/recebido                       */
/* -------------------------------------------------------------------------- */
async function seedRevenues() {
  const { count, error } = await supabase
    .from("revenues")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ORGANIZATION_ID);

  if (error) throw new Error(`revenues: ${error.message}`);
  if ((count ?? 0) > 0) {
    console.log("• Receitas já existem, nada a fazer");
    return;
  }

  const [{ data: pixMethod }, { data: cashMethod }, { data: plan }] = await Promise.all([
    supabase.from("payment_methods").select("id").eq("organization_id", ORGANIZATION_ID).eq("type", "pix").limit(1).maybeSingle(),
    supabase.from("payment_methods").select("id").eq("organization_id", ORGANIZATION_ID).eq("type", "dinheiro").limit(1).maybeSingle(),
    supabase.from("health_plans").select("id").eq("organization_id", ORGANIZATION_ID).limit(1).maybeSingle(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const { error: insertError } = await supabase.from("revenues").insert([
    {
      organization_id: ORGANIZATION_ID,
      payment_method_id: pixMethod?.id ?? null,
      amount: "150.00",
      status: "recebido",
      due_date: today,
      description: "Consulta clínica (demo)",
    },
    {
      organization_id: ORGANIZATION_ID,
      payment_method_id: cashMethod?.id ?? null,
      amount: "350.00",
      status: "a_receber",
      due_date: today,
      description: "Retorno (demo)",
    },
    {
      organization_id: ORGANIZATION_ID,
      amount: "80.00",
      status: "a_receber",
      due_date: today,
      description: "Exame laboratorial (demo)",
    },
    {
      organization_id: ORGANIZATION_ID,
      health_plan_id: plan?.id ?? null,
      amount: "220.00",
      status: "recebido",
      due_date: today,
      description: "Sessão fisioterapia convênio (demo)",
    },
  ]);

  if (insertError) throw new Error(`revenues: ${insertError.message}`);
  console.log("✓ Receitas de demonstração (4)");
}

async function main() {
  console.log("🌱 Populando o Supabase (OllCLin)...\n");
  await seedOrganization();
  await seedDevUser();
  await seedProfessionals();
  await seedProcedures();
  await seedPatients();
  await seedPaymentMethods();
  await seedRevenues();
  await seedAppointment();
  console.log("\n✅ Seed concluído.");
}

main().catch((error) => {
  console.error("\n❌ Seed falhou:", error instanceof Error ? error.message : error);
  process.exit(1);
});
