import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SECRET_KEY as string,
  { auth: { persistSession: false } },
);

const { error } = await supabase
  .from("appointments")
  .delete()
  .eq("organization_id", 1);

if (error) {
  console.error(error.message);
  process.exit(1);
}
console.log("Agendamentos de demonstração removidos.");
