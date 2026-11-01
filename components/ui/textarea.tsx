import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-28 w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 font-text text-base text-ink placeholder:text-miss focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
