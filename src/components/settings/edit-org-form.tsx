"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateOrganizationAction, type OrgActionResult } from "@/lib/actions/organization";
import { FormError } from "@/components/ui/form";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
    >
      {pending ? "Guardando…" : "Guardar"}
    </button>
  );
}

export function EditOrgForm({
  currentName,
  currentLegalName,
  currentPhone,
}: {
  currentName: string;
  currentLegalName: string | null;
  currentPhone: string | null;
}) {
  const [state, action] = useActionState<OrgActionResult, FormData>(updateOrganizationAction, {});

  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block text-slate-500">Nombre comercial</span>
        <input
          name="name"
          defaultValue={currentName}
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-500">Razón social</span>
        <input
          name="legalName"
          defaultValue={currentLegalName ?? ""}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-500">Teléfono</span>
        <input
          name="phone"
          defaultValue={currentPhone ?? ""}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </label>
      <div className="flex items-center gap-3">
        <SaveButton />
        {state.ok && <p className="text-xs text-emerald-600">Guardado ✓</p>}
      </div>
      <FormError error={state.error} />
    </form>
  );
}
