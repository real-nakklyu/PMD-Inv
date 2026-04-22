import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm shadow-slate-950/[0.03] outline-none transition-[border-color,box-shadow,background] placeholder:text-muted-foreground hover:border-muted-foreground/45 focus:border-ring focus:bg-background focus:ring-4 focus:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm shadow-slate-950/[0.03] outline-none transition-[border-color,box-shadow,background] hover:border-muted-foreground/45 focus:border-ring focus:bg-background focus:ring-4 focus:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm text-foreground shadow-sm shadow-slate-950/[0.03] outline-none transition-[border-color,box-shadow,background] placeholder:text-muted-foreground hover:border-muted-foreground/45 focus:border-ring focus:bg-background focus:ring-4 focus:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
}
