"use client";

import { Bell, Bot, Building2, KeyRound, Loader2, MessageCircle, Palette, Save, Settings2, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { CPFInput, WhatsAppInput } from "@/components/ui/MaskedInputs";
import { Skeleton } from "@/components/ui/Skeleton";
import { listRecords, updateRecord } from "@/services/crud";
import { TABLES } from "@/lib/tables";
import { useAuth } from "@/lib/auth-context";
import type { AnyRecord } from "@/lib/types";
import { formatBrazilianPhone, formatCPF, isValidBrazilianPhone, isValidCPF, onlyDigits, stripBrazilCountryCode } from "@/lib/input-format";

type Health = { meta: boolean; supabasePublic: boolean; supabaseServer: boolean };
type SaveKey = "farm" | "user" | "preferences" | "notifications" | "whatsapp" | "security";

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  funcionario: "Funcionário",
  veterinario: "Veterinário",
  contador: "Contador"
};

const stateOptions = ["", "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function settingsError(message: string) {
  if (/column|schema|cache|does not exist|não existe/i.test(message)) {
    return "Alguns campos de Configurações ainda não existem no Supabase. Aplique a SQL de configuração incluída no projeto e tente salvar novamente.";
  }
  return message;
}

function SectionShell({
  title,
  description,
  icon: Icon,
  children
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="glass rounded-lg p-5 shadow-soft md:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-lg bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black">{title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SaveButton({ saving, children }: { saving: boolean; children: React.ReactNode }) {
  return (
    <button className="btn btn-primary" type="submit" disabled={saving}>
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {saving ? "Salvando..." : children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span>
      {children}
    </label>
  );
}

export default function ConfiguracoesPage() {
  const router = useRouter();
  const { profile, session, isDemo, reloadProfile, signOut } = useAuth();
  const [health, setHealth] = useState<Health | null>(null);
  const [farm, setFarm] = useState<AnyRecord | null>(null);
  const [user, setUser] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SaveKey | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [farmDraft, setFarmDraft] = useState({
    nome: "",
    responsavel: "",
    telefone_contato: "",
    cidade: "",
    estado: "",
    ativa: true,
    descricao: ""
  });
  const [userDraft, setUserDraft] = useState({
    nome: "",
    telefone: "",
    cpf: "",
    cargo: ""
  });
  const [preferencesDraft, setPreferencesDraft] = useState({
    moeda: "BRL",
    formato_data: "DD/MM/AAAA",
    unidade_leite: "litros",
    unidade_peso: "kg",
    tema: "sistema",
    tela_inicial: "/dashboard"
  });
  const [notificationsDraft, setNotificationsDraft] = useState({
    estoque_baixo: true,
    financeiro: true,
    producao: true,
    ponto_funcionarios: true,
    whatsapp: false
  });
  const [whatsAppDraft, setWhatsAppDraft] = useState({
    bot_ativo: true,
    numero_conectado: "",
    mensagem_boas_vindas: "Bem-vindo ao Rancho. Escolha uma opção para continuar."
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [healthResponse, farmRows, userRows] = await Promise.all([
        fetch("/api/health").then((res) => res.json()).catch(() => null),
        profile?.fazenda_id ? listRecords(TABLES.fazendas, { filters: [{ column: "id", value: profile.fazenda_id }] }) : Promise.resolve([]),
        profile?.id ? listRecords(TABLES.usuarios, { fazendaId: profile.fazenda_id, usuarioId: profile.id, filters: [{ column: "id", value: profile.id }] }) : Promise.resolve([])
      ]);

      const nextFarm = farmRows[0] || profile?.fazenda || null;
      const nextUser = userRows[0] || profile || null;
      const farmSettings = asObject(nextFarm?.configuracoes);
      const userPreferences = asObject(nextUser?.preferencias);
      const notifications = asObject(nextFarm?.notificacoes);
      const whatsApp = asObject(nextFarm?.whatsapp_config);

      setHealth(healthResponse);
      setFarm(nextFarm);
      setUser(nextUser);
      setFarmDraft({
        nome: String(nextFarm?.nome || ""),
        responsavel: String(nextFarm?.responsavel || ""),
        telefone_contato: formatBrazilianPhone(nextFarm?.telefone_contato),
        cidade: String(nextFarm?.cidade || ""),
        estado: String(nextFarm?.estado || ""),
        ativa: nextFarm?.ativa !== false,
        descricao: String(nextFarm?.descricao || "")
      });
      setUserDraft({
        nome: String(nextUser?.nome || ""),
        telefone: formatBrazilianPhone(nextUser?.telefone),
        cpf: formatCPF(nextUser?.cpf),
        cargo: String(nextUser?.cargo || roleLabels[nextUser?.papel || ""] || "")
      });
      setPreferencesDraft({
        moeda: String(userPreferences.moeda || farmSettings.moeda || "BRL"),
        formato_data: String(userPreferences.formato_data || farmSettings.formato_data || "DD/MM/AAAA"),
        unidade_leite: String(userPreferences.unidade_leite || farmSettings.unidade_leite || "litros"),
        unidade_peso: String(userPreferences.unidade_peso || farmSettings.unidade_peso || "kg"),
        tema: String(userPreferences.tema || farmSettings.tema || "sistema"),
        tela_inicial: String(userPreferences.tela_inicial || farmSettings.tela_inicial || "/dashboard")
      });
      setNotificationsDraft({
        estoque_baixo: notifications.estoque_baixo !== false,
        financeiro: notifications.financeiro !== false,
        producao: notifications.producao !== false,
        ponto_funcionarios: notifications.ponto_funcionarios !== false,
        whatsapp: notifications.whatsapp === true
      });
      setWhatsAppDraft({
        bot_ativo: whatsApp.bot_ativo !== false,
        numero_conectado: formatBrazilianPhone(whatsApp.numero_conectado),
        mensagem_boas_vindas: String(whatsApp.mensagem_boas_vindas || "Bem-vindo ao Rancho. Escolha uma opção para continuar.")
      });
    } catch (err) {
      setError(settingsError(err instanceof Error ? err.message : "Não foi possível carregar as configurações."));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  const showSkeleton = loading || Boolean(error && !farm && !user);
  const cards = useMemo(() => [
    {
      icon: Building2,
      title: "Propriedade",
      value: farmDraft.nome || "Rancho sem nome",
      description: farmDraft.ativa ? "Rancho ativo" : "Rancho inativo"
    },
    {
      icon: UserRound,
      title: "Perfil",
      value: userDraft.nome || "Usuário",
      description: userDraft.cargo || roleLabels[profile?.papel || ""] || "Conta do sistema"
    },
    {
      icon: ShieldCheck,
      title: "Acesso",
      value: isDemo ? "Modo demonstração" : "Protegido por login",
      description: session?.user?.email || "Sessão local"
    },
    {
      icon: MessageCircle,
      title: "WhatsApp",
      value: health?.meta ? "Integração configurada" : "Integração pendente",
      description: "Status real da configuração do backend"
    }
  ], [farmDraft.ativa, farmDraft.nome, health?.meta, isDemo, profile?.papel, session?.user?.email, userDraft.cargo, userDraft.nome]);

  function showSuccess(message: string) {
    setSuccess(message);
    window.setTimeout(() => setSuccess(""), 3500);
  }

  async function saveFarm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!farm?.id) return;
    setSaving("farm");
    setError("");
    try {
      if (farmDraft.telefone_contato && !isValidBrazilianPhone(farmDraft.telefone_contato)) {
        throw new Error("Informe um WhatsApp de contato válido com DDD.");
      }
      await updateRecord(TABLES.fazendas, farm.id, {
        nome: farmDraft.nome,
        responsavel: farmDraft.responsavel || null,
        telefone_contato: stripBrazilCountryCode(farmDraft.telefone_contato) || null,
        cidade: farmDraft.cidade || null,
        estado: farmDraft.estado || null,
        ativa: farmDraft.ativa,
        descricao: farmDraft.descricao || null
      });
      await reloadProfile();
      await load();
      showSuccess("Configurações da propriedade salvas.");
    } catch (err) {
      setError(settingsError(err instanceof Error ? err.message : "Não foi possível salvar a propriedade."));
    } finally {
      setSaving(null);
    }
  }

  async function saveUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.id) return;
    setSaving("user");
    setError("");
    try {
      if (userDraft.telefone && !isValidBrazilianPhone(userDraft.telefone)) throw new Error("Informe um WhatsApp válido com DDD.");
      if (userDraft.cpf && !isValidCPF(userDraft.cpf)) throw new Error("Informe um CPF válido ou deixe o campo em branco.");
      await updateRecord(TABLES.usuarios, user.id, {
        nome: userDraft.nome,
        telefone: stripBrazilCountryCode(userDraft.telefone) || null,
        cpf: onlyDigits(userDraft.cpf) || null,
        cargo: userDraft.cargo || null
      });
      await reloadProfile();
      await load();
      showSuccess("Perfil salvo com sucesso.");
    } catch (err) {
      setError(settingsError(err instanceof Error ? err.message : "Não foi possível salvar o perfil."));
    } finally {
      setSaving(null);
    }
  }

  async function savePreferences(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.id) return;
    setSaving("preferences");
    setError("");
    try {
      await updateRecord(TABLES.usuarios, user.id, { preferencias: preferencesDraft });
      if (preferencesDraft.tema !== "sistema") {
        localStorage.setItem("rancho-theme", preferencesDraft.tema);
        document.documentElement.classList.toggle("dark", preferencesDraft.tema === "dark");
      }
      showSuccess("Preferências salvas.");
    } catch (err) {
      setError(settingsError(err instanceof Error ? err.message : "Não foi possível salvar as preferências."));
    } finally {
      setSaving(null);
    }
  }

  async function saveNotifications(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!farm?.id) return;
    setSaving("notifications");
    setError("");
    try {
      await updateRecord(TABLES.fazendas, farm.id, { notificacoes: notificationsDraft });
      showSuccess("Preferências de notificação salvas.");
    } catch (err) {
      setError(settingsError(err instanceof Error ? err.message : "Não foi possível salvar as notificações."));
    } finally {
      setSaving(null);
    }
  }

  async function saveWhatsApp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!farm?.id) return;
    setSaving("whatsapp");
    setError("");
    try {
      if (whatsAppDraft.numero_conectado && !isValidBrazilianPhone(whatsAppDraft.numero_conectado)) {
        throw new Error("Informe um número de WhatsApp válido com DDD.");
      }
      await updateRecord(TABLES.fazendas, farm.id, {
        whatsapp_config: {
          ...whatsAppDraft,
          numero_conectado: stripBrazilCountryCode(whatsAppDraft.numero_conectado) || null
        }
      });
      showSuccess("Preferências do WhatsApp salvas.");
    } catch (err) {
      setError(settingsError(err instanceof Error ? err.message : "Não foi possível salvar o WhatsApp."));
    } finally {
      setSaving(null);
    }
  }

  async function sendPasswordReset() {
    if (!session?.user?.email) return;
    setSaving("security");
    setError("");
    try {
      const { supabaseBrowser } = await import("@/lib/supabase/browser");
      if (!supabaseBrowser) throw new Error("Supabase Auth não está configurado neste ambiente.");
      const { error: resetError } = await supabaseBrowser.auth.resetPasswordForEmail(session.user.email, {
        redirectTo: `${window.location.origin}/redefinir-senha`
      });
      if (resetError) throw new Error(resetError.message);
      showSuccess("Link de redefinição enviado para o e-mail da conta.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o link de redefinição.");
    } finally {
      setSaving(null);
    }
  }

  async function handleSignOut() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setError("");
    try {
      await signOut();
      router.replace("/login");
    } catch {
      setError("Não foi possível sair da conta. Tente novamente.");
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <Settings2 className="h-4 w-4" /> Configurações
        </div>
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">Configurações</h1>
        <p className="mt-3 max-w-2xl text-slate-500 dark:text-slate-400">
          Personalize a propriedade, seu perfil, preferências do sistema e alertas usados no Rancho.
        </p>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}
      {success ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">{success}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div className="glass card-hover rounded-lg p-5" key={card.title}>
              <Icon className="h-8 w-8 text-emerald-600 dark:text-emerald-300" />
              <h2 className="mt-4 text-sm font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{card.title}</h2>
              {showSkeleton ? <Skeleton className="mt-3 h-6 w-36" /> : <p className="mt-2 text-lg font-black">{card.value}</p>}
              {showSkeleton ? <Skeleton className="mt-3 h-4 w-44" /> : <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{card.description}</p>}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionShell title="Propriedade" description="Dados usados no painel, cabeçalho e relatórios." icon={Building2}>
          {showSkeleton ? <Skeleton className="h-56 rounded-lg" /> : (
            <form onSubmit={saveFarm} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nome do rancho">
                  <input className="input" value={farmDraft.nome} onChange={(event) => setFarmDraft((current) => ({ ...current, nome: event.target.value }))} required />
                </Field>
                <Field label="Proprietário / responsável">
                  <input className="input" value={farmDraft.responsavel} onChange={(event) => setFarmDraft((current) => ({ ...current, responsavel: event.target.value }))} />
                </Field>
                <Field label="WhatsApp de contato">
                  <WhatsAppInput value={farmDraft.telefone_contato} onChange={(value) => setFarmDraft((current) => ({ ...current, telefone_contato: value }))} placeholder="(00) 00000-0000" />
                </Field>
                <Field label="Cidade">
                  <input className="input" value={farmDraft.cidade} onChange={(event) => setFarmDraft((current) => ({ ...current, cidade: event.target.value }))} />
                </Field>
                <Field label="Estado">
                  <select className="input" value={farmDraft.estado} onChange={(event) => setFarmDraft((current) => ({ ...current, estado: event.target.value }))}>
                    {stateOptions.map((state) => <option key={state || "empty"} value={state}>{state || "Selecione..."}</option>)}
                  </select>
                </Field>
                <Field label="Status do rancho">
                  <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm font-bold dark:border-slate-800 dark:bg-slate-900/70">
                    <input type="checkbox" checked={farmDraft.ativa} onChange={(event) => setFarmDraft((current) => ({ ...current, ativa: event.target.checked }))} />
                    Rancho ativo
                  </label>
                </Field>
              </div>
              <Field label="Observações da propriedade">
                <textarea className="input min-h-24 resize-y" value={farmDraft.descricao} onChange={(event) => setFarmDraft((current) => ({ ...current, descricao: event.target.value }))} />
              </Field>
              <SaveButton saving={saving === "farm"}>Salvar propriedade</SaveButton>
            </form>
          )}
        </SectionShell>

        <SectionShell title="Perfil do usuário" description="Dados pessoais do usuário logado." icon={UserRound}>
          {showSkeleton ? <Skeleton className="h-56 rounded-lg" /> : (
            <form onSubmit={saveUser} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nome do usuário">
                  <input className="input" value={userDraft.nome} onChange={(event) => setUserDraft((current) => ({ ...current, nome: event.target.value }))} required />
                </Field>
                <Field label="E-mail">
                  <input className="input bg-slate-100 text-slate-500 dark:bg-slate-900" value={session?.user?.email || "E-mail gerenciado pelo Supabase Auth"} readOnly />
                </Field>
                <Field label="WhatsApp">
                  <WhatsAppInput value={userDraft.telefone} onChange={(value) => setUserDraft((current) => ({ ...current, telefone: value }))} placeholder="(00) 00000-0000" />
                </Field>
                <Field label="CPF">
                  <CPFInput value={userDraft.cpf} onChange={(value) => setUserDraft((current) => ({ ...current, cpf: value }))} placeholder="000.000.000-00" />
                </Field>
                <Field label="Cargo / função">
                  <input className="input" value={userDraft.cargo} onChange={(event) => setUserDraft((current) => ({ ...current, cargo: event.target.value }))} />
                </Field>
                <Field label="Papel no sistema">
                  <input className="input bg-slate-100 text-slate-500 dark:bg-slate-900" value={roleLabels[profile?.papel || ""] || profile?.papel || "Usuário"} readOnly />
                </Field>
              </div>
              <SaveButton saving={saving === "user"}>Salvar perfil</SaveButton>
            </form>
          )}
        </SectionShell>

        <SectionShell title="Preferências do sistema" description="Preferências salvas por usuário." icon={Palette}>
          {showSkeleton ? <Skeleton className="h-56 rounded-lg" /> : (
            <form onSubmit={savePreferences} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Moeda padrão">
                  <select className="input" value={preferencesDraft.moeda} onChange={(event) => setPreferencesDraft((current) => ({ ...current, moeda: event.target.value }))}>
                    <option value="BRL">Real brasileiro (R$)</option>
                  </select>
                </Field>
                <Field label="Formato de data">
                  <select className="input" value={preferencesDraft.formato_data} onChange={(event) => setPreferencesDraft((current) => ({ ...current, formato_data: event.target.value }))}>
                    <option value="DD/MM/AAAA">DD/MM/AAAA</option>
                  </select>
                </Field>
                <Field label="Unidade de leite">
                  <select className="input" value={preferencesDraft.unidade_leite} onChange={(event) => setPreferencesDraft((current) => ({ ...current, unidade_leite: event.target.value }))}>
                    <option value="litros">Litros</option>
                  </select>
                </Field>
                <Field label="Unidade de peso">
                  <select className="input" value={preferencesDraft.unidade_peso} onChange={(event) => setPreferencesDraft((current) => ({ ...current, unidade_peso: event.target.value }))}>
                    <option value="kg">Quilogramas (kg)</option>
                  </select>
                </Field>
                <Field label="Tema visual">
                  <select className="input" value={preferencesDraft.tema} onChange={(event) => setPreferencesDraft((current) => ({ ...current, tema: event.target.value }))}>
                    <option value="sistema">Sistema</option>
                    <option value="light">Claro</option>
                    <option value="dark">Escuro</option>
                  </select>
                </Field>
                <Field label="Tela inicial padrão">
                  <select className="input" value={preferencesDraft.tela_inicial} onChange={(event) => setPreferencesDraft((current) => ({ ...current, tela_inicial: event.target.value }))}>
                    <option value="/dashboard">Dashboard</option>
                    <option value="/rebanho">Rebanho</option>
                    <option value="/estoque">Estoque</option>
                    <option value="/financeiro">Financeiro</option>
                    <option value="/funcionarios">Funcionários</option>
                  </select>
                </Field>
              </div>
              <SaveButton saving={saving === "preferences"}>Salvar preferências</SaveButton>
            </form>
          )}
        </SectionShell>

        <SectionShell title="Notificações" description="Preferências salvas; o envio real depende dos canais configurados." icon={Bell}>
          {showSkeleton ? <Skeleton className="h-56 rounded-lg" /> : (
            <form onSubmit={saveNotifications} className="space-y-4">
              <div className="grid gap-3">
                {[
                  ["estoque_baixo", "Alertas de estoque baixo"],
                  ["financeiro", "Alertas financeiros"],
                  ["producao", "Alertas de produção"],
                  ["ponto_funcionarios", "Alertas de ponto e funcionários"],
                  ["whatsapp", "Notificações via WhatsApp"]
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white/70 p-3 text-sm font-bold dark:border-slate-800 dark:bg-slate-900/70">
                    <span>{label}</span>
                    <input type="checkbox" checked={Boolean(notificationsDraft[key as keyof typeof notificationsDraft])} onChange={(event) => setNotificationsDraft((current) => ({ ...current, [key]: event.target.checked }))} />
                  </label>
                ))}
              </div>
              <SaveButton saving={saving === "notifications"}>Salvar notificações</SaveButton>
            </form>
          )}
        </SectionShell>

        <SectionShell title="WhatsApp e chatbot" description="Status real da integração e preferências do atendimento." icon={Bot}>
          {showSkeleton ? <Skeleton className="h-56 rounded-lg" /> : (
            <form onSubmit={saveWhatsApp} className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                <Badge tone={health?.meta ? "success" : "warning"}>{health?.meta ? "Backend configurado" : "Backend pendente"}</Badge>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  O app só salva preferências aqui. O envio real de mensagens continua dependendo do webhook e das credenciais do backend.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Número de WhatsApp da operação">
                  <WhatsAppInput value={whatsAppDraft.numero_conectado} onChange={(value) => setWhatsAppDraft((current) => ({ ...current, numero_conectado: value }))} placeholder="(00) 00000-0000" />
                </Field>
                <Field label="Bot ativo como preferência">
                  <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm font-bold dark:border-slate-800 dark:bg-slate-900/70">
                    <input type="checkbox" checked={whatsAppDraft.bot_ativo} onChange={(event) => setWhatsAppDraft((current) => ({ ...current, bot_ativo: event.target.checked }))} />
                    Bot habilitado
                  </label>
                </Field>
              </div>
              <Field label="Mensagem de boas-vindas padrão">
                <textarea className="input min-h-24 resize-y" value={whatsAppDraft.mensagem_boas_vindas} onChange={(event) => setWhatsAppDraft((current) => ({ ...current, mensagem_boas_vindas: event.target.value }))} />
              </Field>
              <SaveButton saving={saving === "whatsapp"}>Salvar WhatsApp</SaveButton>
            </form>
          )}
        </SectionShell>

        <SectionShell title="Segurança e conta" description="Ações seguras relacionadas ao acesso." icon={KeyRound}>
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white/70 p-4 text-sm dark:border-slate-800 dark:bg-slate-900/70">
              <p className="font-black">Conta</p>
              <p className="mt-1 text-slate-500 dark:text-slate-400">{session?.user?.email || "Sem e-mail autenticado neste ambiente."}</p>
              <p className="mt-3 text-slate-500 dark:text-slate-400">
                Alterações de e-mail e exclusão de conta não foram adicionadas porque exigem fluxo de confirmação próprio.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="btn btn-secondary" type="button" onClick={sendPasswordReset} disabled={saving === "security" || !session?.user?.email}>
                {saving === "security" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {saving === "security" ? "Enviando..." : "Enviar link de redefinição"}
              </button>
              {!isDemo ? (
                <button className="btn border border-red-200 bg-red-50 text-red-700 disabled:cursor-not-allowed disabled:opacity-70 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" type="button" onClick={handleSignOut} disabled={isLoggingOut}>
                  {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isLoggingOut ? "Saindo da conta..." : "Sair da conta"}
                </button>
              ) : null}
            </div>
          </div>
        </SectionShell>
      </div>
    </div>
  );
}
