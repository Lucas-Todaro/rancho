import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
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
    const payload = await request.json();
    const incoming = getIncomingMessage(payload);

    if (!incoming?.phone) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    await handleConversation({
      phone: incoming.phone,
      text: incoming.text,
      buttonId: incoming.buttonId
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[WhatsApp webhook]", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
