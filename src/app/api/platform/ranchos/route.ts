import { NextRequest, NextResponse } from "next/server";
import { createInvitationToken, findAuthUserByEmail, hashInvitationToken, invitationExpiresAt, invitationLink, isValidInviteEmail, normalizeInviteEmail } from "@/lib/server/invitations";
import { platformAdminError, requirePlatformAdmin } from "@/lib/server/platform-admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";
import { slug } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function statusFromFarm(farm: AnyRecord, ownerAccepted: boolean) {
  if (ownerAccepted) return "ativo";
  if (farm.status) return String(farm.status);
  return farm.ativa === false ? "suspenso" : "ativo";
}

function shouldIgnoreOptionalTableError(error: { message?: string } | null) {
  return Boolean(error?.message && /relation .* does not exist|column .* does not exist|schema cache/i.test(error.message));
}

async function authEmailMap(supabase: SupabaseAdmin, userIds: string[]) {
  const targets = new Set(userIds.filter(Boolean));
  const map = new Map<string, string>();
  if (!targets.size) return map;

  const perPage = 1000;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);

    for (const user of data.users) {
      if (targets.has(user.id) && user.email) map.set(user.id, user.email);
    }

    if (map.size === targets.size || data.users.length < perPage) break;
  }

  return map;
}

async function createOwnerInvite(input: {
  request: NextRequest;
  supabase: SupabaseAdmin;
  invitedBy: string;
  fazendaId: string;
  nome: string;
  email: string;
}) {
  const token = createInvitationToken();
  const expiresAt = invitationExpiresAt();

  const { data: invite, error } = await input.supabase
    .from(TABLES.convites)
    .insert({
      fazenda_id: input.fazendaId,
      funcionario_id: null,
      email: input.email,
      nome: input.nome,
      cargo: "Dono",
      papel: "dono",
      status: "pendente",
      token_hash: hashInvitationToken(token),
      invited_by: input.invitedBy,
      expires_at: expiresAt
    })
    .select("id,email,nome,cargo,papel,status,expires_at,created_at")
    .single();

  if (error) throw new Error(error.message);

  return {
    invite,
    inviteLink: invitationLink(input.request, token),
    emailSent: false
  };
}

async function updateOwnerDetails(input: {
  supabase: SupabaseAdmin;
  ranchoId: string;
  nome: string;
  email: string;
}) {
  if (!input.nome) throw new Error("owner_name_required");
  if (!isValidInviteEmail(input.email)) throw new Error("owner_email_invalid");

  const { data: owner, error: ownerError } = await input.supabase
    .from(TABLES.usuarios)
    .select("id,nome,papel")
    .eq("fazenda_id", input.ranchoId)
    .eq("papel", "dono")
    .maybeSingle();

  if (ownerError) throw new Error(ownerError.message);

  const existingAuthUser = await findAuthUserByEmail(input.supabase, input.email);
  if (existingAuthUser && existingAuthUser.id !== owner?.id) {
    throw new Error("owner_email_already_used");
  }

  const { error: farmError } = await input.supabase
    .from(TABLES.fazendas)
    .update({ dono_nome: input.nome, dono_email: input.email })
    .eq("id", input.ranchoId);

  if (farmError) throw new Error(farmError.message);

  if (owner?.id) {
    const { error: authError } = await input.supabase.auth.admin.updateUserById(owner.id, {
      email: input.email,
      email_confirm: true,
      user_metadata: { nome: input.nome }
    });

    if (authError) throw new Error(authError.message);

    const { error: profileError } = await input.supabase
      .from(TABLES.usuarios)
      .update({ nome: input.nome })
      .eq("id", owner.id)
      .eq("fazenda_id", input.ranchoId);

    if (profileError) throw new Error(profileError.message);

    const { error: whatsappError } = await input.supabase
      .from(TABLES.whatsappUsuarios)
      .update({ nome_exibicao: input.nome })
      .eq("fazenda_id", input.ranchoId)
      .eq("usuario_id", owner.id);

    if (whatsappError && !shouldIgnoreOptionalTableError(whatsappError)) throw new Error(whatsappError.message);
    return;
  }

  const { error: inviteError } = await input.supabase
    .from(TABLES.convites)
    .update({ nome: input.nome, email: input.email })
    .eq("fazenda_id", input.ranchoId)
    .eq("papel", "dono")
    .eq("status", "pendente");

  if (inviteError) throw new Error(inviteError.message);
}

