import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg";

const sizes: Record<Size, string> = {
  xs: "h-3 w-[18px]",
  sm: "h-4 w-6",
  md: "h-5 w-8",
  lg: "h-7 w-11",
};

export function ArgentinaFlag({
  size = "sm",
  withSun = true,
  className,
}: {
  size?: Size;
  withSun?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex overflow-hidden rounded-[2px] ring-1 ring-black/10 shadow-sm",
        sizes[size],
        className,
      )}
      aria-label="Bandera de Argentina"
      role="img"
    >
      <svg viewBox="0 0 30 20" className="h-full w-full" preserveAspectRatio="none">
        <rect width="30" height="20" fill="hsl(202 78% 60%)" />
        <rect y="6.66" width="30" height="6.66" fill="white" />
        {withSun && (
          <g transform="translate(15 10)">
            <circle r="2" fill="hsl(43 88% 52%)" />
            <g stroke="hsl(43 88% 52%)" strokeWidth="0.5">
              {Array.from({ length: 8 }).map((_, i) => {
                const a = (i * Math.PI) / 4;
                return (
                  <line
                    key={i}
                    x1={Math.cos(a) * 2.3}
                    y1={Math.sin(a) * 2.3}
                    x2={Math.cos(a) * 3.2}
                    y2={Math.sin(a) * 3.2}
                  />
                );
              })}
            </g>
          </g>
        )}
      </svg>
    </span>
  );
}
