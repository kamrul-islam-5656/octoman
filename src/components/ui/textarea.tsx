import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none transition-[color,box-shadow] placeholder:text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-[var(--primary)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
