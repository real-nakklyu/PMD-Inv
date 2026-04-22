import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-transparent bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/10 transition-[background,box-shadow,transform,border-color,color] duration-150 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/15 active:translate-y-px active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:translate-y-0 disabled:scale-100 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
