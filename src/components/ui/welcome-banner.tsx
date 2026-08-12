"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * Mensaje de bienvenida/ayuda que se cierra y no vuelve a aparecer (se
 * recuerda en localStorage del dispositivo, no en la base de datos). Subí
 * el sufijo de `storageKey` (ej. "-v2") si el contenido cambia y querés
 * que se vuelva a mostrar una vez.
 */
export function WelcomeBanner({
  storageKey,
  title,
  children,
}: {
  storageKey: string;
  title: string;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // localStorage no existe en el server: hay que leerlo recién acá (post-
    // hidratación) para no romper el render inicial. El aviso arranca oculto
    // y aparece en este segundo paso si todavía no se cerró antes.
    try {
      const alreadySeen = localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en cliente
      if (!alreadySeen) setVisible(true);
    } catch {
      // localStorage no disponible (modo privado, etc.): no molestar con el aviso
    }
  }, [storageKey]);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // nada que hacer si no se puede guardar
    }
  };

  if (!visible) return null;

  return (
    <div className="relative rounded-xl bg-blue-50 p-4 pr-10 text-sm ring-1 ring-blue-200">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar"
        className="absolute right-2 top-2 rounded-lg p-1.5 text-blue-400 transition hover:bg-blue-100 hover:text-blue-700"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="mb-1.5 font-semibold text-blue-900">{title}</p>
      <div className="space-y-1 text-blue-800">{children}</div>
    </div>
  );
}
