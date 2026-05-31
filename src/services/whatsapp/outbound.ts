import { env, isMetaConfigured, isTwilioConfigured } from "@/lib/env";
import { normalizeWhatsappNumber } from "@/lib/phone";
import { sendWhatsAppText } from "@/services/whatsapp/meta";

function twilioAddress(value: string) {
  if (value.startsWith("whatsapp:")) return value;
  const normalized = normalizeWhatsappNumber(value);
  return `whatsapp:+${normalized}`;
}

function maskPhone(value: string) {
  const normalized = normalizeWhatsappNumber(value);
  if (!normalized) return "***";
  return `***${normalized.slice(-4)}`;
}

async function sendTwilioWhatsAppText(to: string, body: string) {
  console.log("[WhatsApp outbound]", {
    provider: "twilio",
    to: maskPhone(to),
    messageLength: body.length
  });

  const params = new URLSearchParams({
    From: twilioAddress(env.twilioWhatsappFrom),
    To: twilioAddress(to),
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
    console.error("[WhatsApp outbound error]", {
      provider: "twilio",
      to: maskPhone(to),
      status: response.status,
      message: data?.message
    });
    throw new Error(data?.message || "Não foi possível enviar pelo Twilio.");
  }

  console.log("[WhatsApp outbound ok]", {
    provider: "twilio",
    to: maskPhone(to),
    status: response.status
  });

  return { provider: "twilio", data };
}

export async function sendOutboundWhatsAppText(phone: string, body: string) {
  const normalizedPhone = normalizeWhatsappNumber(phone);
  if (!normalizedPhone) throw new Error("Informe um WhatsApp válido com DDD.");

  if (isTwilioConfigured()) {
    return sendTwilioWhatsAppText(normalizedPhone, body);
  }

  if (isMetaConfigured()) {
    console.log("[WhatsApp outbound]", {
      provider: "meta",
      to: maskPhone(normalizedPhone),
      messageLength: body.length
    });
    const data = await sendWhatsAppText(normalizedPhone, body);
    console.log("[WhatsApp outbound ok]", {
      provider: "meta",
      to: maskPhone(normalizedPhone)
    });
    return { provider: "meta", data };
  }

  throw new Error("O envio ativo pelo site ainda não está configurado. Para Twilio, configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_WHATSAPP_FROM na Vercel.");
}
