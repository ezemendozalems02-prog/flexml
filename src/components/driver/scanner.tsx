"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { IScannerControls } from "@zxing/browser";
import { scanPickupAction, type ScanResult } from "@/lib/actions/shipments";
import { useGeo } from "@/lib/hooks/use-geo";
import { Camera, CheckCircle2, ChevronRight, Keyboard, XCircle } from "lucide-react";

type Entry = ScanResult & { id: string; at: Date; code: string };

/** Ignorar el mismo código si se vuelve a leer dentro de esta ventana (la
 *  cámara sigue enfocando la misma etiqueta después de un escaneo exitoso). */
const DEBOUNCE_MS = 4000;
const MAX_ENTRIES = 30;

export function Scanner() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [pending, startTransition] = useTransition();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastRef = useRef<{ code: string; at: number } | null>(null);

  const geo = useGeo();
  const geoRef = useRef(geo);
  useEffect(() => {
    geoRef.current = geo;
  }, [geo]);

  const handleCode = useCallback((rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    const now = Date.now();
    if (lastRef.current && lastRef.current.code === code && now - lastRef.current.at < DEBOUNCE_MS) {
      return;
    }
    lastRef.current = { code, at: now };

    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(60);

    startTransition(async () => {
      const result = await scanPickupAction(
        code,
        geoRef.current ? { lat: geoRef.current.lat, lng: geoRef.current.lng } : undefined
      );
      setEntries((prev) => [{ ...result, id: `${now}`, at: new Date(), code }, ...prev].slice(0, MAX_ENTRIES));
      if (!result.ok && typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([80, 60, 80]);
      }
    });
  }, []);

  useEffect(() => {
    if (manualMode) return;
    let cancelled = false;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        if (cancelled || !videoRef.current) return;
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current,
          (result) => {
            if (result) handleCode(result.getText());
          }
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setCameraError(null);
      } catch (err) {
        setCameraError(
          err instanceof Error ? err.message : "No se pudo acceder a la cámara del dispositivo"
        );
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [manualMode, handleCode]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Escanear paquetes</h1>
        <p className="text-sm text-slate-500">
          Cada paquete tiene un código de barras y un QR impresos en la etiqueta de envío (la
          misma etiqueta con la dirección del destinatario). Apuntá la cámara a cualquiera de los
          dos — no hace falta acertarle al lugar exacto, con encuadrar la etiqueta completa
          alcanza. Cada lectura queda retirada a tu nombre automáticamente.
        </p>
      </div>

      {!manualMode && (
        <div className="overflow-hidden rounded-xl bg-black shadow-sm ring-1 ring-slate-200">
          <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
        </div>
      )}

      {cameraError && !manualMode && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          No se pudo abrir la cámara ({cameraError}). Podés escribir el código a mano mientras tanto.
        </p>
      )}

      <button
        type="button"
        onClick={() => setManualMode((m) => !m)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 active:bg-slate-50"
      >
        {manualMode ? <Camera className="h-4 w-4" /> : <Keyboard className="h-4 w-4" />}
        {manualMode ? "Usar la cámara" : "Escribir el código a mano"}
      </button>

      {manualMode && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCode(manualCode);
            setManualCode("");
          }}
          className="flex gap-2"
        >
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Número de envío"
            inputMode="numeric"
            autoFocus
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base"
          />
          <button
            type="submit"
            disabled={pending || !manualCode.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Registrar
          </button>
        </form>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Últimos escaneados{pending && " · procesando…"}
        </h2>
        {entries.length === 0 && (
          <p className="rounded-xl bg-white p-4 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            Todavía no escaneaste ningún paquete.
          </p>
        )}
        {entries.map((e) => (
          <div
            key={e.id}
            className={`flex items-start gap-3 rounded-xl p-3 shadow-sm ring-1 ${
              e.ok ? "bg-emerald-50 ring-emerald-200" : "bg-red-50 ring-red-200"
            }`}
          >
            {e.ok ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${e.ok ? "text-emerald-800" : "text-red-800"}`}>
                {e.message}
              </p>
              <p className="text-xs text-slate-500">
                #{e.externalId ?? e.code} ·{" "}
                {e.at.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
            </div>
            {e.ok && e.shipmentId && (
              <Link href={`/driver/shipment/${e.shipmentId}`} className="shrink-0 text-slate-400">
                <ChevronRight className="h-5 w-5" />
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
