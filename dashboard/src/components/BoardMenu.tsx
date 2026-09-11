import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

export function usePresentation() {
  const [presenting, setPresenting] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setPresenting(false); }, [pathname]);
  useEffect(() => {
    document.body.classList.toggle("presenting", presenting);
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setPresenting(false); };
    window.addEventListener("keydown", escape);
    return () => { document.body.classList.remove("presenting"); window.removeEventListener("keydown", escape); };
  }, [presenting]);
  return { presenting, setPresenting };
}

export function BoardMenu({ items }: { items: Array<{ label: string; action: () => void; disabled?: boolean }> }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  useEffect(() => {
    const outside = (e: MouseEvent) => { if (menu.current && !menu.current.contains(e.target as Node)) menu.current.open = false; };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape" && menu.current?.open) { menu.current.open = false; trigger.current?.focus(); } };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  return <details className="board-actions" ref={menu}>
    <summary ref={trigger} aria-label="Board actions">Actions <span aria-hidden>···</span></summary>
    <div className="board-actions-pop">{items.map((item) => <button key={item.label} type="button" disabled={item.disabled} onClick={() => { if (menu.current) menu.current.open = false; item.action(); }}>{item.label}</button>)}</div>
  </details>;
}
