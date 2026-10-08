import type { ReactNode } from 'react';
import type { Case } from '../api';
import { formatDuration } from '../cases/duration';

const STATUS_LABELS: Record<Case['status'], string> = {
  awaiting_jurors: 'Awaiting jurors',
  voting: 'Voting',
  resolved: 'Resolved',
};

const SELECTION_LABELS: Record<Case['selectionMethod'], string> = {
  random: 'Random draw',
  manual: 'Manual selection',
};

function Row({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <>
      <dt className="text-sm text-klerosUIComponentsSecondaryText">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** Shows the case exactly as the backend stored it. */
export default function CaseCreatedCard({ created }: Readonly<{ created: Case }>) {
  return (
    <article aria-label="Created case" className="flex flex-col gap-5">
      <p
        role="status"
        className="rounded-base border border-klerosUIComponentsSuccess bg-klerosUIComponentsSuccessLight px-3 py-2 font-semibold"
      >
        ✓ Case created
      </p>
      <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2.5">
        <Row label="Case">#{created.id}</Row>
        <Row label="Title">
          <span className="font-semibold">{created.title}</span>
        </Row>
        <Row label="Description">
          <span className="whitespace-pre-wrap">{created.description}</span>
        </Row>
        <Row label="Outcomes">
          <ul aria-label="Outcomes" className="flex flex-wrap gap-2">
            {created.outcomes.map((o) => (
              <li
                key={o}
                className="rounded-full bg-klerosUIComponentsMediumPurple px-2.5 text-sm font-semibold text-klerosUIComponentsPrimaryPurple"
              >
                {o}
              </li>
            ))}
          </ul>
        </Row>
        <Row label="Voting window">{formatDuration(created.voteWindowSeconds)}</Row>
        <Row label="Jurors">{created.panelSize}</Row>
        <Row label="Selection">{SELECTION_LABELS[created.selectionMethod]}</Row>
        <Row label="Status">
          <span className="rounded-full border border-klerosUIComponentsWarning bg-klerosUIComponentsWarningLight px-2.5 text-sm font-semibold">
            {STATUS_LABELS[created.status]}
          </span>
        </Row>
        <Row label="Created">{new Date(created.createdAt).toLocaleString()}</Row>
      </dl>
      <p className="text-sm text-klerosUIComponentsSecondaryText">
        You will be able to find your cases here once the case list is available.
      </p>
    </article>
  );
}
