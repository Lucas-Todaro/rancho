import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Bot,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Droplets,
  GitFork,
  Leaf,
  LineChart,
  MessageCircle,
  PawPrint,
  Settings2,
  ShieldCheck,
  UsersRound,
  Wallet,
  Warehouse,
  type LucideIcon
} from "lucide-react";

export const metadata: Metadata = {
  title: "Rancho | Gestao agropecuaria inteligente",
  description: "Sistema de gestao agropecuaria com painel, rebanho, producao de leite, estoque, financeiro, funcionarios, genealogia e bot de WhatsApp.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "Rancho | Gestao agropecuaria inteligente",
    description: "Organize rebanho, leite, estoque, financeiro, equipe e registros pelo WhatsApp em uma plataforma para fazendas.",
    url: "/",
    siteName: "Rancho",
    locale: "pt_BR",
    type: "website"
  }
};

const SUPPORT_EMAIL = "projeto.fazenda00@gmail.com";
const CONTACT_HREF = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Quero conhecer o Rancho")}&body=${encodeURIComponent("Olá, gostaria de solicitar uma demonstração do Rancho.\n\nNome:\nFazenda:\nTelefone:")}`;

const painPoints = [
  "Informações espalhadas entre caderno, planilha e conversas.",
  "Produção, estoque e financeiro sem uma visão única.",
  "Histórico do rebanho difícil de acompanhar ao longo do tempo.",
  "Funcionários registrando dados de formas diferentes."
];

const solutions = [
  "Painel centralizado por fazenda, com indicadores claros.",
  "Registros rápidos pelo sistema ou pelo bot de WhatsApp.",
  "Confirmação antes de salvar para reduzir erros operacionais.",
  "Histórico organizado para decisões mais rápidas e seguras."
];

const features: Array<{ icon: LucideIcon; title: string; description: string }> = [
  { icon: BarChart3, title: "Dashboard geral", description: "Acompanhe produção, estoque, equipe e financeiro em uma visão simples." },
  { icon: PawPrint, title: "Gestão de rebanho", description: "Organize animais, fases, lotes e histórico individual sem perder contexto." },
  { icon: Droplets, title: "Produção de leite", description: "Registre ordenhas e acompanhe a evolução produtiva da fazenda." },
  { icon: Boxes, title: "Estoque", description: "Controle entradas, baixas, unidades e itens críticos com mais previsibilidade." },
  { icon: Wallet, title: "Financeiro", description: "Veja entradas, saídas e custos operacionais conectados aos registros." },
  { icon: UsersRound, title: "Funcionários e ponto", description: "Convide a equipe, acompanhe permissões e organize registros de ponto." },
  { icon: GitFork, title: "Genealogia", description: "Visualize relações familiares e dados importantes dos animais." },
  { icon: BellRing, title: "Notificações", description: "Receba avisos internos para acompanhar pendências e eventos relevantes." },
  { icon: Bot, title: "Bot de WhatsApp", description: "Registre dados por mensagem, com interpretação e confirmação antes de salvar." },
  { icon: Settings2, title: "Configurações", description: "Ajuste dados da fazenda e preferências sem complicar a operação." }
];

const showcaseItems = [
  { name: "Dashboard", detail: "Indicadores gerais", image: "/landing/screenshots/dashboard.png" },
  { name: "Rebanho", detail: "Animais e ficha individual", image: "/landing/screenshots/rebanho.png" },
  { name: "Genealogia", detail: "Árvore familiar dos animais", image: "/landing/screenshots/genealogia.png" },
  { name: "Produção", detail: "Ordenhas e destino do leite", image: "/landing/screenshots/producao.png" },
  { name: "Estoque", detail: "Entradas, baixas e saldo", image: "/landing/screenshots/estoque.png" },
  { name: "Financeiro", detail: "Entradas, saídas e categorias", image: "/landing/screenshots/financeiro.png" },
  { name: "Funcionários", detail: "Equipe, convites e ponto", image: "/landing/screenshots/funcionarios.png" },
  { name: "WhatsApp", detail: "Bot e números autorizados", image: "/landing/screenshots/whatsapp.png" },
  { name: "Configurações", detail: "Preferências e dados protegidos", image: "/landing/screenshots/configuracoes.png", mask: "settings" as const }
];

