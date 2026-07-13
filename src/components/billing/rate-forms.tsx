"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createRateAction,
  setClientRetryModeAction,
  updateBillingRuleAction,
} from "@/lib/actions/billing";
import type { ActionResult } from "@/lib/auth/actions";
import { Field, FormError, SubmitButton } from "@/components/ui/form";

function InlineSubmit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
    >
      {pending ? "…" : children}
    </button>
  );
}

export function CreateRateForm({
  zones,
  clients,
}: {
  zones: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(createRateAction, {});
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="grid gap-4 md:grid-cols-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">
          Zona <span className="text-red-500">*</span>
        </span>
        <select name="zoneId" required defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="" disabled>
            Elegir zona…
          </option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Cliente</span>
        <select name="clientId" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">Tarifa general (todos los clientes)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              Personalizada: {c.name}
            </option>
          ))}
        </select>
      </label>
      <Field label="Vigencia desde" name="validFrom" type="date" required defaultValue={today} />
      <Field label="Precio base por envío" name="price" type="number" required placeholder="5000" />
      <Field label="Precio por reintento" name="retryPrice" type="number" placeholder="Opcional" />
      <Field label="Precio por devolución" name="returnPrice" type="number" placeholder="Opcional" />
      <Field label="Precio por reprogramación" name="reschedulePrice" type="number" placeholder="Opcional" />
      <Field label="Precio paquete adicional" name="additionalPackagePrice" type="number" placeholder="Opcional" />
      <div className="md:col-span-3">
        <FormError error={state.error} />
        <p className="mb-3 text-xs text-slate-500">
          La tarifa vigente anterior se cierra automáticamente el día previo. Las semanas ya
          calculadas nunca se recalculan con precios nuevos.
        </p>
        <SubmitButton>Crear tarifa</SubmitButton>
      </div>
    </form>
  );
}

const CHARGE_LABELS: Record<string, string> = {
  full: "Cobrable al 100%",
  fixed: "Importe fijo",
  percent: "Porcentaje",
  none: "No cobrable",
  review: "Requiere revisión",
};

export function BillingRuleRow({
  ruleKey,
  label,
  charge,
  fixedAmount,
  percent,
  isOverride,
}: {
  ruleKey: string;
  label: string;
  charge: string;
  fixedAmount: number | null;
  percent: number | null;
  isOverride: boolean;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(updateBillingRuleAction, {});
  const [mode, setMode] = useState(charge);
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-2 text-sm">
        {label}
        {isOverride && (
          <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
            propia
          </span>
        )}
      </td>
      <td className="px-4 py-2">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="ruleKey" value={ruleKey} />
          <select
            name="charge"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
          >
            {Object.entries(CHARGE_LABELS).map(([value, l]) => (
              <option key={value} value={value}>
                {l}
              </option>
            ))}
          </select>
          {mode === "fixed" && (
            <input
              name="fixedAmount"
              type="number"
              defaultValue={fixedAmount ?? undefined}
              placeholder="Importe"
              className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            />
          )}
          {mode === "percent" && (
            <input
              name="percent"
              type="number"
              defaultValue={percent ?? undefined}
              placeholder="%"
              min={0}
              max={100}
              className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            />
          )}
          <InlineSubmit>Guardar</InlineSubmit>
          {state.error && <span className="text-xs text-red-600">{state.error}</span>}
        </form>
      </td>
    </tr>
  );
}

const RETRY_LABELS: Record<string, string> = {
  final_only: "Solo entrega final",
  plus_retry: "Entrega + 1 reintento",
  per_visit: "Cada visita realizada",
};

export function RetryModeForm({
  clientId,
  current,
}: {
  clientId: string;
  current: string;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(setClientRetryModeAction, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="clientId" value={clientId} />
      <select
        name="mode"
        defaultValue={current}
        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
      >
        {Object.entries(RETRY_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <InlineSubmit>Guardar</InlineSubmit>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
