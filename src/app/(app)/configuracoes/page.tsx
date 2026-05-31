"use client";

import { Building2, CheckCircle2, Clock3, MessageCircle, Palette, Settings2, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth-context";

type Health = { meta: boolean };

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  funcionario: "Funcionario",
  veterinario: "Veterinario",
  contador: "Contador"
};

export default function ConfiguracoesPage() {
  const { profile } = useAuth();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/health").then((res) => res.json()).then(setHealth).catch(() => setHealth(null));
  }, []);

  const cards = [
    {
      icon: Building2,
      title: "Fazenda",
      value: profile?.fazenda?.nome || "Minha fazenda",
      description: "Nome usado nos paineis, relatorios e atendimentos."
    },
    {
      icon: UserRound,
      title: "Conta",
      value: profile?.nome || "Administrador",
      description: roleLabels[profile?.papel || ""] || "Usuario"
    },
    {
      icon: ShieldCheck,
      title: "Acesso",
      value: "Protegido por login",
      description: "Cada usuario entra com seu proprio e-mail e senha."
    },
    {
      icon: MessageCircle,
      title: "WhatsApp",
      value: health?.meta ? "Pronto para uso" : "Aguardando ativacao",
      description: "Envio de mensagens e menus para o telefone da fazenda."
    }
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <Settings2 className="h-4 w-4" /> Configuracoes
        </div>
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">Preferencias do sistema</h1>
        <p className="mt-3 max-w-2xl text-slate-500 dark:text-slate-400">
          Ajustes simples para acompanhar sua fazenda, sua conta e os recursos mais usados no dia a dia.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div className="glass card-hover rounded-lg p-5" key={card.title}>
              <Icon className="h-8 w-8 text-emerald-600 dark:text-emerald-300" />
              <h2 className="mt-4 text-sm font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{card.title}</h2>
              <p className="mt-2 text-lg font-black">{card.value}</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{card.description}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <section className="glass rounded-lg p-5 shadow-soft md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <Palette className="h-6 w-6 text-emerald-600" />
            <div>
              <h2 className="text-xl font-black">Experiencia de uso</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Preferencias que deixam o sistema mais confortavel.</p>
            </div>
          </div>
          <div className="space-y-3">
            {[
              "Alterne entre tema claro e escuro pelo botao no topo.",
              "Use a busca global para chegar rapido em qualquer area.",
              "Abra relatorios e escolha imprimir ou salvar em PDF.",
              "Use os filtros das listas para encontrar registros sem procurar linha por linha."
            ].map((item) => (
              <div key={item} className="flex gap-3 rounded-lg border border-slate-200/70 bg-white/65 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/55">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="glass rounded-lg p-5 shadow-soft md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <Clock3 className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-black">Areas ativas</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Principais controles disponiveis para a fazenda.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {["Rebanho", "Producao", "Estoque", "Financeiro", "Equipe", "Relatorios"].map((item) => (
              <div key={item} className="rounded-lg bg-slate-100 px-4 py-3 text-sm font-black dark:bg-slate-900">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="mb-2">
              <Badge tone={health?.meta ? "success" : "warning"}>{health?.meta ? "WhatsApp ativo" : "WhatsApp pendente"}</Badge>
            </div>
            <p className="text-emerald-900 dark:text-emerald-100">
              Quando o WhatsApp estiver ativo, os menus de atendimento ajudam a registrar informacoes da rotina com menos digitacao.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
