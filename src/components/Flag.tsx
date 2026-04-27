import { flagUrl } from "@/lib/flags";

interface Props {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "h-5 w-5",
  md: "h-7 w-7",
  lg: "h-10 w-10",
};

export function Flag({ name, size = "md", className = "" }: Props) {
  const src = flagUrl(name);
  const cls = `${sizeMap[size]} rounded-full object-cover bg-muted flex-shrink-0 inline-block ${className}`;
  if (!src) return <div className={cls} />;
  return <img src={src} alt={name} className={cls} />;
}
