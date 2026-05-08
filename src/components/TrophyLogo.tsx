import { cn } from "@/lib/utils";
import logoSrc from "@/assets/logo-grande.png";

type Size = "sm" | "md" | "lg" | "xl";

const sizes: Record<Size, string> = {
  sm: "h-9 w-auto",
  md: "h-12 w-auto",
  lg: "h-20 w-auto",
  xl: "h-28 w-auto",
};

const wordmark: Record<Size, { main: string; sub: string }> = {
  sm: { main: "text-sm", sub: "text-[9px]" },
  md: { main: "text-lg", sub: "text-[10px]" },
  lg: { main: "text-2xl", sub: "text-xs" },
  xl: { main: "text-4xl", sub: "text-sm" },
};

export function TrophyLogo({
  size = "md",
  showWordmark = false,
  className,
}: {
  size?: Size;
  showWordmark?: boolean;
  className?: string;
}) {
  const s = sizes[size];
  const w = wordmark[size];
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <img
        src={logoSrc}
        alt="Prohygiene Tucumán"
        className={cn(s, "object-contain")}
      />
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span className={cn("font-display tracking-[0.04em] text-foreground", w.main)} style={{ lineHeight: 0.9 }}>
            PRODE
          </span>
          <span className={cn("font-heading uppercase tracking-[0.22em] text-argentina", w.sub)}>
            Prohygiene
          </span>
        </div>
      )}
    </div>
  );
}

// Mantener export por compatibilidad con imports existentes
export function TrophyMark({ className }: { className?: string }) {
  return (
    <img
      src={logoSrc}
      alt="Prohygiene Tucumán"
      className={cn("object-contain", className)}
    />
  );
}
