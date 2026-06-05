import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeErrorText, sanitizeFreeText } from "@/lib/security";
import { getIncomingMessage } from "@/services/whatsapp/meta";
import { handleConversation } from "@/services/whatsapp/conversation";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const mode = search.get("hub.mode");
  const token = search.get("hub.verify_token");
  const challenge = search.get("hub.challenge");

  if (mode === "subscribe" && token === env.whatsappVerifyToken) {
    return new Response(challenge || "", { status: 200 });
  }

  return NextResponse.json({ error: "Token de verificação inválido" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType && !contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json({ ok: false, error: "Formato de requisição inválido." }, { status: 415 });
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > 10000) {
      return NextResponse.json({ ok: false, error: "Mensagem muito longa para processar com segurança." }, { status: 413 });
    }

    const payload = await request.json();
    const incoming = getIncomingMessage(payload);

    if (!incoming?.phone) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    await handleConversation({
      phone: sanitizeFreeText(incoming.phone, 80),
      text: sanitizeFreeText(incoming.text),
      buttonId: sanitizeFreeText(incoming.buttonId, 120)
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[WhatsApp webhook]", safeErrorText(error));
    return NextResponse.json({ ok: false, error: "Não foi possível processar a mensagem agora." }, { status: 500 });
  }
}
