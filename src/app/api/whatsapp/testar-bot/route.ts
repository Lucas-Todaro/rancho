import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import { whatsappNumbersMatch } from "@/lib/phone";
import { processWhatsappMessage } from "@/services/whatsapp/twilio";

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

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: jsonError("Sessão não informada.", 401) };

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user?.id) return { error: jsonError("Sessão inválida.", 401) };

  const { data: profile, error: profileError } = await supabase
    .from(TABLES.usuarios)
    .select("id,fazenda_id,papel,ativo")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile?.ativo) return { error: jsonError("Usuário inativo.", 403) };
  if (!["admin", "gerente"].includes(String(profile.papel))) {
    return { error: jsonError("Sem permissão para testar o bot.", 403) };
  }

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
    const { telefone, mensagem, salvarReal } = await request.json();
    const phone = String(telefone || "").trim();
    const text = String(mensagem || "").trim();

    if (!phone) return jsonError("Informe o telefone simulado.", 400);
    if (!text) return jsonError("Informe a mensagem para simular.", 400);

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
    console.error("[WhatsApp bot simulator]", error);
    return jsonError("Erro interno ao simular o bot.", 500);
  }
}
