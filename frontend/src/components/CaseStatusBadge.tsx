import type { CaseStatus } from '../api';

import { STATUS_LABELS } from '../cases/presentation';
const styles: Record<CaseStatus, string> = {
  awaiting_jurors: 'border-klerosUIComponentsWarning bg-klerosUIComponentsWarningLight',
  voting: 'border-klerosUIComponentsPrimaryBlue bg-klerosUIComponentsMediumBlue',
  resolved: 'border-klerosUIComponentsSuccess bg-klerosUIComponentsSuccessLight',
};
export default function CaseStatusBadge({ status }: Readonly<{ status: CaseStatus }>) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
