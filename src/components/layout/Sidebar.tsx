"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PawPrint } from "lucide-react";
import { navGroups } from "@/components/layout/navigation";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-72 overflow-y-auto border-r border-slate-200/70 bg-white/90 p-4 backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-950/85 lg:block">
      <Link href="/dashboard" className="mb-6 flex items-center gap-3 rounded-lg bg-emerald-900 p-4 text-white shadow-soft">
        <div className="rounded-lg bg-white/15 p-3">
          <PawPrint className="h-7 w-7" />
        </div>
        <div>
          <p className="text-lg font-black leading-none">Rancho Pro</p>
          <p className="mt-1 text-xs font-semibold text-emerald-100">Gestão agropecuária</p>
        </div>
      </Link>

      <nav className="space-y-6">
        {navGroups.map((group) => (
          <section key={group.label}>
            <p className="px-3 text-[0.68rem] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
              {group.label}
            </p>
            <div className="mt-2 space-y-1">
              {group.items.map((item) => {
                const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-800 dark:text-slate-300 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-200",
                      active && "bg-emerald-100 text-emerald-900 shadow-sm dark:bg-emerald-950 dark:text-emerald-100"
                    )}
                  >
                    <span className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition group-hover:text-emerald-700 dark:text-slate-400 dark:group-hover:text-emerald-200",
                      active && "bg-white/70 text-emerald-700 dark:bg-slate-900/70 dark:text-emerald-200"
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
    </aside>
  );
}
