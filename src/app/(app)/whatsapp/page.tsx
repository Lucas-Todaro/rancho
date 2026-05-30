"use client";

import { Bot, CheckCircle2, Copy, MessageCircle, Send, Smartphone, Webhook } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";

export default function WhatsAppPage() {
  const [origin, setOrigin] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("");
  const webhookUrl = `${origin}/api/whatsapp/webhook`;

  useEffect(() => { setOrigin(window.location.origin); }, []);

  async function sendTest() {
    setStatus("Enviando menu...");
    const response = await fetch("/api/whatsapp/send-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone })
    });
    const data = await response.json();
    setStatus(data.ok ? "Menu enviado. Confira o WhatsApp." : `Erro: ${data.error}`);
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setStatus("Copiado para a area de transferencia.");
  }

  return (
    <div className="animate-fade-in space-y-6">
      <section className="rounded-lg bg-emerald-950 p-6 text-white shadow-soft md:p-8">
        <Badge tone="success">Modulo principal</Badge>
        <h1 className="mt-5 text-4xl font-black tracking-tight md:text-5xl">Chatbot WhatsApp integrado ao seu Supabase.</h1>
        <p className="mt-4 max-w-3xl text-emerald-100">
          O fluxo grava em ordenhas, animais, transacoes_financeiras e whatsapp_sessoes usando a fazenda vinculada ao telefone.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="glass rounded-lg p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-2">
            <Webhook className="h-5 w-5 text-emerald-600" />
            <h2 className="text-xl font-black">URL do webhook</h2>
          </div>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Cadastre esta URL na Meta Cloud API depois do deploy:</p>
          <div className="flex flex-col gap-3 rounded-lg bg-slate-100 p-3 dark:bg-slate-900 md:flex-row md:items-center">
            <code className="flex-1 overflow-auto text-sm">{origin ? webhookUrl : "https://seu-projeto.vercel.app/api/whatsapp/webhook"}</code>
            <button className="btn btn-primary" onClick={() => copy(webhookUrl)} type="button"><Copy className="h-4 w-4" /> Copiar</button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <p className="font-black">Token de verificacao</p>
              <p className="mt-1 text-sm text-slate-500">Use o mesmo valor de WHATSAPP_VERIFY_TOKEN.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <p className="font-black">Telefone autorizado</p>
              <p className="mt-1 text-sm text-slate-500">Cadastre o numero em whatsapp_usuarios para definir a fazenda.</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-lg p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-2">
            <Send className="h-5 w-5 text-emerald-600" />
            <h2 className="text-xl font-black">Enviar menu de teste</h2>
          </div>
          <label className="space-y-2">
            <span className="text-sm font-bold">Telefone com DDI e DDD</span>
            <input className="input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Ex: 5585999990000" />
          </label>
          <button className="btn btn-primary mt-4 w-full" onClick={sendTest} type="button"><MessageCircle className="h-4 w-4" /> Enviar menu</button>
          {status ? <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm font-bold dark:bg-slate-900">{status}</p> : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {[
          { icon: Smartphone, title: "Menu inicial", text: "Ordenha, animal e financeiro com botoes simples." },
          { icon: Bot, title: "Fluxo guiado", text: "O bot guarda etapa em whatsapp_sessoes e so grava quando completa os dados." },
          { icon: CheckCircle2, title: "Supabase", text: "Registros entram nas tabelas reais e aparecem no painel." }
        ].map((item) => {
          const Icon = item.icon;
          return <div className="glass rounded-lg p-5 shadow-soft" key={item.title}><Icon className="h-8 w-8 text-emerald-600" /><h3 className="mt-4 text-lg font-black">{item.title}</h3><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{item.text}</p></div>;
        })}
      </div>

      <div className="glass rounded-lg p-5 shadow-soft">
        <h2 className="text-xl font-black">Fluxos prontos</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-950/30"><strong>Ordenha</strong><p className="mt-2 text-sm">Brinco, litros e origem whatsapp em ordenhas.</p></div>
          <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950/30"><strong>Animal</strong><p className="mt-2 text-sm">Brinco, categoria, raca e nascimento em animais.</p></div>
          <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/30"><strong>Financeiro</strong><p className="mt-2 text-sm">Entrada ou saida em transacoes_financeiras.</p></div>
        </div>
      </div>
    </div>
  );
}
