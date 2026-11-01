import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex min-h-12 w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 font-text text-base text-ink shadow-inner placeholder:text-miss focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
