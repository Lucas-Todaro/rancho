export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Rancho Pro",
  farmName: process.env.NEXT_PUBLIC_FARM_NAME || "Fazenda Modelo",
  defaultFazendaId: process.env.SUPABASE_DEFAULT_FAZENDA_ID || "",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
  metaWhatsappToken: process.env.META_WHATSAPP_TOKEN || "",
  metaPhoneNumberId: process.env.META_PHONE_NUMBER_ID || ""
};

export function isSupabaseConfigured() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey && env.supabaseUrl.includes("supabase.co"));
}

export function isServerSupabaseConfigured() {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey && env.supabaseUrl.includes("supabase.co"));
}

export function isMetaConfigured() {
  return Boolean(env.metaWhatsappToken && env.metaPhoneNumberId);
}
