import { NextRequest, NextResponse } from "next/server";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { isOversizedText, safeErrorText, sanitizeFreeText } from "@/lib/security";
import { requireInternalWhatsappTester } from "@/lib/server/internal-whatsapp-tools";
import { sendOutboundWhatsAppText } from "@/services/whatsapp/outbound";

const DEFAULT_MESSAGE = [
  "Olá! Aqui é o bot do Rancho.",
  "Você pode enviar frases como:",
  "- Mimosa deu 15 litros de leite hoje",
  "- Vendi leite por 900 reais",
  "- Comprei ração por 300 reais",
  "- Entrou 10 sacos de ração no estoque",
  "- João entrou às 7:30"
].join("\n");

export async function POST(request: NextRequest) {
  try {
    const permission = await requireInternalWhatsappTester(request);
    if (!permission.ok) return permission.response;

    const contentType = request.headers.get("content-type") || "";
    if (contentType && !contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json({ ok: false, error: "Formato de requisição inválido." }, { status: 415 });
    }

    const { phone, message } = await request.json();
    if (!phone) return NextResponse.json({ ok: false, error: "Informe o WhatsApp com DDD." }, { status: 400 });
    if (isOversizedText(message)) return NextResponse.json({ ok: false, error: "Mensagem muito longa para enviar com segurança." }, { status: 413 });

    const result = await sendOutboundWhatsAppText(
      sanitizeFreeText(phone, 80),
      sanitizeFreeText(message || DEFAULT_MESSAGE)
    );
    return NextResponse.json({ ok: true, provider: result.provider });
  } catch (error) {
    const message = getFriendlyErrorMessage(error, "Não foi possível enviar a mensagem agora.");
    if (process.env.NODE_ENV !== "production") console.error("[WhatsApp send-message]", safeErrorText(error) || message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
