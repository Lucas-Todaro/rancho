export const publicWhatsappConfig = {
  mode: process.env.NEXT_PUBLIC_WHATSAPP_ENV || "sandbox",
  sandboxNumber: process.env.NEXT_PUBLIC_TWILIO_SANDBOX_NUMBER || "",
  sandboxJoinCode: process.env.NEXT_PUBLIC_TWILIO_SANDBOX_JOIN_CODE || ""
};

export function isWhatsappSandboxEnvironment() {
  return publicWhatsappConfig.mode !== "production";
}
