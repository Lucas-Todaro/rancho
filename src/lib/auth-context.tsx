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
const AUTH_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: PromiseLike<T>, message = "Tempo de conexao esgotado. Tente entrar novamente.") {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS);
  });

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timeoutId));
}

async function fetchProfile(userId: string) {
  if (!supabaseBrowser) return demoProfile;

  const { data, error } = await withTimeout(
    supabaseBrowser
      .from("usuarios")
      .select("id,fazenda_id,nome,telefone,papel,ativo,fazenda:fazendas(id,nome,slug,timezone,plano,ativa)")
      .eq("id", userId)
      .maybeSingle()
  );

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

  async function loadProfile(nextSession?: Session | null) {
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

    try {
      setProfile(await fetchProfile(activeSession.user.id));
    } catch (err) {
      setProfile(null);
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar o perfil.");
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

      try {
        const { data } = await withTimeout(supabaseBrowser.auth.getSession());
        if (!mounted) return;

        setSession(data.session);
        await loadProfile(data.session);
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
      setSession(nextSession);
      try {
        await withTimeout(loadProfile(nextSession));
      } catch (err) {
        setSession(null);
        setProfile(null);
        setError(err instanceof Error ? err.message : "Sua sessao expirou. Entre novamente.");
      } finally {
        setLoading(false);
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
    try {
      const { data, error: signInError } = await withTimeout(supabaseBrowser.auth.signInWithPassword({ email, password }));
      if (signInError) throw new Error(signInError.message);

      setSession(data.session);
      await withTimeout(loadProfile(data.session));
    } catch (err) {
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
    reloadProfile: () => loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [configured, error, loading, profile, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth precisa estar dentro de AuthProvider.");
  return value;
}
