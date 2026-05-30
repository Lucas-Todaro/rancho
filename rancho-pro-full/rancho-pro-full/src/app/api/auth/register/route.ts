import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { slug } from "@/lib/utils";

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({
        error: "Cadastro automatico precisa de SUPABASE_SERVICE_ROLE_KEY valida no .env.local."
      }, { status: 503 });
    }

    const body = await request.json();
    const nome = asText(body.nome);
    const fazendaNome = asText(body.fazendaNome);
    const email = asText(body.email).toLowerCase();
    const password = asText(body.password);
    const telefone = asText(body.telefone) || null;

    if (!nome || !fazendaNome || !email || !password) {
      return NextResponse.json({ error: "Preencha nome, fazenda, e-mail e senha." }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome, fazenda: fazendaNome }
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || "Nao foi possivel criar o usuario." }, { status: 400 });
    }

    const userId = authData.user.id;
    const uniqueSlug = `${slug(fazendaNome) || "fazenda"}-${crypto.randomUUID().slice(0, 8)}`;

    const { data: fazenda, error: fazendaError } = await supabase
      .from("fazendas")
      .insert({
        nome: fazendaNome,
        slug: uniqueSlug,
        timezone: "America/Fortaleza",
        plano: "mvp",
        ativa: true
      })
      .select("id,nome,slug")
      .single();

    if (fazendaError || !fazenda) {
      await supabase.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: fazendaError?.message || "Nao foi possivel criar a fazenda." }, { status: 400 });
    }

    const { error: usuarioError } = await supabase
      .from("usuarios")
      .insert({
        id: userId,
        fazenda_id: fazenda.id,
        nome,
        telefone,
        papel: "admin",
        ativo: true
      });

    if (usuarioError) {
      await supabase.from("fazendas").delete().eq("id", fazenda.id);
      await supabase.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: usuarioError.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      userId,
      fazendaId: fazenda.id
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Erro interno ao criar cadastro."
    }, { status: 500 });
  }
}
