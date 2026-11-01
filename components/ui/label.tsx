import * as React from "react";
import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("font-text text-base font-semibold text-ink", className)} {...props} />;
}

export { Label };