const steps = [
  "Cadastre sua fazenda.",
  "Organize rebanho, estoque e funcionários.",
  "Registre dados pelo painel ou WhatsApp.",
  "Acompanhe tudo pelo dashboard."
];

const benefits = [
  "Economia de tempo na rotina",
  "Menos erro de anotação",
  "Controle financeiro mais claro",
  "Histórico confiável do rebanho",
  "Decisões com mais velocidade",
  "Operação mais organizada",
  "Uso simples para a equipe"
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-emerald-800">
      <Leaf className="h-3.5 w-3.5" />
      {children}
    </p>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <article className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-soft">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 transition group-hover:bg-emerald-700 group-hover:text-white">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </article>
  );
}

function HeroMockup() {
  return (
    <div className="relative mx-auto w-full max-w-2xl animate-landing-float">
      <div className="absolute -inset-5 rounded-lg bg-emerald-300/20 blur-3xl" />
      <div className="relative overflow-hidden rounded-lg border border-white/70 bg-white shadow-2xl shadow-emerald-950/10">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 text-xs font-bold text-slate-500">rancho.app/dashboard</span>
        </div>
        <div className="grid gap-4 bg-gradient-to-br from-white to-emerald-50 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Painel da fazenda</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Fazenda Modelo</h2>
            </div>
            <div className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-black text-white shadow-lg shadow-emerald-700/20">Acompanhamento ativo</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Produção", "1.248 L", "Últimos 30 dias"],
              ["Resultado", "R$ 18,4 mil", "Entradas menos saídas"],
              ["Rebanho", "126", "Animais ativos"]
            ].map(([label, value, helper]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold text-slate-500">{label}</p>
                <p className="mt-3 text-2xl font-black text-slate-950">{value}</p>
                <p className="mt-1 text-xs text-emerald-700">{helper}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="font-black text-slate-900">Produção recente</p>
                <LineChart className="h-4 w-4 text-emerald-700" />
              </div>
              <div className="mt-5 flex h-28 items-end gap-2">
                {[42, 68, 54, 86, 72, 94, 80].map((height, index) => (
                  <div key={index} className="flex-1 rounded-t bg-emerald-600/80" style={{ height: `${height}%` }} />
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="font-black text-slate-900">Registros de hoje</p>
              <div className="mt-4 space-y-3">
                {["B-002 deu 32 litros", "Entrada de sal mineral", "Ponto registrado"].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenshotMockup({ item }: { item: (typeof showcaseItems)[number] }) {
  return (
    <article className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-soft">
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
        <Image
          src={item.image}
          alt={`Tela do Rancho: ${item.name}`}
          width={2160}
          height={1350}
          unoptimized
          loading="lazy"
          decoding="async"
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.015]"
        />
        <div className="absolute right-[2.5%] top-[2.8%] flex h-[8.5%] w-[19%] items-center justify-center rounded-lg border border-white/50 bg-white/70 px-2 text-center text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 shadow-sm backdrop-blur-md">
          Dados protegidos
        </div>
        {item.mask === "settings" ? (
          <>
            <div className="absolute left-[60%] top-[32%] h-[15%] w-[31%] rounded-lg border border-white/50 bg-white/70 shadow-sm backdrop-blur-md" />
            <div className="absolute left-[60%] top-[64%] h-[19%] w-[31%] rounded-lg border border-white/50 bg-white/70 shadow-sm backdrop-blur-md" />
          </>
        ) : null}
      </div>
      <div className="border-t border-slate-100 p-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">{item.detail}</p>
        <h3 className="mt-1 text-xl font-black text-slate-950">{item.name}</h3>
      </div>
    </article>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f8fafc] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/90 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="#topo" className="flex items-center gap-3 font-black text-slate-950">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-800 text-white shadow-lg shadow-emerald-900/20">
              <Leaf className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-lg leading-tight">Rancho</span>
              <span className="block text-xs font-bold text-slate-500">Gestão agropecuária</span>
            </span>
          </a>
          <div className="hidden items-center gap-6 text-sm font-bold text-slate-600 md:flex">
            <a className="transition hover:text-emerald-700" href="#funcionalidades">Funcionalidades</a>
            <a className="transition hover:text-emerald-700" href="#whatsapp">WhatsApp</a>
            <a className="transition hover:text-emerald-700" href="#prints">Telas</a>
            <a className="transition hover:text-emerald-700" href="#contato">Contato</a>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 sm:inline-flex">
              Entrar
            </Link>
            <a href={CONTACT_HREF} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-black text-white shadow-lg shadow-emerald-800/20 transition hover:-translate-y-0.5 hover:bg-emerald-800">
              Solicitar demonstração
            </a>
          </div>
        </nav>
      </header>

      <section id="topo" className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(16,185,129,0.20),transparent_32rem),radial-gradient(circle_at_88%_12%,rgba(34,197,94,0.14),transparent_26rem)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-24">
          <div className="animate-fade-in">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-sm font-black text-emerald-800 shadow-sm">
              <ShieldCheck className="h-4 w-4" />
              Plataforma para fazendas que querem mais controle
            </div>
            <h1 className="max-w-3xl text-4xl font-black leading-tight text-slate-950 sm:text-5xl lg:text-6xl">
              Gestão agropecuária inteligente para fazendas modernas
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              O Rancho centraliza rebanho, produção, estoque, financeiro, funcionários, genealogia e registros pelo WhatsApp em um só lugar.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={CONTACT_HREF} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-6 py-3 text-base font-black text-white shadow-xl shadow-emerald-800/20 transition hover:-translate-y-1 hover:bg-emerald-800">
                Quero conhecer
                <ArrowRight className="h-5 w-5" />
              </a>
              <a href="#funcionalidades" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-3 text-base font-black text-slate-800 shadow-sm transition hover:-translate-y-1 hover:border-emerald-300 hover:text-emerald-700">
                Ver funcionalidades
                <ChevronRight className="h-5 w-5" />
              </a>
            </div>
            <div className="mt-8 grid max-w-xl gap-3 text-sm font-bold text-slate-600 sm:grid-cols-3">
              {["Sem depender de planilhas", "Registro com confirmação", "Painel claro para decisão"].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <HeroMockup />
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <SectionLabel>O problema</SectionLabel>
          <h2 className="text-3xl font-black text-slate-950">Quando os dados ficam espalhados, a fazenda perde velocidade.</h2>
          <div className="mt-6 space-y-3">
            {painPoints.map((point) => (
              <div key={point} className="flex gap-3 rounded-lg bg-slate-50 p-4 text-sm font-bold leading-6 text-slate-700">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                {point}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-950 p-6 text-white shadow-soft">
          <SectionLabel>A solução</SectionLabel>
          <h2 className="text-3xl font-black">O Rancho organiza a operação sem complicar a rotina.</h2>
          <div className="mt-6 space-y-3">
            {solutions.map((solution) => (
              <div key={solution} className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.08] p-4 text-sm font-bold leading-6 text-emerald-50">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                {solution}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="funcionalidades" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <SectionLabel>Funcionalidades</SectionLabel>
          <h2 className="text-3xl font-black text-slate-950 sm:text-4xl">Tudo que a fazenda precisa acompanhar, em uma experiência única.</h2>
          <p className="mt-4 text-base leading-7 text-slate-600">Cards diretos, filtros claros e registros conectados para transformar a rotina em informação útil.</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {features.map((feature) => <FeatureCard key={feature.title} {...feature} />)}
        </div>
      </section>

      <section id="whatsapp" className="bg-slate-950 py-16 text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-emerald-200">
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp integrado
            </p>
            <h2 className="text-3xl font-black sm:text-4xl">Registre dados da operação sem tirar a equipe do WhatsApp.</h2>
            <p className="mt-5 text-base leading-8 text-slate-300">
              O funcionário envia a mensagem, o bot interpreta, pede confirmação e só então salva no sistema. O dado aparece no painel para acompanhamento.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {["Interpretação automática de mensagens", "Confirmação antes de salvar", "Menos retrabalho no escritório", "Registro conectado ao painel"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm font-bold text-slate-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4 shadow-2xl">
            <div className="rounded-lg bg-[#0b141a] p-4">
              <div className="mb-5 flex items-center gap-3 border-b border-white/10 pb-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-black text-white">Bot Rancho</p>
                  <p className="text-xs text-emerald-300">online para registros da fazenda</p>
                </div>
              </div>
              <div className="space-y-4 text-sm">
                <div className="ml-auto max-w-[82%] rounded-lg bg-[#005c4b] px-4 py-3 font-bold text-white">B-002 deu 32 litros</div>
                <div className="max-w-[88%] rounded-lg bg-[#202c33] px-4 py-3 leading-6 text-slate-100">
                  Entendi que você quer registrar produção de leite da B-002 com 32 litros. Está correto?
                </div>
                <div className="ml-auto max-w-[70%] rounded-lg bg-[#005c4b] px-4 py-3 font-bold text-white">Sim</div>
                <div className="max-w-[80%] rounded-lg bg-[#202c33] px-4 py-3 font-bold text-emerald-200">Registro salvo com sucesso.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="prints" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <SectionLabel>Prévia do sistema</SectionLabel>
            <h2 className="text-3xl font-black text-slate-950 sm:text-4xl">Telas pensadas para controle rápido e leitura fácil.</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Capturas reais do Rancho em ambiente demonstrativo, com áreas pessoais mascaradas para proteger nome, e-mail, telefone e dados de configuração.
            </p>
          </div>
          <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-1 hover:border-emerald-300 hover:text-emerald-700">
            Acessar área do sistema
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {showcaseItems.map((item) => <ScreenshotMockup key={item.name} item={item} />)}
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <SectionLabel>Como funciona</SectionLabel>
            <h2 className="text-3xl font-black text-slate-950 sm:text-4xl">Do cadastro ao acompanhamento, sem excesso de etapas.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {steps.map((step, index) => (
              <div key={step} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-700 text-lg font-black text-white">{index + 1}</div>
                <p className="text-lg font-black leading-7 text-slate-950">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
        <div>
          <SectionLabel>Benefícios</SectionLabel>
          <h2 className="text-3xl font-black text-slate-950 sm:text-4xl">Mais clareza para quem decide e mais facilidade para quem registra.</h2>
          <p className="mt-4 text-base leading-7 text-slate-600">O Rancho foi pensado para a rotina real da fazenda: simples para usar, completo para acompanhar.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {benefits.map((benefit) => (
            <div key={benefit} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm font-black text-slate-800 shadow-sm">
              <Clock3 className="h-5 w-5 shrink-0 text-emerald-700" />
              {benefit}
            </div>
          ))}
        </div>
      </section>

      <section id="contato" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-lg bg-gradient-to-br from-emerald-800 to-slate-950 p-8 text-center text-white shadow-2xl shadow-emerald-950/20 sm:p-12">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-white/10 text-emerald-200">
            <Warehouse className="h-7 w-7" />
          </div>
          <h2 className="text-3xl font-black sm:text-4xl">Quer ver o Rancho funcionando na sua fazenda?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-emerald-50">
            Solicite uma demonstração e veja como organizar rebanho, estoque, produção, financeiro e WhatsApp em uma rotina mais clara.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a href={CONTACT_HREF} className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-base font-black text-emerald-800 transition hover:-translate-y-1 hover:bg-emerald-50">
              Solicitar demonstração
              <ArrowRight className="h-5 w-5" />
            </a>
            <a href={CONTACT_HREF} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-6 py-3 text-base font-black text-white transition hover:-translate-y-1 hover:bg-white/10">
              Entrar em contato
            </a>
          </div>
          <p className="mt-5 text-sm font-bold text-emerald-100">E-mail: {SUPPORT_EMAIL}</p>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-sm text-slate-600 md:flex-row md:items-center">
          <div>
            <p className="text-lg font-black text-slate-950">Rancho</p>
            <p className="mt-1">Gestão agropecuária</p>
          </div>
          <p>Sistema em evolução para gestão inteligente de fazendas.</p>
          <a className="font-black text-emerald-700 transition hover:text-emerald-900" href={CONTACT_HREF}>{SUPPORT_EMAIL}</a>
        </div>
      </footer>
    </main>
  );
}
