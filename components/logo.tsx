import { cn } from "@/lib/utils";

export function Logo({
  className,
  markClassName,
  wordmark = true,
  tone = "ink",
}: {
  className?: string;
  markClassName?: string;
  wordmark?: boolean;
  tone?: "ink" | "cream";
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src="/logo.svg"
        alt=""
        width={64}
        height={64}
        className={cn("h-14 w-14 shrink-0", markClassName)}
      />
      {wordmark ? (
        <div className={cn("leading-none", tone === "cream" ? "text-cream" : "text-ink")}>
          <p className="font-display text-[1.65rem] font-semibold tracking-tight">How Well Do You</p>
          <p className="font-display text-[1.65rem] font-semibold tracking-tight">Know Me?</p>
        </div>
      ) : null}
    </div>
  );
}
