"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getFriendlyErrorMessage, logTechnicalError } from "@/lib/errors";
import { DEMO_FAZENDA_ID, DEMO_USUARIO_ID } from "@/lib/mock-data";
import { isBrowserSupabaseConfigured, isDemoFallbackAllowed } from "@/lib/supabase/browser";
import type { DataContext, UsuarioProfile } from "@/lib/types";

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  profile: UsuarioProfile | null;
  error: string;
  isDemo: boolean;
  dataContext: DataContext;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
};

const demoProfile: UsuarioProfile = {
  id: DEMO_USUARIO_ID,
  fazenda_id: DEMO_FAZENDA_ID,
  nome: "Administrador",
  telefone: "5585999990000",
  papel: "admin",
  ativo: true,
  is_internal_tester: false,
  is_platform_admin: false,
  fazenda: {
    id: DEMO_FAZENDA_ID,
    nome: "Fazenda Modelo",
    slug: "fazenda-modelo",
    timezone: "America/Fortaleza",
    plano: "mvp",
    ativa: true
  }
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_WAIT_LIMIT_MS = 12000;
const BACKGROUND_PROFILE_REFRESH_MS = 60000;
const ACCESS_DISABLED_MESSAGE = "Seu acesso foi desativado. Entre em contato com o administrador do Rancho.";
const PROFILE_BLOCKING_MESSAGES = [
  ACCESS_DISABLED_MESSAGE,
  "Este login ainda não está vinculado a uma fazenda. Fale com o administrador.",
  "Este cadastro é exclusivo para uso pelo WhatsApp. Solicite acesso ao administrador se precisar entrar no sistema.",
  "Este rancho está inativo. Entre em contato com o administrador do Rancho."
];

async function getSupabaseBrowser() {
  const { supabaseBrowser } = await import("@/lib/supabase/browser");
  return supabaseBrowser;
}

type SupabaseBrowserClient = NonNullable<Awaited<ReturnType<typeof getSupabaseBrowser>>>;

async function waitWithLimit<T>(promise: PromiseLike<T>, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const value = await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), AUTH_WAIT_LIMIT_MS);
      })
    ]);

    return { ok: true as const, value };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err : new Error(message)
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function isProfileBlockingError(message: string) {
  return PROFILE_BLOCKING_MESSAGES.includes(message);
}

