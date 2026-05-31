import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "green",
  loading = false
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "green" | "lime" | "blue" | "amber" | "red" | "slate";
  loading?: boolean;
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
    <div className="glass card-hover flex h-full min-w-0 flex-col rounded-lg p-5 shadow-soft">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{title}</p>
        </div>
        <div className={cn("shrink-0 rounded-lg bg-gradient-to-br p-3", tones[tone])}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-3 h-8 w-3/4 max-w-48" />
          {hint ? <Skeleton className="mt-3 h-4 w-32" /> : null}
        </>
      ) : (
        <>
          <h3 className="mt-2 max-w-full truncate text-[clamp(1.08rem,1.55vw,1.55rem)] font-black leading-tight tracking-tight tabular-nums" title={String(value)}>{value}</h3>
          {hint ? <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{hint}</p> : null}
        </>
      )}
      <div className="mt-4 flex min-w-0 items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
        <ArrowUpRight className="h-4 w-4 shrink-0" />
        {loading ? <Skeleton className="h-4 w-36" /> : <span className="min-w-0 break-words [overflow-wrap:anywhere]">Acompanhamento ativo</span>}
      </div>
    </div>
  );
}
