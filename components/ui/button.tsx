import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-text font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:pointer-events-none disabled:opacity-40 min-h-12 px-5 text-base",
  {
    variants: {
      variant: {
        default: "bg-terracotta-dark text-cream",
        secondary: "bg-paper text-ink border border-ink/15",
        gold: "bg-gold text-ink",
        pine: "bg-pine text-cream",
        ghost: "bg-transparent text-ink",
        miss: "border-2 border-ink/25 bg-cream text-ink",
        tv: "bg-gold-bright text-ink",
      },
      size: {
        default: "min-h-12 px-5",
        wide: "min-h-14 w-full px-6 text-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
