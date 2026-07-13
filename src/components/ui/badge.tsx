import { internalStatusBadgeClass, internalStatusLabel } from "@/lib/domain/statuses";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${internalStatusBadgeClass(status)}`}
    >
      {internalStatusLabel(status)}
    </span>
  );
}

export function ExternalStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-slate-400">No disponible</span>;
  return (
    <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-0.5 font-mono text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
      {status}
    </span>
  );
}

export function FlexBadge({ isFlex }: { isFlex: boolean | null }) {
  if (isFlex === null) return <span className="text-xs text-slate-400">—</span>;
  return isFlex ? (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
      Flex
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-500 ring-1 ring-inset ring-slate-200">
      No Flex
    </span>
  );
}
