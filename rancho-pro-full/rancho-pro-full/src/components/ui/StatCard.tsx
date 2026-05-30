import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "green"
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "green" | "lime" | "blue" | "amber" | "red" | "slate";
}) {
  const tones = {
    green: "from-emerald-500/16 to-emerald-500/4 text-emerald-700 dark:text-emerald-300",
    lime: "from-lime-500/16 to-lime-500/4 text-lime-700 dark:text-lime-300",
    blue: "from-blue-500/16 to-blue-500/4 text-blue-700 dark:text-blue-300",
    amber: "from-amber-500/16 to-amber-500/4 text-amber-700 dark:text-amber-300",
    red: "from-red-500/16 to-red-500/4 text-red-700 dark:text-red-300",
    slate: "from-slate-500/16 to-slate-500/4 text-slate-700 dark:text-slate-300"
  };

  return (
    <div className="glass card-hover rounded-lg p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{title}</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">{value}</h3>
          {hint ? <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{hint}</p> : null}
        </div>
        <div className={cn("rounded-lg bg-gradient-to-br p-3", tones[tone])}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
        <ArrowUpRight className="h-4 w-4" /> Dados sincronizados
      </div>
    </div>
  );
}
