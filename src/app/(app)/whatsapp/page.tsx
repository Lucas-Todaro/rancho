"use client";

import { Bot, CheckCircle2, MessageCircle, Send, Smartphone, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";

export default function WhatsAppPage() {
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("");

  async function sendTest() {
    setStatus("Enviando menu...");
    const response = await fetch("/api/whatsapp/send-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone })
    });
    const data = await response.json().catch(() => ({}));
    setStatus(data.ok ? "Menu enviado. Confira o WhatsApp." : "Não foi possível enviar agora. Confira se o WhatsApp está ativo.");
  }

  return (
    <div className="animate-fade-in space-y-6">
      <section className="overflow-hidden rounded-lg bg-emerald-950 p-6 text-white shadow-soft md:p-8">
        <Badge tone="success">Atendimento rápido</Badge>
        <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight md:text-5xl">WhatsApp para a rotina da fazenda.</h1>
        <p className="mt-4 max-w-3xl text-emerald-100">
          Envie um menu simples para registrar ordenha, animal ou financeiro direto pelo telefone, sem precisar abrir todas as telas.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="glass rounded-lg p-5 shadow-soft md:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Send className="h-5 w-5 text-emerald-600" />
            <h2 className="text-xl font-black">Enviar menu de teste</h2>
          </div>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Informe um telefone com DDI e DDD para receber o menu de atendimento.
          </p>
          <label className="space-y-2">
            <span className="text-sm font-bold">Telefone</span>
            <input className="input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Ex: 5585999990000" />
          </label>
          <button className="btn btn-primary mt-4 w-full" onClick={sendTest} type="button" disabled={!phone.trim()}>
            <MessageCircle className="h-4 w-4" /> Enviar menu
          </button>
          {status ? <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm font-bold dark:bg-slate-900">{status}</p> : null}
        </div>

        <div className="glass rounded-lg p-5 shadow-soft md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-amber-500" />
            <div>
              <h2 className="text-xl font-black">Como ajuda no campo</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Menos digitação e menos perda de informação.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              "Recebe menus com botões simples.",
              "Guia o preenchimento passo a passo.",
              "Evita esquecer litros, valores e observações.",
              "Mantém os registros aparecendo no painel."
            ].map((item) => (
              <div key={item} className="flex gap-3 rounded-lg border border-slate-200/70 bg-white/65 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/55">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {[
          { icon: Smartphone, title: "Menu inicial", text: "Opções claras para começar um registro pelo telefone." },
          { icon: Bot, title: "Fluxo guiado", text: "O atendimento pergunta uma coisa por vez até completar o registro." },
          { icon: CheckCircle2, title: "Painel atualizado", text: "As informações aparecem nas áreas certas do sistema." }
        ].map((item) => {
          const Icon = item.icon;
          return <div className="glass card-hover rounded-lg p-5" key={item.title}><Icon className="h-8 w-8 text-emerald-600" /><h3 className="mt-4 text-lg font-black">{item.title}</h3><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{item.text}</p></div>;
        })}
      </div>

      <div className="glass rounded-lg p-5 shadow-soft md:p-6">
        <h2 className="text-xl font-black">Fluxos prontos</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-950/30"><strong>Ordenha</strong><p className="mt-2 text-sm">Brinco do animal, litros e observações.</p></div>
          <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950/30"><strong>Animal</strong><p className="mt-2 text-sm">Cadastro básico com brinco, categoria e raça.</p></div>
          <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/30"><strong>Financeiro</strong><p className="mt-2 text-sm">Entrada ou saída com valor e descrição.</p></div>
        </div>
      </div>
    </div>
  );
}
