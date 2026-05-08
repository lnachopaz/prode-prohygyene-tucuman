import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg";

const sizes: Record<Size, { star: number; gap: string }> = {
  xs: { star: 8, gap: "gap-0.5" },
  sm: { star: 11, gap: "gap-1" },
  md: { star: 14, gap: "gap-1.5" },
  lg: { star: 18, gap: "gap-2" },
};

export function ThreeStars({
  size = "sm",
  className,
  color = "hsl(43 88% 52%)",
}: {
  size?: Size;
  className?: string;
  color?: string;
}) {
  const s = sizes[size];
  return (
    <span
      className={cn("inline-flex items-center", s.gap, className)}
      aria-label="Tres estrellas"
      role="img"
    >
      {[0, 1, 2].map((i) => (
        <Star key={i} size={s.star} color={color} />
      ))}
    </span>
  );
}

function Star({ size, color }: { size: number; color: string }) {
  const r = size / 2;
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.45;
    points.push(`${r + Math.cos(angle) * radius},${r + Math.sin(angle) * radius}`);
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <polygon points={points.join(" ")} fill={color} />
    </svg>
  );
}
