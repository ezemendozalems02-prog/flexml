"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Alterna claro/oscuro seteando data-theme en <html>. La elección se guarda
 * en localStorage y un script inline en el layout raíz la aplica antes del
 * primer render para evitar el parpadeo. Por defecto: claro.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.dataset.theme = "dark";
    } else {
      delete document.documentElement.dataset.theme;
    }
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* almacenamiento bloqueado: el tema igual aplica en esta pestaña */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
