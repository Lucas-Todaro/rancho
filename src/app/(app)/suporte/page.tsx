"use client";

import { Mail, MessageSquare, Send, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth-context";

const supportEmail = "projeto.fazenda00@gmail.com";

function encodeMailto(value: string) {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

export default function SuportePage() {
  const { profile, session } = useAuth();
  const [name, setName] = useState(profile?.nome || "");
  const [replyEmail, setReplyEmail] = useState(session?.user?.email || "");
  const [subject, setSubject] = useState("Suporte Rancho");
  const [message, setMessage] = useState("");

  const mailtoHref = useMemo(() => {
    const body = [
      name ? `Nome: ${name}` : null,
      replyEmail ? `E-mail de retorno: ${replyEmail}` : null,
      profile?.fazenda?.nome ? `Rancho: ${profile.fazenda.nome}` : null,
      "",
      message || "Descreva aqui sua dúvida, problema ou sugestão."
    ].filter((line) => line !== null).join("\n");

    return `mailto:${supportEmail}?subject=${encodeMailto(subject || "Suporte Rancho")}&body=${encodeMailto(body)}`;
  }, [message, name, profile?.fazenda?.nome, replyEmail, subject]);

  return (
    <div className="animate-fade-in space-y-6">
      <section className="overflow-hidden rounded-lg bg-emerald-950 p-6 text-white shadow-soft md:p-8">
        <Badge tone="success">Atendimento</Badge>
        <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight md:text-5xl">Suporte</h1>
        <p className="mt-4 max-w-3xl text-emerald-100">
          Entre em contato para dúvidas, problemas ou sugestões sobre o Rancho.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="glass rounded-lg p-5 shadow-soft md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <Mail className="h-6 w-6 text-emerald-600" />
            <div>
              <h2 className="text-xl font-black">E-mail de suporte</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Use seu cliente de e-mail para enviar a mensagem.</p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <p className="text-sm text-slate-500 dark:text-slate-400">Contato</p>
            <a className="mt-1 block break-all text-lg font-black text-emerald-700 dark:text-emerald-300" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
          </div>
          <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
            <div className="mb-2 flex items-center gap-2 font-black">
              <ShieldCheck className="h-4 w-4" /> Envio real via e-mail
            </div>
            Não há backend de envio de e-mail no projeto, então o botão abre o aplicativo de e-mail do usuário com destinatário, assunto e corpo preenchidos.
          </div>
        </section>

        <section className="glass rounded-lg p-5 shadow-soft md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-emerald-600" />
            <div>
              <h2 className="text-xl font-black">Preparar mensagem</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Preencha os dados e abra o e-mail pronto para envio.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-bold">Nome</span>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold">E-mail de retorno</span>
              <input className="input" type="email" value={replyEmail} onChange={(event) => setReplyEmail(event.target.value)} />
            </label>
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-sm font-bold">Assunto</span>
            <input className="input" value={subject} onChange={(event) => setSubject(event.target.value)} />
          </label>

          <label className="mt-4 block space-y-2">
            <span className="text-sm font-bold">Mensagem</span>
            <textarea className="input min-h-36 resize-y" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Descreva sua dúvida, problema ou sugestão." />
          </label>

          <a className="btn btn-primary mt-5 w-full" href={mailtoHref}>
            <Send className="h-4 w-4" /> Enviar e-mail
          </a>
        </section>
      </div>
    </div>
  );
}
