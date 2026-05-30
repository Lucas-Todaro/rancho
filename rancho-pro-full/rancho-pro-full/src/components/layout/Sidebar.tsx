"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Bot,
  PawPrint,
  Home,
  Droplets,
  PackageOpen,
  Receipt,
  Settings,
  Users,
  Wallet
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/rebanho", label: "Rebanho", icon: PawPrint },
  { href: "/producao", label: "Produção", icon: Droplets },
  { href: "/estoque", label: "Estoque", icon: PackageOpen },
  { href: "/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/funcionarios", label: "Funcionários", icon: Users },
  { href: "/folha", label: "Folha", icon: Receipt },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/whatsapp", label: "WhatsApp", icon: Bot },
  { href: "/configuracoes", label: "Configurações", icon: Settings }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200/70 bg-white/70 p-4 backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-950/60 lg:block">
      <Link href="/dashboard" className="mb-8 flex items-center gap-3 rounded-3xl bg-gradient-to-br from-emerald-700 to-green-950 p-4 text-white shadow-soft">
        <div className="rounded-2xl bg-white/15 p-3">
          <PawPrint className="h-7 w-7" />
        </div>
        <div>
          <p className="text-lg font-black leading-none">Rancho Pro</p>
          <p className="mt-1 text-xs font-semibold text-emerald-100">Gestão agropecuária</p>
        </div>
      </Link>

      <nav className="space-y-1.5">
        {nav.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={cn(
              "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-800 dark:text-slate-300 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-200",
              active && "bg-emerald-100 text-emerald-900 shadow-sm dark:bg-emerald-950 dark:text-emerald-100"
            )}>
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="absolute bottom-4 left-4 right-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
        <div className="flex items-center gap-2 font-black">
          <Bell className="h-4 w-4" /> Dica
        </div>
        <p className="mt-2 text-xs leading-relaxed">Configure o Supabase no `.env` e o app sai do modo demo automaticamente.</p>
      </div>
    </aside>
  );
}
