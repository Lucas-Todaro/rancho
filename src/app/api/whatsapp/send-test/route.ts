import { NextRequest, NextResponse } from "next/server";
import { sendMainMenu } from "@/services/whatsapp/conversation";

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();
    if (!phone) return NextResponse.json({ error: "Informe o telefone com DDI e DDD" }, { status: 400 });
    await sendMainMenu(phone);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[WhatsApp send-test]", error instanceof Error ? error.message : "Erro interno");
    }
    return NextResponse.json({ ok: false, error: "Não foi possível enviar o menu agora." }, { status: 500 });
  }
}