async function fetchProfile(userId: string, client: SupabaseBrowserClient) {
  const profileSelect = "id,fazenda_id,nome,telefone,papel,ativo,is_internal_tester,is_platform_admin,fazenda:fazendas(id,nome,slug,timezone,plano,ativa)";
  const internalTesterFallbackSelect = "id,fazenda_id,nome,telefone,papel,ativo,is_internal_tester,fazenda:fazendas(id,nome,slug,timezone,plano,ativa)";
  const fallbackProfileSelect = "id,fazenda_id,nome,telefone,papel,ativo,fazenda:fazendas(id,nome,slug,timezone,plano,ativa)";
  let result = await client
    .from("usuarios")
    .select(profileSelect)
    .eq("id", userId)
    .maybeSingle();

  if (result.error && /is_platform_admin|schema cache|column/i.test(result.error.message)) {
    result = await client
      .from("usuarios")
      .select(internalTesterFallbackSelect)
      .eq("id", userId)
      .maybeSingle();
  }

  if (result.error && /is_internal_tester|schema cache|column/i.test(result.error.message)) {
    result = await client
      .from("usuarios")
      .select(fallbackProfileSelect)
      .eq("id", userId)
      .maybeSingle();
  }

  const { data, error } = result;

  if (error) throw new Error("Não foi possível carregar os dados da fazenda agora.");
  if (!data) {
    throw new Error("Este login ainda não está vinculado a uma fazenda. Fale com o administrador.");
  }

  const raw = data as unknown as UsuarioProfile & { fazenda?: UsuarioProfile["fazenda"] | UsuarioProfile["fazenda"][] };
  const profile = {
    ...raw,
    fazenda: Array.isArray(raw.fazenda) ? raw.fazenda[0] || null : raw.fazenda || null
  } as UsuarioProfile;

  if (!profile.ativo) {
    throw new Error(ACCESS_DISABLED_MESSAGE);
  }

  if (profile.papel === "bot_only") {
    throw new Error("Este cadastro é exclusivo para uso pelo WhatsApp. Solicite acesso ao administrador se precisar entrar no sistema.");
  }

  if (profile.fazenda && profile.fazenda.ativa === false) {
    throw new Error("Este rancho está inativo. Entre em contato com o administrador do Rancho.");
  }

  return profile;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isBrowserSupabaseConfigured();
  const demoAllowed = isDemoFallbackAllowed();
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UsuarioProfile | null>(configured ? null : demoAllowed ? demoProfile : null);
  const [error, setError] = useState("");
  const lastBackgroundRefreshAt = useRef(0);
  const backgroundRefreshRunning = useRef(false);

  async function loadProfile(nextSession?: Session | null, options: { clearOnError?: boolean; silentOnError?: boolean } = {}) {
    const activeSession = nextSession ?? session;
    setError("");

    if (!configured) {
      setProfile(demoAllowed ? demoProfile : null);
      if (!demoAllowed) setError("Configuração do Supabase ausente. Entre em contato com o suporte.");
      return;
    }

    if (!activeSession?.user?.id) {
      setProfile(null);
      return;
    }

    const client = await getSupabaseBrowser();
    if (!client) {
      setProfile(demoAllowed ? demoProfile : null);
      if (!demoAllowed) setError("Configuração do Supabase ausente. Entre em contato com o suporte.");
      return;
    }

    const profileResult = await waitWithLimit(
      fetchProfile(activeSession.user.id, client),
      "A fazenda demorou para carregar. Confira sua internet e tente novamente."
    );

    if (profileResult.ok) {
      setProfile(profileResult.value);
      setError("");
    } else {
      const message = profileResult.error.message || "Não foi possível carregar os dados da fazenda.";
      if (isProfileBlockingError(message)) {
        await client.auth.signOut().catch(() => undefined);
        setSession(null);
        setProfile(null);
        setError(message);
        return;
      }
      if (options.silentOnError) return;
      if (options.clearOnError) setProfile(null);
      setError(message);
    }
  }

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    async function boot() {
      if (!configured) {
        if (mounted) {
          setProfile(demoAllowed ? demoProfile : null);
          if (!demoAllowed) setError("Configuração do Supabase ausente. Entre em contato com o suporte.");
          setLoading(false);
        }
        return;
      }

      const client = await getSupabaseBrowser();
      if (!mounted) return;

      if (!client) {
        setProfile(demoAllowed ? demoProfile : null);
        if (!demoAllowed) setError("Configuração do Supabase ausente. Entre em contato com o suporte.");
        setLoading(false);
        return;
      }

      const sessionResult = await waitWithLimit(
        client.auth.getSession(),
        "Não foi possível confirmar seu acesso agora. Tente novamente."
      );

      if (!mounted) return;

      if (!sessionResult.ok) {
        setSession(null);
        setProfile(null);
        logTechnicalError("Falha ao confirmar sessão", sessionResult.error);
        setError(getFriendlyErrorMessage(sessionResult.error, "Não foi possível confirmar seu acesso agora. Tente novamente."));
        setLoading(false);
        return;
      }

      const { data, error: sessionError } = sessionResult.value;
      if (sessionError) {
        setSession(null);
        setProfile(null);
        logTechnicalError("Falha ao carregar sessão", sessionError);
        setError(getFriendlyErrorMessage(sessionError, "Não foi possível confirmar seu acesso agora. Tente novamente."));
        setLoading(false);
        return;
      }

      try {
        setSession(data.session);
        await loadProfile(data.session, { clearOnError: true });
      } catch (err) {
        if (!mounted) return;
        setSession(null);
        setProfile(null);
        setError(err instanceof Error ? err.message : "Sua sessão expirou. Entre novamente.");
      } finally {
        if (mounted) setLoading(false);
      }

      const { data: subscription } = client.auth.onAuthStateChange(async (_event, nextSession) => {
        if (!mounted) return;
        setSession(nextSession);

        if (!nextSession) {
          setProfile(null);
          setError("");
          setLoading(false);
          return;
        }

        try {
          await loadProfile(nextSession);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Sua sessão expirou. Entre novamente.");
        } finally {
          if (mounted) setLoading(false);
        }
      });

      unsubscribe = () => subscription.subscription.unsubscribe();
    }

    boot().catch((err) => {
      if (!mounted) return;
      setSession(null);
      setProfile(null);
      setError(err instanceof Error ? err.message : "Não foi possível carregar o acesso agora.");
      setLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, demoAllowed]);

  useEffect(() => {
    if (!configured || !session?.user?.id) return;

    let mounted = true;
    let client: SupabaseBrowserClient | null = null;
    let channel: ReturnType<SupabaseBrowserClient["channel"]> | null = null;

    async function watchProfileAccess() {
      client = await getSupabaseBrowser();
      if (!mounted || !client || !session?.user?.id) return;

      channel = client
        .channel(`profile-access:${session.user.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "usuarios", filter: `id=eq.${session.user.id}` },
          () => {
            void loadProfile(session, { clearOnError: true });
          }
        )
        .subscribe();
    }

    void watchProfileAccess();

    return () => {
      mounted = false;
      if (client && channel) void client.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, session?.user?.id]);

  useEffect(() => {
    if (!configured || !session?.user?.id) return;

    async function revalidateProfile() {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastBackgroundRefreshAt.current < BACKGROUND_PROFILE_REFRESH_MS) return;
      if (backgroundRefreshRunning.current) return;
      lastBackgroundRefreshAt.current = Date.now();
      backgroundRefreshRunning.current = true;
      try {
        await loadProfile(session, { clearOnError: false, silentOnError: true });
      } finally {
        backgroundRefreshRunning.current = false;
      }
    }

    document.addEventListener("visibilitychange", revalidateProfile);

    return () => {
      document.removeEventListener("visibilitychange", revalidateProfile);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, session?.user?.id]);

  async function signIn(email: string, password: string) {
    const client = await getSupabaseBrowser();
    if (!client) return;

    setLoading(true);
    setError("");
    let signedIn = false;

    try {
      const signInResult = await waitWithLimit(
        client.auth.signInWithPassword({ email, password }),
        "A entrada demorou para responder. Tente novamente em instantes."
      );

      if (!signInResult.ok) throw signInResult.error;

      const { data, error: signInError } = signInResult.value;
      if (signInError) throw new Error(getFriendlyErrorMessage(signInError, "Não foi possível entrar."));

      setSession(data.session);
      if (!data.session?.user?.id) throw new Error("Não foi possível iniciar a sessão.");
      signedIn = true;

      const profileResult = await waitWithLimit(
        fetchProfile(data.session.user.id, client),
        "A fazenda demorou para carregar. Tente novamente em instantes."
      );

      if (!profileResult.ok) throw profileResult.error;
      setProfile(profileResult.value);
      setError("");
    } catch (err) {
      if (signedIn) await client.auth.signOut().catch(() => undefined);
      setSession(null);
      setProfile(null);
      setLoading(false);
      throw new Error(getFriendlyErrorMessage(err, "Não foi possível entrar."));
    }
    setLoading(false);
  }

  async function signOut() {
    const client = await getSupabaseBrowser();
    if (!client) return;

    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) throw signOutError;
    setSession(null);
    setProfile(null);
    setError("");
  }

  async function retryProfile() {
    setLoading(true);
    try {
      await loadProfile(undefined, { clearOnError: !profile });
    } finally {
      setLoading(false);
    }
  }

  const value = useMemo<AuthContextValue>(() => ({
    loading,
    session,
    profile,
    error,
    isDemo: !configured && demoAllowed,
    dataContext: {
      fazendaId: profile?.fazenda_id,
      usuarioId: profile?.id,
      papel: profile?.papel
    },
    signIn,
    signOut,
    reloadProfile: retryProfile
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [configured, demoAllowed, error, loading, profile, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth precisa estar dentro de AuthProvider.");
  return value;
}
