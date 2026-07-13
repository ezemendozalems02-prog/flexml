"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  addAdjustmentAction,
  generateSettlementAction,
  settlementTransitionAction,
} from "@/lib/actions/billing";
import type { ActionResult } from "@/lib/auth/actions";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { ClipboardCopy, Check } from "lucide-react";

export function GenerateSettlementForm({
  clients,
}: {
  clients: Array<{ id: string; name: string }>;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(generateSettlementAction, {});
  // Semana pasada como valor inicial (calculado una sola vez al montar)
  const [lastWeek] = useState(
    () => new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Cliente</span>
        <select name="clientId" required defaultValue="" className="rounded-lg border border-slate-300 px-3 py-2">
          <option value="" disabled>
            Elegir cliente…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Semana (cualquier día)</span>
        <input
          type="date"
          name="week"
          required
          defaultValue={lastWeek}
          className="rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <div>
        <SubmitButton>Generar liquidación</SubmitButton>
      </div>
      <div className="w-full">
        <FormError error={state.error} />
      </div>
    </form>
  );
}

const ADJ_TYPES: Record<string, string> = {
  discount: "Descuento",
  surcharge: "Recargo",
  bonus: "Bonificación",
  correction: "Corrección",
  special_trip: "Viaje especial",
  wait: "Espera",
  toll: "Peaje",
  extra_pickup: "Retiro adicional",
  other: "Otro concepto",
};

export function AddAdjustmentForm({ settlementId }: { settlementId: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(addAdjustmentAction, {});
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="settlementId" value={settlementId} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Tipo</span>
        <select name="adjType" required defaultValue="surcharge" className="w-full rounded-lg border border-slate-300 px-3 py-2">
          {Object.entries(ADJ_TYPES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <Field label="Importe" name="amount" type="number" required placeholder="3000" />
      <Field label="Descripción" name="description" required />
      <Field label="Motivo (queda auditado)" name="reason" required />
      <div className="md:col-span-2">
        <FormError error={state.error} />
        <p className="mb-2 text-xs text-slate-500">
          Descuentos y bonificaciones restan del total automáticamente.
        </p>
        <SubmitButton>Agregar ajuste</SubmitButton>
      </div>
    </form>
  );
}

function TransitionSubmit({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60 ${className}`}
    >
      {pending ? "…" : label}
    </button>
  );
}

export function TransitionButton({
  settlementId,
  action: transition,
  label,
  variant,
}: {
  settlementId: string;
  action: "confirm" | "send" | "mark_paid" | "void";
  label: string;
  variant: "primary" | "success" | "neutral" | "danger";
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    settlementTransitionAction,
    {}
  );
  const classes = {
    primary: "bg-slate-900 text-white hover:bg-slate-700",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
    neutral: "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50",
    danger: "bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50",
  }[variant];
  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="settlementId" value={settlementId} />
      <input type="hidden" name="action" value={transition} />
      <TransitionSubmit label={label} className={classes} />
      {state.error && <p className="mt-1 max-w-xs text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

export function WhatsAppBox({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <textarea
        readOnly
        value={message}
        rows={Math.min(14, message.split("\n").length + 1)}
        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
      />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(message);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
        {copied ? "Copiado" : "Copiar mensaje para WhatsApp"}
      </button>
    </div>
  );
}
