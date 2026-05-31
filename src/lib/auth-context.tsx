"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/env";
import { DEMO_FAZENDA_ID, DEMO_USUARIO_ID } from "@/lib/mock-data";
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

async function fetchProfile(userId: string) {
  if (!supabaseBrowser) return demoProfile;

  const { data, error } = await supabaseBrowser
    .from("usuarios")
    .select("id,fazenda_id,nome,telefone,papel,ativo,fazenda:fazendas(id,nome,slug,timezone,plano,ativa)")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("Este login ainda nao esta vinculado a uma fazenda. Fale com o administrador.");
  }

  const raw = data as unknown as UsuarioProfile & { fazenda?: UsuarioProfile["fazenda"] | UsuarioProfile["fazenda"][] };
  return {
    ...raw,
    fazenda: Array.isArray(raw.fazenda) ? raw.fazenda[0] || null : raw.fazenda || null
  } as UsuarioProfile;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UsuarioProfile | null>(configured ? null : demoProfile);
  const [error, setError] = useState("");

  async function loadProfile(nextSession?: Session | null, options: { clearOnError?: boolean } = {}) {
    const activeSession = nextSession ?? session;
    setError("");

    if (!configured || !supabaseBrowser) {
      setProfile(demoProfile);
      return;
    }

    if (!activeSession?.user?.id) {
      setProfile(null);
      return;
    }

    const profileResult = await waitWithLimit(
      fetchProfile(activeSession.user.id),
      "A fazenda demorou para carregar. Confira sua internet e tente novamente."
    );

    if (profileResult.ok) {
      setProfile(profileResult.value);
      setError("");
    } else {
      if (options.clearOnError) setProfile(null);
      setError(profileResult.error.message || "Nao foi possivel carregar os dados da fazenda.");
    }
  }

  useEffect(() => {
    let mounted = true;

    async function boot() {
      if (!configured || !supabaseBrowser) {
        if (mounted) {
          setProfile(demoProfile);
          setLoading(false);
        }
        return;
      }

      const sessionResult = await waitWithLimit(
        supabaseBrowser.auth.getSession(),
        "Nao foi possivel confirmar seu acesso agora. Tente novamente."
      );

      if (!mounted) return;

      if (!sessionResult.ok) {
        setSession(null);
        setProfile(null);
        setError(sessionResult.error.message);
        setLoading(false);
        return;
      }

      const { data, error: sessionError } = sessionResult.value;
      if (sessionError) {
        setSession(null);
        setProfile(null);
        setError(sessionError.message);
        setLoading(false);
        return;
      }

      try {
        if (!mounted) return;

        setSession(data.session);
        await loadProfile(data.session, { clearOnError: true });
      } catch (err) {
        if (!mounted) return;
        setSession(null);
        setProfile(null);
        setError(err instanceof Error ? err.message : "Sua sessao expirou. Entre novamente.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    boot();

    if (!supabaseBrowser) return () => { mounted = false; };

    const { data: subscription } = supabaseBrowser.auth.onAuthStateChange(async (_event, nextSession) => {
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
        setError(err instanceof Error ? err.message : "Sua sessao expirou. Entre novamente.");
      } finally {
        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  async function signIn(email: string, password: string) {
    if (!supabaseBrowser) return;
    setLoading(true);
    setError("");
    let signedIn = false;

    try {
      const signInResult = await waitWithLimit(
        supabaseBrowser.auth.signInWithPassword({ email, password }),
        "A entrada demorou para responder. Tente novamente em instantes."
      );

      if (!signInResult.ok) throw signInResult.error;

      const { data, error: signInError } = signInResult.value;
      if (signInError) throw new Error(signInError.message);

      setSession(data.session);
      if (!data.session?.user?.id) throw new Error("Nao foi possivel iniciar a sessao.");
      signedIn = true;

      const profileResult = await waitWithLimit(
        fetchProfile(data.session.user.id),
        "A fazenda demorou para carregar. Tente novamente em instantes."
      );

      if (!profileResult.ok) throw profileResult.error;
      setProfile(profileResult.value);
      setError("");
    } catch (err) {
      if (!signedIn) {
        setSession(null);
        setProfile(null);
      }
      setLoading(false);
      throw err instanceof Error ? err : new Error("Nao foi possivel entrar.");
    }
    setLoading(false);
  }

  async function signOut() {
    if (!supabaseBrowser) return;
    await supabaseBrowser.auth.signOut();
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
    isDemo: !configured,
    dataContext: {
      fazendaId: profile?.fazenda_id,
      usuarioId: profile?.id
    },
    signIn,
    signOut,
    reloadProfile: retryProfile
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [configured, error, loading, profile, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth precisa estar dentro de AuthProvider.");
  return value;
}
