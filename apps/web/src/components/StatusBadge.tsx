import { AlertTriangle, CheckCircle2, Clock3, Wifi } from "lucide-react";

type StatusBadgeProps = {
  tone: "good" | "warn" | "critical" | "info";
  children: React.ReactNode;
};

const iconMap = {
  good: CheckCircle2,
  warn: Clock3,
  critical: AlertTriangle,
  info: Wifi
};

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  const Icon = iconMap[tone];

  return (
    <span className={`status ${tone}`}>
      <Icon size={14} aria-hidden="true" />
      {children}
    </span>
  );
}