async function deleteFarmCompletely(input: {
  supabase: SupabaseAdmin;
  ranchoId: string;
  currentUserId: string;
}) {
  const { data: farm, error: farmError } = await input.supabase
    .from(TABLES.fazendas)
    .select("id,nome")
    .eq("id", input.ranchoId)
    .maybeSingle();

  if (farmError) throw new Error(farmError.message);
  if (!farm) return { deletedUsers: 0, farmName: "" };

  const { data: users, error: usersError } = await input.supabase
    .from(TABLES.usuarios)
    .select("id")
    .eq("fazenda_id", input.ranchoId);

  if (usersError) throw new Error(usersError.message);

  const userIds = ((users || []) as AnyRecord[]).map((user) => String(user.id)).filter(Boolean);
  if (userIds.includes(input.currentUserId)) throw new Error("cannot_delete_own_farm");

  const tablesInDeleteOrder = [
    TABLES.whatsappMensagens,
    TABLES.whatsappSessoes,
    TABLES.whatsappUsuarios,
    TABLES.registrosPonto,
    TABLES.folhaPagamento,
    TABLES.convites,
    TABLES.estoqueMovimentacoes,
    TABLES.transacoesFinanceiras,
    TABLES.ordenhas,
    TABLES.eventosAnimal,
    TABLES.notificacoes,
    TABLES.alertas,
    TABLES.auditoriaLogs,
    TABLES.animais,
    TABLES.estoqueItens,
    TABLES.funcionarios,
    TABLES.lotes,
    TABLES.usuarios
  ];

  for (const tableName of tablesInDeleteOrder) {
    const { error } = await input.supabase.from(tableName).delete().eq("fazenda_id", input.ranchoId);
    if (error && !shouldIgnoreOptionalTableError(error)) throw new Error(`${tableName}: ${error.message}`);
  }

  const { error: deleteFarmError } = await input.supabase
    .from(TABLES.fazendas)
    .delete()
    .eq("id", input.ranchoId);

  if (deleteFarmError) throw new Error(deleteFarmError.message);

  let deletedUsers = 0;
  for (const userId of userIds) {
    const { error } = await input.supabase.auth.admin.deleteUser(userId);
    if (error && !/not found|user not found/i.test(error.message)) throw new Error(error.message);
    if (!error) deletedUsers += 1;
  }

  return { deletedUsers, farmName: String(farm.nome || "") };
}

function platformErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || "");
  if (/owner_name_required/i.test(message)) return "Informe o nome do dono.";
  if (/owner_email_invalid/i.test(message)) return "Informe um e-mail válido para o dono.";
  if (/owner_email_already_used/i.test(message)) return "Este e-mail já está vinculado a outro usuário.";
  if (/cannot_delete_own_farm/i.test(message)) return "Não é possível excluir o rancho vinculado ao admin logado.";
  if (/is_platform_admin|status|cidade|estado|dono_|schema cache|column|relation/i.test(message)) {
    return "A estrutura de Admin Interno ainda não está completa no Supabase. Execute a migration de Admin Interno e tente novamente.";
  }
  if (/duplicate key|unique constraint|23505/i.test(message)) {
    return "Já existe um registro com estes dados. Atualize a lista e tente novamente.";
  }
  return "Não foi possível concluir a ação agora. Tente novamente.";
}

