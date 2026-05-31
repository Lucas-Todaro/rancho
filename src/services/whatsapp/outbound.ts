import { env, isMetaConfigured, isTwilioConfigured } from "@/lib/env";
import { normalizeWhatsappNumber } from "@/lib/phone";
import { sendWhatsAppText } from "@/services/whatsapp/meta";

function twilioAddress(value: string) {
  return value.startsWith("whatsapp:") ? value : `whatsapp:${value}`;
}

async function sendTwilioWhatsAppText(to: string, body: string) {
  const params = new URLSearchParams({
    From: twilioAddress(env.twilioWhatsappFrom),
    To: twilioAddress(`+${to}`),
    Body: body
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || "Não foi possível enviar pelo Twilio.");
  }

  return { provider: "twilio", data };
}

export async function sendOutboundWhatsAppText(phone: string, body: string) {
  const normalizedPhone = normalizeWhatsappNumber(phone);
  if (!normalizedPhone) throw new Error("Informe um WhatsApp válido com DDD.");

  if (isTwilioConfigured()) {
    return sendTwilioWhatsAppText(normalizedPhone, body);
  }

  if (isMetaConfigured()) {
    const data = await sendWhatsAppText(normalizedPhone, body);
    return { provider: "meta", data };
  }

  throw new Error("O envio ativo pelo site ainda não está configurado. Para Twilio, configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_WHATSAPP_FROM na Vercel.");
}
