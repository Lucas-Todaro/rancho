import { NextRequest, NextResponse } from "next/server";
import { sendMainMenu } from "@/services/whatsapp/conversation";

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();
    if (!phone) return NextResponse.json({ error: "Informe o telefone com DDI e DDD" }, { status: 400 });
    const result = await sendMainMenu(phone);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}
