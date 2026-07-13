import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { ISSUE_TYPES, ISSUE_STATUS_LABEL } from "@/lib/labels/issue-types";
import { IssueTransitionForm } from "@/components/labels/issue-transition";
import Link from "next/link";

export const metadata = { title: "Problemas de etiquetas" };

type SearchParams = Promise<{ status?: string }>;

export default async function LabelIssuesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await requirePermission("labels.manage");
  const supabase = await createClient();

  let query = supabase
    .from("shipping_label_issues")
    .select(
      `*, clients(name), marketplace_connections(nickname),
       shipments(id, external_shipment_id),
       platform_users!shipping_label_issues_reported_by_fkey(full_name)`
    )
    .eq("organization_id", session.organization.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (params.status) query = query.eq("status", params.status);

  const { data: issues } = await query;

  const openCount = (issues ?? []).filter((i) =>
    ["new", "in_review", "waiting_ml"].includes(i.status)
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Centro de problemas de etiquetas</h1>
        <p className="text-sm text-slate-500">
          Tickets reportados por vendedores y repartidores. {openCount} abiertos.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/label-issues"
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${!params.status ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
        >
          Todos
        </Link>
        {Object.entries(ISSUE_STATUS_LABEL).map(([value, { label }]) => (
          <Link
            key={value}
            href={`/label-issues?status=${value}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${params.status === value ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        {(issues ?? []).map((issue) => {
          const st = ISSUE_STATUS_LABEL[issue.status] ?? ISSUE_STATUS_LABEL.new;
          const ship = issue.shipments as unknown as { id: string; external_shipment_id: string | null } | null;
          const reporter = issue.platform_users as unknown as { full_name: string | null } | null;
          return (
            <div key={issue.id} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {ISSUE_TYPES[issue.issue_type] ?? issue.issue_type}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}>
                      {st.label}
                    </span>
                    {issue.priority === "high" && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                        Alta prioridad
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {(issue.clients as unknown as { name: string } | null)?.name ?? "—"} ·{" "}
                    {(issue.marketplace_connections as unknown as { nickname: string | null } | null)?.nickname ?? "—"}{" "}
                    · Venta {issue.external_order_id ?? "—"} ·{" "}
                    {ship ? (
                      <Link href={`/shipments/${ship.id}`} className="text-blue-600 hover:underline">
                        Envío #{ship.external_shipment_id ?? ship.id.slice(0, 8)}
                      </Link>
                    ) : (
                      "Envío —"
                    )}
                  </p>
                  {issue.description && (
                    <p className="mt-1 text-sm text-slate-700">“{issue.description}”</p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    Reportado por {reporter?.full_name ?? "—"} ·{" "}
                    {new Date(issue.created_at).toLocaleString("es-AR")}
                  </p>
                  {issue.resolution && (
                    <p className="mt-1 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                      Resolución: {issue.resolution}
                    </p>
                  )}
                </div>
                {!["resolved", "closed", "not_resolvable"].includes(issue.status) && (
                  <div className="w-full max-w-sm">
                    <IssueTransitionForm issueId={issue.id} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {(issues ?? []).length === 0 && (
          <p className="rounded-xl bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            No hay tickets{params.status ? " en este estado" : ""}. Cuando un vendedor
            reporte un problema de etiqueta, aparece acá.
          </p>
        )}
      </div>
    </div>
  );
}
