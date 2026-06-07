"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, LogOut, Menu, Moon, Search, Sun, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { navGroups } from "@/components/layout/navigation";
import { NotificationsMenu } from "@/components/layout/NotificationsMenu";
import { useAuth } from "@/lib/auth-context";
import { canAccessPlatformAdmin } from "@/lib/platform-admin";
import { canViewPath } from "@/lib/permissions";
import { cn } from "@/lib/utils";
//henrique eh gay
const globalDestinations = [
  { href: "/dashboard", label: "Dashboard", helper: "Visão geral da fazenda", keywords: ["inicio", "painel", "resumo", "geral"] },
  { href: "/lotes", label: "Lotes", helper: "Grupos e manejo do rebanho", keywords: ["lote", "piquete", "manejo", "grupo"] },
  { href: "/rebanho", label: "Rebanho", helper: "Animais, brincos e fases", keywords: ["animal", "animais", "brinco", "vaca", "boi", "rebanho"] },
  { href: "/genealogia", label: "Genealogia", helper: "Árvore familiar dos animais", keywords: ["genealogia", "familia", "pai", "mae", "filhos", "arvore"] },
  { href: "/eventos", label: "Eventos", helper: "Vacinas, partos e tratamentos", keywords: ["evento", "vacina", "parto", "doenca", "tratamento", "pesagem"] },
  { href: "/producao", label: "Produção", helper: "Ordenhas e litros de leite", keywords: ["leite", "ordenha", "litros", "producao"] },
  { href: "/estoque", label: "Estoque", helper: "Ração, medicamentos e insumos", keywords: ["estoque", "racao", "medicamento", "insumo", "equipamento"] },
  { href: "/financeiro", label: "Financeiro", helper: "Entradas, saídas e caixa", keywords: ["dinheiro", "receita", "despesa", "financeiro", "caixa"] },
  { href: "/funcionarios", label: "Funcionários", helper: "Equipe e contatos", keywords: ["funcionario", "equipe", "colaborador", "contato"] },
  { href: "/ponto", label: "Ponto", helper: "Entradas e saídas da equipe", keywords: ["ponto", "entrada", "saida", "horario"] },
  { href: "/folha", label: "Folha", helper: "Pagamentos e descontos", keywords: ["folha", "salario", "pagamento", "desconto"] },
  { href: "/relatorios", label: "Relatórios", helper: "Resumo para impressão", keywords: ["relatorio", "pdf", "imprimir", "resultado"] },
  { href: "/whatsapp", label: "WhatsApp", helper: "Atendimento e mensagens do bot", keywords: ["whatsapp", "mensagem", "chat", "telefone"] },
  { href: "/admin-interno", label: "Admin Interno", helper: "Clientes, ranchos e convites de donos", keywords: ["admin", "interno", "clientes", "fazendas", "ranchos"] },
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
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const isPlatformAdmin = canAccessPlatformAdmin(profile);
  const visibleGroups = useMemo(() => (
    navGroups
      .map((group) => ({ ...group, items: group.items.filter((item) => (!item.platformOnly || isPlatformAdmin) && canViewPath(profile, item.href)) }))
      .filter((group) => group.items.length)
  ), [isPlatformAdmin, profile]);

  const searchResults = useMemo(() => (
    findDestinations(globalSearch).filter((item) => (isPlatformAdmin || item.href !== "/admin-interno") && canViewPath(profile, item.href))
  ), [globalSearch, isPlatformAdmin, profile]);

  useEffect(() => {
    const saved = localStorage.getItem("rancho-theme");
    const isDark = saved === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("rancho-theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  }

  function goTo(href: string) {
    setGlobalSearch("");
    setSearchOpen(false);
    setOpen(false);
    router.push(href);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const firstResult = searchResults[0];
    if (firstResult) goTo(firstResult.href);
  }

  async function handleSignOut() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError("");
    try {
      await signOut();
      router.replace("/login");
    } catch {
      setLogoutError("Não foi possível sair da conta. Tente novamente.");
      setIsLoggingOut(false);
    }
  }

  return (
    <>
      <header className="no-print sticky top-0 z-20 border-b border-slate-200/60 bg-white/95 px-4 py-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95 md:bg-white/82 md:px-8 md:backdrop-blur-2xl md:dark:bg-slate-950/78">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3 lg:hidden">
            <button
              className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              onClick={() => setOpen((value) => !value)}
              type="button"
              aria-controls="mobile-navigation"
              aria-expanded={open}
              title={open ? "Fechar menu" : "Abrir menu"}
            >
              <Menu className="h-5 w-5" />
            </button>
            <strong className="min-w-0 truncate text-base">Rancho Pro</strong>
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
                    const firstResult = searchResults[0];
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

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <NotificationsMenu />
            <button onClick={toggleTheme} className="rounded-lg border border-slate-200 bg-white/70 p-2 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-800" type="button" title="Tema">
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            {logoutError ? <span className="hidden text-xs font-bold text-red-700 dark:text-red-300 md:inline">{logoutError}</span> : null}
            {!isDemo ? (
              <button onClick={handleSignOut} disabled={isLoggingOut} className="rounded-lg border border-slate-200 bg-white/70 p-2 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-800" type="button" title={isLoggingOut ? "Saindo da conta..." : "Sair"}>
                {isLoggingOut ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
              </button>
            ) : null}
            <div className="hidden rounded-lg bg-slate-900 px-4 py-2 text-right text-white dark:bg-white dark:text-slate-900 md:block">
              <p className="text-xs text-slate-300 dark:text-slate-500">{profile?.fazenda?.nome || "Fazenda"}</p>
              <p className="text-sm font-black">{profile?.nome || "Administrador"}</p>
            </div>
          </div>
        </div>

        {isLoggingOut ? (
          <div className="absolute inset-x-0 top-full z-40 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            Saindo da conta...
          </div>
        ) : null}
      </header>

      {open ? (
        <div className="no-print lg:hidden">
          <button
            className="fixed inset-0 z-40 cursor-default bg-slate-950/35"
            type="button"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
          />
          <section
            id="mobile-navigation"
            className="fixed inset-x-3 bottom-3 top-[5.25rem] z-50 isolate flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="m-3 mb-0 flex shrink-0 items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/40">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Menu</p>
                <p className="text-sm font-black text-slate-900 dark:text-slate-100">Áreas da fazenda</p>
              </div>
              <button
                className="rounded-lg border border-emerald-200 bg-white p-2 text-emerald-700 shadow-sm dark:border-emerald-900 dark:bg-slate-900 dark:text-emerald-200"
                type="button"
                onClick={() => setOpen(false)}
                title="Fechar menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-white p-3 dark:bg-slate-950">
              {visibleGroups.map((group) => (
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
                            "flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-900 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-200",
                            active && "border-emerald-200 bg-emerald-100 text-emerald-900 shadow-sm dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                          )}
                        >
                          <span className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 dark:bg-slate-950 dark:text-slate-400",
                            active && "bg-white text-emerald-700 dark:bg-slate-900 dark:text-emerald-200"
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
          </section>
        </div>
      ) : null}
    </>
  );
}
