import { createClient } from "@supabase/supabase-js";
import { env, isServerSupabaseConfigured } from "@/lib/env";

export function getSupabaseAdmin() {
  if (!isServerSupabaseConfigured()) return null;
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
