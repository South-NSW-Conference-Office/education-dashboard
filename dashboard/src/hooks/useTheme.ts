import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark" | null; // null = follow the system

const KEY = "snsw-dashboard-theme";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem(KEY) as Theme) || null; } catch { return null; }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.setAttribute("data-theme", theme); else root.removeAttribute("data-theme");
    try { if (theme) localStorage.setItem(KEY, theme); else localStorage.removeItem(KEY); } catch { /* private mode */ }
  }, [theme]);
  const isDark = theme === "dark" || (!theme && typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  const toggle = useCallback(() => setTheme(isDark ? "light" : "dark"), [isDark]);
  return { theme, isDark, toggle };
}
