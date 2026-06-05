import { memo, useMemo } from "react";
import { formatNumber } from "@/lib/utils";

export const BarChart = memo(function BarChart({ data, suffix = "" }: { data: Array<{ label: string; value: number }>; suffix?: string }) {
  const max = useMemo(() => Math.max(...data.map((item) => Math.abs(item.value)), 1), [data]);

  if (!data.length) {
    return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">Sem dados para exibir.</div>;
  }

  return (
    <div className="space-y-4">
      {data.map((item) => (
        <div key={item.label} className="grid grid-cols-[5rem_1fr_5rem] items-center gap-3 text-sm">
          <span className="truncate font-bold text-slate-600 dark:text-slate-300">{item.label}</span>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className={`h-full rounded-full ${item.value < 0 ? "bg-gradient-to-r from-red-500 to-rose-400" : "bg-gradient-to-r from-emerald-500 to-lime-400"}`} style={{ width: `${Math.max(5, (Math.abs(item.value) / max) * 100)}%` }} />
          </div>
          <span className="text-right font-black">{formatNumber(item.value, suffix)}</span>
        </div>
      ))}
    </div>
  );
});
