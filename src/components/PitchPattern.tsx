import { cn } from "@/lib/utils";

/**
 * Patrón decorativo: media cancha de fútbol con líneas blancas sutiles.
 * Pensado para usar como fondo absoluto detrás de heros.
 */
export function PitchPattern({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid slice"
      className={cn("pointer-events-none select-none", className)}
      aria-hidden="true"
    >
      <defs>
        <pattern id="grass" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="hsl(142 55% 22%)" />
          <rect width="40" height="20" fill="hsl(142 55% 26%)" />
        </pattern>
      </defs>
      <rect width="400" height="400" fill="url(#grass)" />
      <g
        stroke="white"
        strokeWidth="2"
        fill="none"
        opacity="0.55"
      >
        {/* Borde de cancha */}
        <rect x="20" y="20" width="360" height="360" />
        {/* Línea media */}
        <line x1="20" y1="200" x2="380" y2="200" />
        {/* Círculo central */}
        <circle cx="200" cy="200" r="56" />
        <circle cx="200" cy="200" r="2.5" fill="white" stroke="none" />
        {/* Área grande superior */}
        <rect x="100" y="20" width="200" height="70" />
        <rect x="150" y="20" width="100" height="28" />
        <circle cx="200" cy="92" r="2.5" fill="white" stroke="none" />
        <path d="M 160 90 A 44 44 0 0 0 240 90" />
        {/* Área grande inferior */}
        <rect x="100" y="310" width="200" height="70" />
        <rect x="150" y="352" width="100" height="28" />
        <circle cx="200" cy="308" r="2.5" fill="white" stroke="none" />
        <path d="M 160 310 A 44 44 0 0 1 240 310" />
        {/* Esquinas (corner arcs) */}
        <path d="M 20 26 A 6 6 0 0 1 26 20" />
        <path d="M 380 26 A 6 6 0 0 0 374 20" />
        <path d="M 20 374 A 6 6 0 0 0 26 380" />
        <path d="M 380 374 A 6 6 0 0 1 374 380" />
      </g>
    </svg>
  );
}
