"use client";

import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function ErrorState({
  title = "Nao consegui carregar agora.",
  message = "Tente novamente em instantes.",
  onRetry,
  retryLabel = "Tentar novamente",
  className
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-300" />
          <div className="min-w-0">
            <p className="font-black">{title}</p>
            <p className="mt-1 break-words font-semibold">{message}</p>
          </div>
        </div>
        {onRetry ? (
          <button className="btn border border-red-200 bg-white px-3 py-2 text-xs text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-100 dark:hover:bg-red-900" type="button" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" /> {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  className
}: {
  title: string;
  message?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400", className)}>
      <Inbox className="mx-auto h-7 w-7 text-slate-400" />
      <p className="mt-3 font-black text-slate-700 dark:text-slate-200">{title}</p>
      {message ? <p className="mt-1">{message}</p> : null}
    </div>
  );
}
