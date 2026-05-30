"use client";

import { CheckCircle2, Copy, Database, KeyRound, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { env, isSupabaseConfigured } from "@/lib/env";
import { TABLES } from "@/lib/tables";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth-context";

export default function ConfiguracoesPage() {
  const { profile, isDemo } = useAuth();
  const [status, setStatus] = useState("");
  const [health, setHealth] = useState<{ supabasePublic: boolean; supabaseServer: boolean; meta: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/health").then((res) => res.json()).then(setHealth).catch(() => setHealth(null));
  }, []);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setStatus("Copiado.");
  }

  const envText = `NEXT_PUBLIC_SUPABASE_URL=${env.supabaseUrl || ""}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${env.supabaseAnonKey ? "********" : ""}\nSUPABASE_SERVICE_ROLE_KEY=${env.supabaseServiceRoleKey ? "********" : ""}\nSUPABASE_DEFAULT_FAZENDA_ID=${env.defaultFazendaId || ""}\nWHATSAPP_VERIFY_TOKEN=${env.whatsappVerifyToken ? "********" : ""}\nMETA_WHATSAPP_TOKEN=${env.metaWhatsappToken ? "********" : ""}\nMETA_PHONE_NUMBER_ID=${env.metaPhoneNumberId || ""}`;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <Settings2 className="h-4 w-4" /> Configuracoes
        </div>
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">Configuracoes do sistema</h1>
        <p className="mt-3 text-slate-500 dark:text-slate-400">
          Status das integracoes e mapa central das tabelas reais do seu Supabase.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="glass rounded-lg p-5 shadow-soft"><Database className="h-8 w-8 text-emerald-600" /><h2 className="mt-4 font-black">Supabase</h2><p className="mt-2">{health?.supabasePublic || isSupabaseConfigured() ? <Badge tone="success">Configurado</Badge> : <Badge tone="warning">Modo demo</Badge>}</p></div>
        <div className="glass rounded-lg p-5 shadow-soft"><KeyRound className="h-8 w-8 text-blue-600" /><h2 className="mt-4 font-black">Meta API</h2><p className="mt-2">{health?.meta ? <Badge tone="success">Configurada</Badge> : <Badge tone="warning">Pendente</Badge>}</p></div>
        <div className="glass rounded-lg p-5 shadow-soft"><CheckCircle2 className="h-8 w-8 text-amber-600" /><h2 className="mt-4 font-black">Modo</h2><p className="mt-2">{isDemo ? <Badge tone="warning">Demo local</Badge> : <Badge tone="success">Dados reais</Badge>}</p></div>
        <div className="glass rounded-lg p-5 shadow-soft"><CheckCircle2 className="h-8 w-8 text-emerald-600" /><h2 className="mt-4 font-black">Fazenda</h2><p className="mt-2 text-sm font-bold">{profile?.fazenda?.nome || "Nao vinculada"}</p></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-lg p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">Variaveis atuais</h2><button onClick={() => copy(envText)} className="btn btn-secondary" type="button"><Copy className="h-4 w-4" /> Copiar</button></div>
          <pre className="overflow-auto rounded-lg bg-slate-950 p-4 text-sm text-emerald-200">{envText}</pre>
          {status ? <p className="mt-3 text-sm font-bold text-emerald-700">{status}</p> : null}
        </div>
        <div className="glass rounded-lg p-5 shadow-soft">
          <h2 className="text-xl font-black">Mapa de tabelas</h2>
          <div className="mt-4 space-y-2">
            {Object.entries(TABLES).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-lg bg-slate-100 px-4 py-3 text-sm dark:bg-slate-900"><strong>{key}</strong><code className="text-right">{value}</code></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
