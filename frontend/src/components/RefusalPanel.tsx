import { useEffect, useState } from 'react';
import { Button } from '@kleros/ui-components-library';
import { useNavigate } from 'react-router-dom';
import {
  ApiError,
  getCase,
  listEligibleJurors,
  refuseAssignment,
  replaceJuror,
  type CaseDetail,
  type EligibleJuror,
  type User,
} from '../api';
import { errorMessage } from '../cases/presentation';

export default function RefusalPanel({
  value: c,
  user,
  onChanged,
  onUnauthorized,
}: Readonly<{
  value: CaseDetail;
  user: User;
  onChanged: (c: CaseDetail) => void;
  onUnauthorized: () => void;
}>) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const navigate = useNavigate();
  useEffect(() => {
    if (c.status !== 'refusal') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [c.status]);
  const history = c.assignmentHistory;
  if (!history) return null;
  const current = history.filter((a) => !a.refusedAt);
  const own = current.find((a) => a.jurorId === user.id);
  const canReplace = user.id === c.creatorId || user.roles.includes('admin');
  const handleError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) onUnauthorized();
    else setError(errorMessage(e, 'Could not update the assignment. Please retry or refresh the case.'));
  };
  const refuse = async () => {
    setBusy(true);
    setError(null);
    try {
      await refuseAssignment(c.id);
      if (user.id === c.creatorId || user.roles.includes('admin')) onChanged(await getCase(String(c.id)));
      else navigate('/cases', { state: { refused: true } });
      setConfirming(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="flex flex-col gap-4 rounded-base border border-klerosUIComponentsStroke p-6">
      {c.status === 'refusal' && (
        <>
          <h2 className="text-lg font-semibold">Refusal period</h2>
          <p>
            Silence means continuing. Voting begins only when every seat is filled and every current refusal window has
            closed.
          </p>
          <Button
            text="Refresh case"
            variant="secondary"
            onPress={() => {
              void getCase(String(c.id)).then(onChanged, handleError);
            }}
          />
          {own && own.refusalDeadline && now < Date.parse(own.refusalDeadline) && (
            <Button text="Refuse assignment" onPress={() => setConfirming(true)} />
          )}
          {confirming && (
            <dialog open aria-label="Confirm assignment refusal" className="relative m-0 rounded-base border p-5">
              <p>
                You will lose juror access and be permanently excluded from further draws for this case. This refusal is
                final.
              </p>
              <Button
                text="Keep assignment"
                variant="secondary"
                isDisabled={busy}
                onPress={() => setConfirming(false)}
              />
              <Button text="Confirm refusal" isDisabled={busy} onPress={() => void refuse()} />
            </dialog>
          )}
          {Array.from(
            { length: c.panelSize },
            (_, position) =>
              !current.some((a) => a.position === position) && (
                <div key={position}>
                  <h3>Seat {position + 1} is vacant</h3>
                  {canReplace && (
                    <Replacement
                      key={`${position}-${history.length}`}
                      caseId={c.id}
                      position={position}
                      onChanged={onChanged}
                      onError={handleError}
                    />
                  )}
                </div>
              ),
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <h2 className="text-lg font-semibold">Assignment history</h2>
      <ol aria-label="Assignment history" className="space-y-3">
        {history.map((a) => (
          <li key={a.id}>
            Assignment #{a.id} · Seat {a.position + 1} · {a.name} · Selected by {a.selectedByName ?? 'Unknown (legacy)'}{' '}
            (#{a.selectedById})
            <br />
            Drawn {new Date(a.drawnAt).toLocaleString()} · Refusal deadline{' '}
            {a.refusalDeadline && new Date(a.refusalDeadline).toLocaleString()}
            {a.refusedAt ? ` · Refused ${new Date(a.refusedAt).toLocaleString()}` : ' · Current'}
            {a.predecessorId && <span> · Replaces assignment #{a.predecessorId}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Replacement({
  caseId,
  position,
  onChanged,
  onError,
}: Readonly<{
  caseId: number;
  position: number;
  onChanged: (c: CaseDetail) => void;
  onError: (e: unknown) => void;
}>) {
  const [pool, setPool] = useState<EligibleJuror[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    listEligibleJurors(caseId).then(
      (items) => {
        if (live) setPool(items);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [caseId, attempt]);
  if (failed)
    return (
      <Button
        text="Retry candidates"
        onPress={() => {
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
      />
    );
  if (!pool) return <p role="status">Loading eligible replacements…</p>;
  if (!pool.length)
    return (
      <p>
        No eligible replacements available. This seat will wait until an eligible juror becomes available. Reload this
        page to check again.
      </p>
    );
  return (
    <div className="flex gap-3">
      <select
        aria-label={`Replacement for seat ${position + 1}`}
        value={picked}
        disabled={busy}
        onChange={(e) => setPicked(e.target.value)}
      >
        <option value="">Choose a replacement</option>
        {pool.map((j) => (
          <option key={j.jurorId} value={j.jurorId}>
            {j.name}
          </option>
        ))}
      </select>
      <Button
        text={`Fill seat ${position + 1}`}
        isDisabled={!picked || busy}
        onPress={() => {
          setBusy(true);
          void replaceJuror(caseId, position, Number(picked))
            .then(onChanged, onError)
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