export async function GET(request: NextRequest) {
  try {
    const permission = await requirePlatformAdmin(request);
    if (!permission.ok) return permission.response;

    const { data: farms, error: farmsError } = await permission.supabase
      .from(TABLES.fazendas)
      .select("id,nome,slug,plano,status,ativa,cidade,estado,created_at,dono_nome,dono_email")
      .order("created_at", { ascending: false });

    if (farmsError) throw new Error(farmsError.message);

    const farmRows = (farms || []) as AnyRecord[];
    const farmIds = farmRows.map((farm) => farm.id).filter(Boolean);

    const [{ data: users, error: usersError }, { data: invites, error: invitesError }] = await Promise.all([
      farmIds.length
        ? permission.supabase.from(TABLES.usuarios).select("id,fazenda_id,nome,papel,ativo").in("fazenda_id", farmIds)
        : Promise.resolve({ data: [], error: null }),
      farmIds.length
        ? permission.supabase.from(TABLES.convites).select("id,fazenda_id,email,nome,papel,status,expires_at,accepted_at,created_at").eq("papel", "dono").in("fazenda_id", farmIds).order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null })
    ]);

    if (usersError) throw new Error(usersError.message);
    if (invitesError) throw new Error(invitesError.message);

    const userRows = (users || []) as AnyRecord[];
    const inviteRows = (invites || []) as AnyRecord[];
    const ownerUsers = userRows.filter((user) => user.papel === "dono");
    const ownerEmailByUserId = await authEmailMap(permission.supabase, ownerUsers.map((user) => user.id));

    const payload = farmRows.map((farm) => {
      const farmUsers = userRows.filter((user) => user.fazenda_id === farm.id);
      const owner = farmUsers.find((user) => user.papel === "dono");
      const ownerInvite = inviteRows.find((invite) => invite.fazenda_id === farm.id);
      const ownerAccepted = Boolean(owner || ownerInvite?.status === "aceito");

      return {
        id: farm.id,
        nome: farm.nome,
        slug: farm.slug,
        plano: farm.plano || "mvp",
        status: statusFromFarm(farm, ownerAccepted),
        ativa: farm.ativa !== false,
        cidade: farm.cidade || "",
        estado: farm.estado || "",
        created_at: farm.created_at,
        owner: {
          nome: owner?.nome || ownerInvite?.nome || farm.dono_nome || "",
          email: owner ? ownerEmailByUserId.get(owner.id) || farm.dono_email || ownerInvite?.email || "" : ownerInvite?.email || farm.dono_email || "",
          usuario_id: owner?.id || null
        },
        users_count: farmUsers.length,
        owner_invite: ownerInvite ? {
          id: ownerInvite.id,
          email: ownerInvite.email,
          nome: ownerInvite.nome,
          status: ownerInvite.status,
          expires_at: ownerInvite.expires_at,
          accepted_at: ownerInvite.accepted_at,
          created_at: ownerInvite.created_at
        } : null
      };
    });

    return NextResponse.json({ ok: true, ranchos: payload });
  } catch (error) {
    console.error("[Platform ranchos GET]", error);
    return platformAdminError(platformErrorMessage(error), 500);
  }
}

