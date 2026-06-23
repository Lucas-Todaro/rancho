import { NextRequest, NextResponse } from "next/server";
import { INTERNAL_TOOLS_FORBIDDEN_MESSAGE } from "@/lib/internal-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import { whatsappNumbersMatch } from "@/lib/phone";
import { isOversizedText, safeErrorText, sanitizeFreeText, sanitizeWhatsappMessageText } from "@/lib/security";
import { requireInternalWhatsappTester } from "@/lib/server/internal-whatsapp-tools";
import { processWhatsappMessage } from "@/services/whatsapp/process-message";

function jsonError(message: string, status: number) {
  return NextResponse.json({
    respostaTexto: "",
    intencaoDetectada: null,
    confianca: null,
    dadosExtraidos: null,
    estadoAnterior: null,
    estadoNovo: null,
    camposFaltantes: [],
    eventoConfirmado: false,
    erro: message
  }, { status });
}

async function assertCanUseSimulator(request: NextRequest, telefone: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { error: jsonError("Supabase server-side não configurado.", 503) };

  const permission = await requireInternalWhatsappTester(request);
  if (!permission.ok) {
    return { error: jsonError(INTERNAL_TOOLS_FORBIDDEN_MESSAGE, permission.response.status) };
  }

  const profile = permission.profile;

  const { data: whatsappUsers, error: whatsappError } = await supabase
    .from(TABLES.whatsappUsuarios)
    .select("telefone_e164,ativo")
    .eq("fazenda_id", profile.fazenda_id)
    .limit(2000);

  if (whatsappError) throw new Error(whatsappError.message);

  const activeMatch = (whatsappUsers || []).some((row) => (
    row.ativo !== false && whatsappNumbersMatch(telefone, row.telefone_e164 as string)
  ));

  if (!activeMatch) {
    return { error: jsonError("Use um WhatsApp ativo cadastrado nesta fazenda para simular o bot.", 404) };
  }

  return { error: null };
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType && !contentType.toLowerCase().includes("application/json")) {
      return jsonError("Formato de requisição inválido.", 415);
    }

    const { telefone, mensagem, salvarReal } = await request.json();
    const phone = sanitizeFreeText(telefone || "", 80);
    const text = sanitizeWhatsappMessageText(mensagem || "");

    if (!phone) return jsonError("Informe o telefone simulado.", 400);
    if (!text) return jsonError("Informe a mensagem para simular.", 400);
    if (isOversizedText(mensagem)) return jsonError("Mensagem muito longa para processar com segurança.", 413);

    const permission = await assertCanUseSimulator(request, phone);
    if (permission.error) return permission.error;

    const result = await processWhatsappMessage({
      telefone: phone,
      mensagem: text,
      provider: "simulador",
      modoTeste: true,
      salvarReal: Boolean(salvarReal)
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[WhatsApp bot simulator]", safeErrorText(error));
    return jsonError("Erro interno ao simular o bot.", 500);
  }
}
