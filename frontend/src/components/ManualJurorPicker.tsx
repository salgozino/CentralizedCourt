import { useEffect, useState } from 'react';
import { Button } from '@kleros/ui-components-library';
import { ApiError, drawJurors, listEligibleJurors, type CaseDetail, type DrawResult, type EligibleJuror } from '../api';
import { errorMessage } from '../cases/presentation';

const card = 'rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground p-6';

type Pool = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; jurors: EligibleJuror[] };

/** Manual draw: the case creator (or an admin) picks exactly panelSize jurors; the panel keeps the picking order. */
export default function ManualJurorPicker({
  value: c,
  onDrawn,
  onUnauthorized,
}: Readonly<{ value: CaseDetail; onDrawn: (result: DrawResult) => void; onUnauthorized: () => void }>) {
  const [pool, setPool] = useState<Pool>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listEligibleJurors(c.id).then(
      (jurors) => live && setPool({ kind: 'ready', jurors }),
      (e) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 401) onUnauthorized();
        else setPool({ kind: 'error' });
      },
    );
    return () => {
      live = false;
    };
  }, [c.id, attempt, onUnauthorized]);

  const toggle = (jurorId: number) =>
    setPicked((current) =>
      current.includes(jurorId) ? current.filter((id) => id !== jurorId) : [...current, jurorId],
    );

  const assign = async () => {
    setAssigning(true);
    setError(null);
    try {
      onDrawn(await drawJurors(c.id, picked));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onUnauthorized();
      else setError(errorMessage(e, 'Could not assign jurors. Please try again.'));
    } finally {
      setAssigning(false);
    }
  };

  let body;
  if (pool.kind === 'loading') body = <p role="status">Loading eligible jurors…</p>;
  else if (pool.kind === 'error')
    body = (
      <>
        <p role="alert">Could not load eligible jurors.</p>
        <Button
          text="Retry"
          variant="secondary"
          onPress={() => {
            setPool({ kind: 'loading' });
            setAttempt((n) => n + 1);
          }}
        />
      </>
    );
  else {
    const names = new Map(pool.jurors.map((j) => [j.jurorId, j.name]));
    const full = picked.length >= c.panelSize;
    const summary = `Selected ${picked.length} of ${c.panelSize}${picked.length ? ': ' : ''}${picked.map((id) => names.get(id)).join(', ')}`;
    body = (
      <>
        {pool.jurors.length < c.panelSize && (
          <p className="text-sm text-klerosUIComponentsError">
            Only {pool.jurors.length} eligible jurors for {c.panelSize} seats.
          </p>
        )}
        <ul aria-label="Eligible jurors" className="flex flex-col gap-2">
          {pool.jurors.map((j) => {
            const checked = picked.includes(j.jurorId);
            return (
              <li key={j.jurorId}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={assigning || (full && !checked)}
                    onChange={() => toggle(j.jurorId)}
                  />
                  <span>{j.name}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-klerosUIComponentsSecondaryText">{summary}</p>
        {error && (
          <p role="alert" className="text-sm text-klerosUIComponentsError">
            {error}
          </p>
        )}
        <Button
          text={assigning ? 'Assigning jurors…' : 'Assign jurors'}
          isLoading={assigning}
          isDisabled={assigning || picked.length !== c.panelSize}
          onPress={() => void assign()}
        />
      </>
    );
  }

  return (
    <section className={`${card} flex flex-col items-start gap-4`}>
      <h2 className="text-lg font-semibold">Jurors</h2>
      <p>Pick {c.panelSize} jurors for this case. The panel keeps the order in which you pick them.</p>
      {body}
    </section>
  );
}
