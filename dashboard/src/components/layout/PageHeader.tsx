import type { ReactNode } from "react";

/** Title row for every page: eyebrow, title, context pills, actions. Sits under the top bar, above the content. */
export function PageHeader({ eyebrow, title, pills, actions, tabs }: { eyebrow: ReactNode; title: ReactNode; pills?: ReactNode; actions?: ReactNode; tabs?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="ph-row">
        <div className="ph-title"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div>
        {pills && <div className="ph-pills">{pills}</div>}
        {actions && <div className="ph-actions">{actions}</div>}
      </div>
      {tabs && <div className="ph-tabs">{tabs}</div>}
    </div>
  );
}

export function Pill({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return <span className="pill" title={title}><label>{label}</label><b>{children}</b></span>;
}
