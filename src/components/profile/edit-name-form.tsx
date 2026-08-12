"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateMyProfileAction, type ProfileActionResult } from "@/lib/actions/profile";
import { FormError } from "@/components/ui/form";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
    >
      {pending ? "Guardando…" : "Guardar"}
    </button>
  );
}

export function EditNameForm({ currentName }: { currentName: string | null }) {
  const [state, action] = useActionState<ProfileActionResult, FormData>(updateMyProfileAction, {});

  return (
    <div className="space-y-1.5">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input
          name="fullName"
          defaultValue={currentName ?? ""}
          placeholder="Tu nombre completo"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <SaveButton />
      </form>
      <FormError error={state.error} />
      {state.ok && <p className="text-xs text-emerald-600">Nombre actualizado ✓</p>}
    </div>
  );
}
