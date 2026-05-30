import { env } from "@/lib/env";

export type WhatsAppButton = {
  id: string;
  title: string;
};

const apiBase = "https://graph.facebook.com/v20.0";

export function isMetaConfigured() {
  return Boolean(env.metaWhatsappToken && env.metaPhoneNumberId);
}

async function sendPayload(payload: any) {
  if (!isMetaConfigured()) {
    console.log("[WhatsApp demo]", JSON.stringify(payload, null, 2));
    return { demo: true, payload };
  }

  const response = await fetch(`${apiBase}/${env.metaPhoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.metaWhatsappToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || "Erro ao enviar mensagem WhatsApp");
  }
  return data;
}

export async function sendWhatsAppText(to: string, body: string) {
  return sendPayload({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { preview_url: false, body }
  });
}

export async function sendWhatsAppButtons(to: string, body: string, buttons: WhatsAppButton[]) {
  return sendPayload({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.slice(0, 3).map((button) => ({
          type: "reply",
          reply: { id: button.id, title: button.title.slice(0, 20) }
        }))
      }
    }
  });
}

export function getIncomingMessage(payload: any) {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const message = value?.messages?.[0];
  if (!message) return null;

  const phone = message.from as string;
  const text = message.text?.body as string | undefined;
  const buttonId = message.interactive?.button_reply?.id || message.button?.payload;
  const buttonTitle = message.interactive?.button_reply?.title || message.button?.text;

  return {
    phone,
    id: message.id,
    type: message.type,
    text: text || buttonTitle || "",
    buttonId: buttonId as string | undefined,
    raw: message
  };
}
