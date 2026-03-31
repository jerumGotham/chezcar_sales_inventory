import { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";

export function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <AppHeader title={title} subtitle={subtitle} />
      {actions ? <div className="mb-6 flex flex-wrap gap-3">{actions}</div> : null}
      {children}
    </div>
  );
}
