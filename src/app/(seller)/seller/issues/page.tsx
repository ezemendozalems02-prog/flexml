import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ISSUE_TYPES, ISSUE_STATUS_LABEL } from "@/lib/labels/issue-types";

export const metadata = { title: "Mis reportes" };

export default async function SellerIssuesPage() {
  const session = await requireSession();
  const supabase = await createClient();

  let query = supabase
    .from("shipping_label_issues")
    .select("*, shipments(external_shipment_id)")
    .eq("organization_id", session.organization.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (session.membership.role === "client") {
    query = query.eq("reported_by", session.userId);
  }

  const { data: issues } = await query;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mis reportes</h1>
        <p className="text-sm text-slate-500">
          Seguimiento de los problemas de etiquetas que reportaste.
        </p>
      </div>

      {(issues ?? []).map((issue) => {
        const st = ISSUE_STATUS_LABEL[issue.status] ?? ISSUE_STATUS_LABEL.new;
        return (
          <div key={issue.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-900">
                {ISSUE_TYPES[issue.issue_type] ?? issue.issue_type}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}>
                {st.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Venta {issue.external_order_id ?? "—"} · Envío #
              {(issue.shipments as unknown as { external_shipment_id: string | null } | null)
                ?.external_shipment_id ?? "—"}{" "}
              · {new Date(issue.created_at).toLocaleString("es-AR")}
            </p>
            {issue.description && <p className="mt-1 text-sm text-slate-700">“{issue.description}”</p>}
            {issue.resolution && (
              <p className="mt-2 rounded bg-emerald-50 px-2 py-1.5 text-sm text-emerald-700">
                Respuesta: {issue.resolution}
              </p>
            )}
          </div>
        );
      })}
      {(issues ?? []).length === 0 && (
        <p className="rounded-xl bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          No reportaste problemas todavía. Podés hacerlo desde el detalle de cualquier
          envío.
        </p>
      )}
    </div>
  );
}
