import { useCallback, useState } from 'react';
import { Button } from '@kleros/ui-components-library';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getCase, type Case, type CaseDetail, type User } from '../api';
import { formatDuration } from '../cases/duration';
import { useCaseRead } from '../cases/useCaseRead';
import { STATUS_LABELS, jurorCount, resultLabel } from '../cases/presentation';
import CaseStatusBadge from './CaseStatusBadge';
import DrawJurorsPanel from './DrawJurorsPanel';
import VotePanel from './VotePanel';
import RefusalPanel from './RefusalPanel';

const card = 'rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground p-6';

export default function CaseDetailPage({ user, onUnauthorized }: Readonly<{ user: User; onUnauthorized: () => void }>) {
  const { id = '' } = useParams();
  const location = useLocation();
  // The just-created response is authoritative and avoids an unnecessary second request.
  const created = (location.state as { created?: Case } | null)?.created;
  const load = useCallback(
    // A new case has no panel yet; the create response does not carry one.
    (): Promise<CaseDetail> =>
      created && String(created.id) === id ? Promise.resolve({ ...created, jurors: [] }) : getCase(id),
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
      {state.kind === 'ready' && (
        <CaseDetail value={state.data} user={user} justCreated={!!created} onUnauthorized={onUnauthorized} />
      )}
    </div>
  );
}

function CaseDetail({
  value,
  user,
  justCreated,
  onUnauthorized,
}: Readonly<{ value: CaseDetail; user: User; justCreated: boolean; onUnauthorized: () => void }>) {
  // A successful draw or vote returns the updated case; it replaces the loaded one.
  const [c, setCase] = useState(value);
  const fields = [
    ['Case ID', `#${c.id}`],
    ['Creator ID', `#${c.creatorId}`],
    ['Status', STATUS_LABELS[c.status]],
    ['Result', c.status === 'resolved' ? resultLabel(c.result) : 'Not resolved yet'],
    ['Voting window', `${formatDuration(c.voteWindowSeconds)} (${c.voteWindowSeconds} seconds)`],
    ...(c.refusalWindowSeconds ? [['Refusal window', formatDuration(c.refusalWindowSeconds)]] : []),
    ['Panel size', jurorCount(c.panelSize)],
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
      {c.status === 'resolved' && (
        <section aria-label="Result" className={card}>
          <h2 className="mb-2 text-lg font-semibold">Result</h2>
          <p className="text-xl font-semibold">Resolved: {resultLabel(c.result)}</p>
        </section>
      )}
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
                    {c.refusalWindowSeconds
                      ? 'Voting starts for the complete panel when the last refusal window closes.'
                      : 'Each juror’s window starts when they are drawn. This is not a deadline date.'}
                  </p>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <DrawJurorsPanel
        value={c}
        canDraw={user.id === c.creatorId || user.roles.includes('admin')}
        onDrawn={(result) => setCase(result.case)}
        onUnauthorized={onUnauthorized}
      />
      <RefusalPanel value={c} user={user} onChanged={setCase} onUnauthorized={onUnauthorized} />
      <VotePanel value={c} user={user} onVoted={setCase} onUnauthorized={onUnauthorized} />
      <p className="text-sm text-klerosUIComponentsSecondaryText">Cases cannot be edited or deleted.</p>
    </article>
  );
}
