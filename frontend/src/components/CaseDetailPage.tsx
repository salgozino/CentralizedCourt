import { useCallback } from 'react';
import { Button } from '@kleros/ui-components-library';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getCase, type Case } from '../api';
import { formatDuration } from '../cases/duration';
import { useCaseRead } from '../cases/useCaseRead';
import { STATUS_LABELS } from '../cases/presentation';
import CaseStatusBadge from './CaseStatusBadge';

const card = 'rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground p-6';

export default function CaseDetailPage({ onUnauthorized }: Readonly<{ onUnauthorized: () => void }>) {
  const { id = '' } = useParams();
  const location = useLocation();
  // The just-created response is authoritative and avoids an unnecessary second request.
  const created = (location.state as { created?: Case } | null)?.created;
  const load = useCallback(
    () => (created && String(created.id) === id ? Promise.resolve(created) : getCase(id)),
    [id, created],
  );
  const { state, retry } = useCaseRead(load, onUnauthorized);
  return (
    <div className="flex flex-col gap-5">
      <Link to="/cases" className="text-klerosUIComponentsPrimaryPurple underline">
        ← Back to cases
      </Link>
      {state.kind === 'loading' && (
        <p role="status" className={card}>
          Loading case…
        </p>
      )}
      {state.kind === 'missing' && (
        <div className={`${card} text-center`}>
          <h1 className="text-2xl font-semibold">Case not found</h1>
          <p className="mt-2">This case does not exist or is not available to your account.</p>
        </div>
      )}
      {state.kind === 'error' && (
        <div className={`${card} flex flex-col items-start gap-4`}>
          <p role="alert">Could not load this case. Please try again.</p>
          <Button text="Retry" variant="secondary" onPress={retry} />
        </div>
      )}
      {state.kind === 'ready' && <CaseDetail value={state.data} justCreated={!!created} />}
    </div>
  );
}

function CaseDetail({ value: c, justCreated }: Readonly<{ value: Case; justCreated: boolean }>) {
  const fields = [
    ['Case ID', `#${c.id}`],
    ['Creator ID', `#${c.creatorId}`],
    ['Status', STATUS_LABELS[c.status]],
    ['Result', c.result ?? 'Not resolved yet'],
    ['Voting window', `${formatDuration(c.voteWindowSeconds)} (${c.voteWindowSeconds} seconds)`],
    ['Panel size', `${c.panelSize} jurors`],
    ['Selection method', c.selectionMethod === 'random' ? 'Random draw' : 'Manual selection'],
    ['Created', new Date(c.createdAt).toLocaleString()],
    ['Last updated', new Date(c.updatedAt).toLocaleString()],
  ];
  return (
    <article aria-label="Case detail" className="flex flex-col gap-5">
      {justCreated && (
        <p
          role="status"
          className="rounded-base border border-klerosUIComponentsSuccess bg-klerosUIComponentsSuccessLight px-4 py-3"
        >
          ✓ Case created successfully.
        </p>
      )}
      <div>
        <p className="mb-2 text-sm text-klerosUIComponentsSecondaryText">Case #{c.id}</p>
        <h1 className="break-words text-2xl font-semibold">{c.title}</h1>
        <div className="mt-3">
          <CaseStatusBadge status={c.status} />
        </div>
      </div>
      <section className={card}>
        <h2 className="mb-4 text-lg font-semibold">Description</h2>
        <p className="whitespace-pre-wrap break-words">{c.description}</p>
      </section>
      <section className={card}>
        <h2 className="mb-4 text-lg font-semibold">Possible outcomes</h2>
        <ol aria-label="Outcomes" className="list-decimal space-y-2 pl-6">
          {c.outcomes.map((outcome) => (
            <li key={outcome} className="break-words">
              {outcome}
            </li>
          ))}
        </ol>
      </section>
      <section className={card}>
        <h2 className="mb-4 text-lg font-semibold">Case information</h2>
        <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-[160px_minmax(0,1fr)]">
          {fields.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-klerosUIComponentsSecondaryText">{label}</dt>
              <dd className="break-words">
                {value}
                {label === 'Voting window' && (
                  <p className="mt-2 text-sm text-klerosUIComponentsSecondaryText">
                    Each juror’s window starts when they are drawn. This is not a deadline date.
                  </p>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="text-sm text-klerosUIComponentsSecondaryText">
        Cases cannot be edited or deleted. Juror assignment and voting will be available in later slices.
      </p>
    </article>
  );
}
