"use client";

import Link from "next/link";
import { Menu, Moon, Search, Sun, Wifi, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const mobileLinks = [
  ["/dashboard", "Dashboard"],
  ["/lotes", "Lotes"],
  ["/rebanho", "Rebanho"],
  ["/eventos", "Eventos"],
  ["/producao", "Producao"],
  ["/estoque", "Estoque"],
  ["/financeiro", "Financeiro"],
  ["/funcionarios", "Funcionarios"],
  ["/ponto", "Ponto"],
  ["/folha", "Folha"],
  ["/whatsapp", "WhatsApp"]
];

export function Header() {
  const { profile, isDemo, signOut } = useAuth();
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);

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

  return (
    <header className="no-print sticky top-0 z-20 border-b border-slate-200/60 bg-white/82 px-4 py-3 backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-950/78 md:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 lg:hidden">
          <button className="rounded-lg border border-slate-200 p-2 dark:border-slate-800" onClick={() => setOpen((value) => !value)} type="button">
            <Menu className="h-5 w-5" />
          </button>
          <strong>Rancho Pro</strong>
        </div>

        <div className="hidden max-w-xl flex-1 items-center gap-3 rounded-lg border border-slate-200 bg-white/70 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/70 lg:flex">
          <Search className="h-4 w-4 text-slate-400" />
          <input className="w-full bg-transparent text-sm outline-none" placeholder="Busca global: animal, estoque, funcionario..." />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className={cn("hidden items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold md:flex", !isDemo ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200")}>
            <Wifi className="h-4 w-4" /> {!isDemo ? "Supabase online" : "Modo demo"}
          </div>
          <button onClick={toggleTheme} className="rounded-lg border border-slate-200 bg-white/70 p-2 dark:border-slate-800 dark:bg-slate-900/70" type="button" title="Tema">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          {!isDemo ? (
            <button onClick={signOut} className="rounded-lg border border-slate-200 bg-white/70 p-2 dark:border-slate-800 dark:bg-slate-900/70" type="button" title="Sair">
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
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-soft dark:border-slate-800 dark:bg-slate-900 lg:hidden">
          {mobileLinks.map(([href, label]) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold dark:bg-slate-800">
              {label}
            </Link>
          ))}
        </div>
      ) : null}
    </header>
  );
}