export async function POST(request: NextRequest) {
  let createdFarmId: string | null = null;

  try {
    const permission = await requirePlatformAdmin(request);
    if (!permission.ok) return permission.response;

    const body = await request.json();
    const nome = asText(body.nome || body.ranchoNome);
    const donoNome = asText(body.donoNome || body.ownerName);
    const donoEmail = normalizeInviteEmail(body.donoEmail || body.ownerEmail);
    const donoTelefone = asText(body.donoTelefone || body.ownerPhone);
    const cidade = asText(body.cidade);
    const estado = asText(body.estado).toUpperCase().slice(0, 2);
    const plano = asText(body.plano) || "mvp";
    const status = asText(body.status) || "pendente";

    if (!nome) return platformAdminError("Informe o nome do rancho.", 400);
    if (!donoNome) return platformAdminError("Informe o nome do dono.", 400);
    if (!isValidInviteEmail(donoEmail)) return platformAdminError("Informe um e-mail válido para o dono.", 400);
    if (!["pendente", "ativo"].includes(status)) return platformAdminError("Status inicial inválido.", 400);

    const existingAuthUser = await findAuthUserByEmail(permission.supabase, donoEmail);
    if (existingAuthUser) {
      const { data: existingProfile, error: existingProfileError } = await permission.supabase
        .from(TABLES.usuarios)
        .select("id,fazenda_id")
        .eq("id", existingAuthUser.id)
        .maybeSingle();

      if (existingProfileError) throw new Error(existingProfileError.message);
      if (existingProfile?.fazenda_id) {
        return platformAdminError("Este e-mail já está vinculado a outro rancho.", 409);
      }
    }

    const farmSlug = `${slug(nome)}-${crypto.randomUUID().slice(0, 6)}`;
    const { data: farm, error: farmError } = await permission.supabase
      .from(TABLES.fazendas)
      .insert({
        nome,
        slug: farmSlug,
        timezone: "America/Sao_Paulo",
        plano,
        ativa: true,
        status,
        cidade: cidade || null,
        estado: estado || null,
        dono_nome: donoNome,
        dono_email: donoEmail,
        dono_telefone: donoTelefone || null
      })
      .select("*")
      .single();

    if (farmError) throw new Error(farmError.message);
    createdFarmId = farm.id;

    const invitation = await createOwnerInvite({
      request,
      supabase: permission.supabase,
      invitedBy: permission.user.id,
      fazendaId: farm.id,
      nome: donoNome,
      email: donoEmail
    });

    return NextResponse.json({
      ok: true,
      rancho: farm,
      invite: invitation.invite,
      inviteLink: invitation.inviteLink,
      emailSent: false,
      message: "Rancho criado com sucesso. Copie o link de convite abaixo e envie para o dono criar a própria senha."
    });
  } catch (error) {
    console.error("[Platform ranchos POST]", error);
    if (createdFarmId) {
      const permission = await requirePlatformAdmin(request).catch(() => null);
      if (permission?.ok) {
        await permission.supabase.from(TABLES.fazendas).delete().eq("id", createdFarmId);
      }
    }
    return platformAdminError(platformErrorMessage(error), 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const permission = await requirePlatformAdmin(request);
    if (!permission.ok) return permission.response;

    const body = await request.json();
    const action = asText(body.action);
    const ranchoId = asText(body.ranchoId || body.id);
    if (!ranchoId) return platformAdminError("Rancho inválido.", 400);

    if (action === "suspend" || action === "reactivate") {
      const active = action === "reactivate";
      const { error } = await permission.supabase
        .from(TABLES.fazendas)
        .update({ ativa: active, status: active ? "ativo" : "suspenso" })
        .eq("id", ranchoId);

      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, message: active ? "Rancho reativado." : "Rancho suspenso." });
    }

    if (action === "edit") {
      const payload: AnyRecord = {};
      const nome = asText(body.nome);
      const plano = asText(body.plano);
      const cidade = asText(body.cidade);
      const estado = asText(body.estado).toUpperCase().slice(0, 2);
      const status = asText(body.status);
      const donoNome = asText(body.donoNome || body.ownerName);
      const donoEmail = normalizeInviteEmail(body.donoEmail || body.ownerEmail);
      if (donoNome || donoEmail) {
        if (!donoNome) return platformAdminError("Informe o nome do dono.", 400);
        if (!isValidInviteEmail(donoEmail)) return platformAdminError("Informe um e-mail válido para o dono.", 400);
      }
      if (nome) payload.nome = nome;
      if (plano) payload.plano = plano;
      if (cidade || body.cidade === "") payload.cidade = cidade || null;
      if (estado || body.estado === "") payload.estado = estado || null;
      if (status && ["pendente", "ativo", "suspenso", "cancelado"].includes(status)) {
        payload.status = status;
        payload.ativa = status !== "suspenso" && status !== "cancelado";
      }

      const { error } = await permission.supabase.from(TABLES.fazendas).update(payload).eq("id", ranchoId);
      if (error) throw new Error(error.message);
      if (donoNome || donoEmail) {
        await updateOwnerDetails({
          supabase: permission.supabase,
          ranchoId,
          nome: donoNome,
          email: donoEmail
        });
      }
      return NextResponse.json({ ok: true, message: "Rancho atualizado." });
    }

    if (action === "regenerate_owner_invite") {
      const donoNome = asText(body.donoNome || body.ownerName);
      const donoEmail = normalizeInviteEmail(body.donoEmail || body.ownerEmail);
      if (!donoNome) return platformAdminError("Informe o nome do dono.", 400);
      if (!isValidInviteEmail(donoEmail)) return platformAdminError("Informe um e-mail válido para o dono.", 400);

      const { data: acceptedOwner, error: ownerError } = await permission.supabase
        .from(TABLES.usuarios)
        .select("id")
        .eq("fazenda_id", ranchoId)
        .eq("papel", "dono")
        .maybeSingle();

      if (ownerError) throw new Error(ownerError.message);
      if (acceptedOwner) {
        return platformAdminError("O dono deste rancho já aceitou o convite.", 409);
      }

      await permission.supabase
        .from(TABLES.convites)
        .update({ status: "cancelado" })
        .eq("fazenda_id", ranchoId)
        .eq("papel", "dono")
        .eq("status", "pendente");

      const invitation = await createOwnerInvite({
        request,
        supabase: permission.supabase,
        invitedBy: permission.user.id,
        fazendaId: ranchoId,
        nome: donoNome,
        email: donoEmail
      });

      return NextResponse.json({
        ok: true,
        invite: invitation.invite,
        inviteLink: invitation.inviteLink,
        emailSent: false,
        message: "Novo link de convite criado. Copie e envie para o dono."
      });
    }

    return platformAdminError("Ação inválida.", 400);
  } catch (error) {
    console.error("[Platform ranchos PATCH]", error);
    return platformAdminError(platformErrorMessage(error), 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const permission = await requirePlatformAdmin(request);
    if (!permission.ok) return permission.response;

    const body = await request.json().catch(() => ({}));
    const ranchoId = asText(body.ranchoId || body.id);
    if (!ranchoId) return platformAdminError("Rancho inválido.", 400);

    const result = await deleteFarmCompletely({
      supabase: permission.supabase,
      ranchoId,
      currentUserId: permission.user.id
    });

    return NextResponse.json({
      ok: true,
      deletedUsers: result.deletedUsers,
      message: result.farmName ? `Rancho ${result.farmName} excluído completamente.` : "Rancho excluído completamente."
    });
  } catch (error) {
    console.error("[Platform ranchos DELETE]", error);
    return platformAdminError(platformErrorMessage(error), 500);
  }
}
