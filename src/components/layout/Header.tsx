"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Moon, Search, Sun, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { navGroups } from "@/components/layout/navigation";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const globalDestinations = [
  { href: "/dashboard", label: "Dashboard", helper: "Visão geral da fazenda", keywords: ["inicio", "painel", "resumo", "geral"] },
  { href: "/lotes", label: "Lotes", helper: "Grupos e manejo do rebanho", keywords: ["lote", "piquete", "manejo", "grupo"] },
  { href: "/rebanho", label: "Rebanho", helper: "Animais, brincos e fases", keywords: ["animal", "animais", "brinco", "vaca", "boi", "rebanho"] },
  { href: "/eventos", label: "Eventos", helper: "Vacinas, partos e tratamentos", keywords: ["evento", "vacina", "parto", "doenca", "tratamento", "pesagem"] },
  { href: "/producao", label: "Produção", helper: "Ordenhas e litros de leite", keywords: ["leite", "ordenha", "litros", "producao"] },
  { href: "/estoque", label: "Estoque", helper: "Ração, medicamentos e insumos", keywords: ["estoque", "racao", "medicamento", "insumo", "equipamento"] },
  { href: "/financeiro", label: "Financeiro", helper: "Entradas, saídas e caixa", keywords: ["dinheiro", "receita", "despesa", "financeiro", "caixa"] },
  { href: "/funcionarios", label: "Funcionários", helper: "Equipe e contatos", keywords: ["funcionario", "equipe", "colaborador", "contato"] },
  { href: "/ponto", label: "Ponto", helper: "Entradas e saídas da equipe", keywords: ["ponto", "entrada", "saida", "horario"] },
  { href: "/folha", label: "Folha", helper: "Pagamentos e descontos", keywords: ["folha", "salario", "pagamento", "desconto"] },
  { href: "/relatorios", label: "Relatórios", helper: "Resumo para impressão", keywords: ["relatorio", "pdf", "imprimir", "resultado"] },
  { href: "/whatsapp", label: "WhatsApp", helper: "Atendimento e menu de teste", keywords: ["whatsapp", "mensagem", "chat", "telefone"] },
  { href: "/suporte", label: "Suporte", helper: "Contato para dúvidas e problemas", keywords: ["suporte", "ajuda", "email", "problema", "duvida"] },
  { href: "/configuracoes", label: "Configurações", helper: "Conta e preferências", keywords: ["configuracao", "preferencia", "conta", "perfil"] }
];

function normalizeSearch(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function findDestinations(value: string) {
  const term = normalizeSearch(value.trim());
  if (!term) return [];

  return globalDestinations
    .filter((item) => normalizeSearch(`${item.label} ${item.helper} ${item.keywords.join(" ")}`).includes(term))
    .slice(0, 6);
}

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, isDemo, signOut } = useAuth();
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const searchResults = useMemo(() => findDestinations(globalSearch), [globalSearch]);

  useEffect(() => {
    const saved = localStorage.getItem("rancho-theme");
    const isDark = saved === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("rancho-theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  }

  function goTo(href: string) {
    setGlobalSearch("");
    setSearchOpen(false);
    router.push(href);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const firstResult = findDestinations(globalSearch)[0];
    if (firstResult) goTo(firstResult.href);
  }

  return (
    <header className="no-print sticky top-0 z-20 border-b border-slate-200/60 bg-white/82 px-4 py-3 backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-950/78 md:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 lg:hidden">
          <button className="rounded-lg border border-slate-200 p-2 dark:border-slate-800" onClick={() => setOpen((value) => !value)} type="button">
            <Menu className="h-5 w-5" />
          </button>
          <strong>Rancho Pro</strong>
        </div>

        <form onSubmit={submitSearch} className="relative hidden max-w-xl flex-1 lg:block">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white/75 px-4 py-2 shadow-sm transition focus-within:border-emerald-500/60 focus-within:ring-4 focus-within:ring-emerald-700/10 dark:border-slate-800 dark:bg-slate-900/70">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              className="w-full bg-transparent text-sm outline-none"
              placeholder="Buscar atalho: animal, estoque, funcionário..."
              value={globalSearch}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
              onChange={(event) => {
                setGlobalSearch(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const firstResult = findDestinations(event.currentTarget.value)[0];
                  if (firstResult) {
                    event.preventDefault();
                    goTo(firstResult.href);
                  }
                }
              }}
            />
          </div>

          {searchOpen && globalSearch.trim() ? (
            <div className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900">
              {searchResults.length ? searchResults.map((item) => (
                <button
                  key={item.href}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => goTo(item.href)}
                  type="button"
                >
                  <span>
                    <span className="block text-sm font-black">{item.label}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{item.helper}</span>
                  </span>
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Abrir</span>
                </button>
              )) : (
                <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Nenhum atalho encontrado.</div>
              )}
            </div>
          ) : null}
        </form>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={toggleTheme} className="rounded-lg border border-slate-200 bg-white/70 p-2 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-800" type="button" title="Tema">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          {!isDemo ? (
            <button onClick={signOut} className="rounded-lg border border-slate-200 bg-white/70 p-2 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-800" type="button" title="Sair">
              <LogOut className="h-5 w-5" />
            </button>
          ) : null}
          <div className="hidden rounded-lg bg-slate-900 px-4 py-2 text-right text-white dark:bg-white dark:text-slate-900 md:block">
            <p className="text-xs text-slate-300 dark:text-slate-500">{profile?.fazenda?.nome || "Fazenda"}</p>
            <p className="text-sm font-black">{profile?.nome || "Administrador"}</p>
          </div>
        </div>
      </div>

      {open ? (
        <div className="mt-3 max-h-[calc(100vh-5.5rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-soft dark:border-slate-800 dark:bg-slate-900 lg:hidden">
          <div className="mb-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Menu</p>
              <p className="text-sm font-black text-slate-900 dark:text-slate-100">Áreas da fazenda</p>
            </div>
            <button
              className="rounded-lg border border-emerald-200 bg-white/80 p-2 text-emerald-700 dark:border-emerald-900 dark:bg-slate-950/70 dark:text-emerald-200"
              type="button"
              onClick={() => setOpen(false)}
              title="Fechar menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="space-y-4">
            {navGroups.map((group) => (
              <section key={group.label}>
                <p className="mb-2 px-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                  {group.label}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((item) => {
                    const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-w-0 items-center gap-3 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-200 dark:hover:border-emerald-900 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-200",
                          active && "border-emerald-200 bg-emerald-100 text-emerald-900 shadow-sm dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                        )}
                      >
                        <span className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-400",
                          active && "text-emerald-700 dark:text-emerald-200"
                        )}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
