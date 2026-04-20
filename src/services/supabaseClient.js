import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

console.info(`Supabase URL loaded: ${supabaseUrl ? "yes" : "no"}`);
console.info(`Supabase anon key loaded: ${supabaseAnonKey ? "yes" : "no"}`);

function createSupabaseClient() {
  if (!isSupabaseConfigured) return null;
  try {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  } catch (error) {
    console.error("Supabase client initialization failed:", error.message);
    return null;
  }
}

export const supabase = createSupabaseClient();

export function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase environment variables are missing. Please check your .env file and restart Vite.");
  }
  return supabase;
}

export async function testSupabaseConnection() {
  if (!supabase) {
    return {
      ok: false,
      message: "Supabase environment variables are missing. Please check your .env file and restart Vite.",
    };
  }

  try {
    const { error } = await supabase.auth.getSession();
    if (error) throw error;
    return { ok: true, message: "Supabase connected successfully" };
  } catch (error) {
    return { ok: false, message: `Supabase connection failed: ${error.message}` };
  }
}
