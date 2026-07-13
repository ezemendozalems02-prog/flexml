"use client";

import { useActionState, useEffect, useState } from "react";
import { markDeliveredAction, markFailedAction } from "@/lib/actions/shipments";
import type { ActionResult } from "@/lib/auth/actions";
import { FormError } from "@/components/ui/form";
import { useFormStatus } from "react-dom";
import { CheckCircle2, XCircle } from "lucide-react";

function BigSubmit({ className, children }: { className: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-4 text-base font-bold shadow-sm transition disabled:opacity-60 ${className}`}
    >
      {pending ? "Guardando…" : children}
    </button>
  );
}

/** Captura la ubicación del dispositivo (si el repartidor lo permite). */
function useGeo() {
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, []);
  return geo;
}

export function DeliveryActions({
  shipmentId,
  incidentReasons,
}: {
  shipmentId: string;
  incidentReasons: Array<{ id: string; label: string; requires_note: boolean; allows_reschedule: boolean }>;
}) {
  const [mode, setMode] = useState<"idle" | "deliver" | "fail">("idle");
  const [deliverState, deliverAction] = useActionState<ActionResult, FormData>(
    markDeliveredAction,
    {}
  );
  const [failState, failAction] = useActionState<ActionResult, FormData>(markFailedAction, {});
  const [nextStep, setNextStep] = useState("reschedule");
  const geo = useGeo();

  if (mode === "idle") {
    return (
      <div className="space-y-3">
        <button
          onClick={() => setMode("deliver")}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-4 text-base font-bold text-white shadow-sm active:bg-emerald-700"
        >
          <CheckCircle2 className="h-5 w-5" /> Entregar
        </button>
        <button
          onClick={() => setMode("fail")}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-4 text-base font-bold text-white shadow-sm active:bg-orange-600"
        >
          <XCircle className="h-5 w-5" /> No pude entregar
        </button>
      </div>
    );
  }

  if (mode === "deliver") {
    return (
      <form action={deliverAction} className="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h3 className="font-semibold text-slate-900">Confirmar entrega</h3>
        <input type="hidden" name="shipmentId" value={shipmentId} />
        {geo && (
          <>
            <input type="hidden" name="lat" value={geo.lat} />
            <input type="hidden" name="lng" value={geo.lng} />
          </>
        )}
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">¿Quién recibió? (opcional)</span>
          <input
            name="receiverName"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
            placeholder="Nombre de quien recibe"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Observación (opcional)</span>
          <textarea
            name="note"
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
          />
        </label>
        <FormError error={deliverState.error} />
        <BigSubmit className="bg-emerald-600 text-white active:bg-emerald-700">
          Confirmar entrega
        </BigSubmit>
        <button
          type="button"
          onClick={() => setMode("idle")}
          className="w-full py-2 text-sm font-medium text-slate-500"
        >
          Cancelar
        </button>
      </form>
    );
  }

  return (
    <form action={failAction} className="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h3 className="font-semibold text-slate-900">Registrar problema</h3>
      <input type="hidden" name="shipmentId" value={shipmentId} />
      {geo && (
        <>
          <input type="hidden" name="lat" value={geo.lat} />
          <input type="hidden" name="lng" value={geo.lng} />
        </>
      )}
      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">Motivo</span>
        <select
          name="incidentReasonId"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
          defaultValue=""
        >
          <option value="" disabled>
            Elegí un motivo…
          </option>
          {incidentReasons.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">¿Qué hacemos con el paquete?</span>
        <select
          name="nextStep"
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
        >
          <option value="retry_today">Reintentar hoy</option>
          <option value="reschedule">Reprogramar</option>
          <option value="return">Devolver</option>
          <option value="review">Requiere revisión</option>
        </select>
      </label>
      {nextStep === "reschedule" && (
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Nueva fecha</span>
          <input
            type="date"
            name="rescheduledTo"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
          />
        </label>
      )}
      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">Observación</span>
        <textarea
          name="note"
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
          placeholder="Detalle de lo que pasó"
        />
      </label>
      <FormError error={failState.error} />
      <BigSubmit className="bg-orange-500 text-white active:bg-orange-600">
        Guardar incidencia
      </BigSubmit>
      <button
        type="button"
        onClick={() => setMode("idle")}
        className="w-full py-2 text-sm font-medium text-slate-500"
      >
        Cancelar
      </button>
    </form>
  );
}
