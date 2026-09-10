import type { ReactNode } from "react";

export const metadata = { title: "SNSW Dashboards API" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "32px", color: "#1c2028", background: "#f6f7f5" }}>{children}</body>
    </html>
  );
}
