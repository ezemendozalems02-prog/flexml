"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { reportLabelIssueAction } from "@/lib/actions/labels";
import type { ActionResult } from "@/lib/auth/actions";
import { ISSUE_TYPES } from "@/lib/labels/issue-types";
import { FormError, SubmitButton } from "@/components/ui/form";
import {
  Download,
  Eye,
  Printer,
  RefreshCw,
  Copy,
  Check,
  Flag,
} from "lucide-react";

/**
 * Acciones de etiqueta. Todas pasan por /api/labels/{id} donde el backend
 * valida permiso y alcance; acá solo se maneja la respuesta.
 */

type LabelApiResponse =
  | { ok: true; url: string; fileName: string }
  | { error: string; message?: string };

async function requestLabel(
  shipmentId: string,
  action: "view" | "download" | "print" | "refresh"
): Promise<{ url?: string; message?: string }> {
  const res = await fetch(`/api/labels/${shipmentId}?action=${action}&json=1`);
  const data = (await res.json()) as LabelApiResponse;
  if ("ok" in data && data.ok) return { url: data.url };
  return { message: ("message" in data ? data.message : undefined) ?? "No se pudo obtener la etiqueta." };
}

export function LabelButtons({
  shipmentId,
  compact = false,
}: {
  shipmentId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (action: "view" | "download" | "print" | "refresh") => {
    setBusy(action);
    setMessage(null);
    try {
      const result = await requestLabel(shipmentId, action);
      if (result.url) {
        if (action === "print") {
          const win = window.open(result.url, "_blank");
          win?.addEventListener("load", () => win.print());
        } else {
          window.open(result.url, "_blank");
        }
        if (action === "refresh") router.refresh();
      } else {
        setMessage(result.message ?? "Etiqueta no disponible mediante la integración.");
      }
    } catch {
      setMessage("Error de conexión. Reintentá.");
    } finally {
      setBusy(null);
    }
  };

  const btn = compact
    ? "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium"
    : "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold";

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => run("view")} disabled={!!busy} className={`${btn} bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50`}>
          <Eye className="h-3.5 w-3.5" /> {busy === "view" ? "…" : "Ver"}
        </button>
        <button onClick={() => run("download")} disabled={!!busy} className={`${btn} bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50`}>
          <Download className="h-3.5 w-3.5" /> {busy === "download" ? "…" : "Descargar"}
        </button>
        <button onClick={() => run("print")} disabled={!!busy} className={`${btn} bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50`}>
          <Printer className="h-3.5 w-3.5" /> {busy === "print" ? "…" : "Imprimir"}
        </button>
        <button onClick={() => run("refresh")} disabled={!!busy} className={`${btn} bg-white text-slate-500 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50`} title="Actualizar desde Mercado Libre">
          <RefreshCw className="h-3.5 w-3.5" /> {busy === "refresh" ? "…" : "Actualizar"}
        </button>
      </div>
      {message && (
        <p className="rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs text-orange-700 ring-1 ring-orange-200">
          {message}
        </p>
      )}
    </div>
  );
}

export function CopyId({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Copiar ${label}`}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
    >
      {value}
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export function ReportIssueForm({ shipmentId }: { shipmentId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(reportLabelIssueAction, {});

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-orange-700 ring-1 ring-orange-200 hover:bg-orange-50"
      >
        <Flag className="h-3.5 w-3.5" /> Reportar un problema
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <h3 className="text-sm font-semibold">Reportar problema de etiqueta</h3>
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">¿Qué pasó?</span>
        <select name="issueType" required defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2">
          <option value="" disabled>
            Elegí el problema…
          </option>
          {Object.entries(ISSUE_TYPES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">Detalle (opcional)</span>
        <textarea name="description" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
      </label>
      <FormError error={state.error} />
      <div className="flex gap-2">
        <SubmitButton>Enviar reporte</SubmitButton>
      </div>
      <button type="button" onClick={() => setOpen(false)} className="w-full py-1 text-xs text-slate-500">
        Cancelar
      </button>
      <p className="text-xs text-slate-400">
        El administrador recibe el reporte en el centro de problemas — no hace falta
        escribirle por WhatsApp.
      </p>
    </form>
  );
}
