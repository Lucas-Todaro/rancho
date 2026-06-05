import { createClient } from "@supabase/supabase-js";

const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const publicSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function hasRealPublicValue(value: string) {
  return Boolean(value && !/sua-|seu-|crie-|id-do|id-da|aqui/i.test(value));
}

export function isBrowserSupabaseConfigured() {
  return Boolean(hasRealPublicValue(publicSupabaseUrl) && hasRealPublicValue(publicSupabaseAnonKey) && publicSupabaseUrl.includes("supabase.co"));
}

export const supabaseBrowser = isBrowserSupabaseConfigured()
  ? createClient(publicSupabaseUrl, publicSupabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    })
  : null;
