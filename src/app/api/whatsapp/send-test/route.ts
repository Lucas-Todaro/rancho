import { NextRequest, NextResponse } from "next/server";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { sendOutboundWhatsAppText } from "@/services/whatsapp/outbound";

const DEFAULT_MESSAGE = [
  "Olá! Aqui é o bot do Rancho.",
  "Você pode enviar frases como:",
  "- Mimosa deu 15 litros hoje",
  "- Vendi leite por 900 reais",
  "- Comprei ração por 300",
  "- João entrou às 7:30"
].join("\n");

export async function POST(request: NextRequest) {
  try {
    const { phone, message } = await request.json();
    if (!phone) return NextResponse.json({ ok: false, error: "Informe o WhatsApp com DDD." }, { status: 400 });

    const result = await sendOutboundWhatsAppText(phone, String(message || DEFAULT_MESSAGE));
    return NextResponse.json({ ok: true, provider: result.provider });
  } catch (error) {
    const message = getFriendlyErrorMessage(error, "Não foi possível enviar a mensagem agora.");
    if (process.env.NODE_ENV !== "production") console.error("[WhatsApp send-message]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
