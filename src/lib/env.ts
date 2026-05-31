export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Rancho Pro",
  farmName: process.env.NEXT_PUBLIC_FARM_NAME || "Fazenda Modelo",
  defaultFazendaId: process.env.SUPABASE_DEFAULT_FAZENDA_ID || "",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
  metaWhatsappToken: process.env.META_WHATSAPP_TOKEN || "",
  metaPhoneNumberId: process.env.META_PHONE_NUMBER_ID || "",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
  twilioWhatsappFrom: process.env.TWILIO_WHATSAPP_FROM || ""
};

function hasRealValue(value: string) {
  return Boolean(value && !/sua-|seu-|crie-|id-do|id-da|aqui/i.test(value));
}

export function isSupabaseConfigured() {
  return Boolean(hasRealValue(env.supabaseUrl) && hasRealValue(env.supabaseAnonKey) && env.supabaseUrl.includes("supabase.co"));
}

export function isServerSupabaseConfigured() {
  return Boolean(hasRealValue(env.supabaseUrl) && hasRealValue(env.supabaseServiceRoleKey) && env.supabaseUrl.includes("supabase.co"));
}

export function isMetaConfigured() {
  return Boolean(hasRealValue(env.metaWhatsappToken) && hasRealValue(env.metaPhoneNumberId));
}

export function isTwilioConfigured() {
  return Boolean(hasRealValue(env.twilioAccountSid) && hasRealValue(env.twilioAuthToken) && hasRealValue(env.twilioWhatsappFrom));
}
