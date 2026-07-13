"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { labelIssueTransitionAction } from "@/lib/actions/labels";
import type { ActionResult } from "@/lib/auth/actions";

function InlineSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
    >
      {pending ? "…" : "Aplicar"}
    </button>
  );
}

const NEXT_STATES: Record<string, string> = {
  in_review: "En revisión",
  waiting_ml: "Esperando Mercado Libre",
  resolved: "Resuelto",
  closed: "Cerrado",
  not_resolvable: "No resoluble mediante API",
};

export function IssueTransitionForm({ issueId }: { issueId: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(
    labelIssueTransitionAction,
    {}
  );
  const [status, setStatus] = useState("in_review");
  const needsResolution = ["resolved", "closed", "not_resolvable"].includes(status);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="issueId" value={issueId} />
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
        >
          {Object.entries(NEXT_STATES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {needsResolution && (
          <input
            name="resolution"
            placeholder="Resolución…"
            className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
          />
        )}
        <InlineSubmit />
      </div>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
