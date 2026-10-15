import { useEffect, useState } from 'react';
import { Button, DropdownSelect, Tag } from '@kleros/ui-components-library';
import { ApiError, drawJurors, listEligibleJurors, type CaseDetail, type DrawResult, type EligibleJuror } from '../api';
import { errorMessage, jurorCount } from '../cases/presentation';

const card = 'rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground p-6';

type Pool = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; jurors: EligibleJuror[] };

/**
 * Manual draw: the case creator (or an admin) adds exactly panelSize jurors from a dropdown; each pick becomes a
 * removable chip and the panel keeps the picking order.
 */
export default function ManualJurorPicker({
  value: c,
  onDrawn,
  onUnauthorized,
}: Readonly<{ value: CaseDetail; onDrawn: (result: DrawResult) => void; onUnauthorized: () => void }>) {
  const [pool, setPool] = useState<Pool>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<EligibleJuror[]>([]);
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

  const assign = async () => {
    setAssigning(true);
    setError(null);
    try {
      onDrawn(
        await drawJurors(
          c.id,
          picked.map((j) => j.jurorId),
        ),
      );
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
    const remaining = pool.jurors.filter((j) => !picked.some((p) => p.jurorId === j.jurorId));
    const full = picked.length >= c.panelSize;
    body = (
      <>
        {pool.jurors.length < c.panelSize && (
          <p className="text-sm text-klerosUIComponentsError">
            Only {pool.jurors.length} eligible {pool.jurors.length === 1 ? 'juror' : 'jurors'} for {c.panelSize} seats.
          </p>
        )}
        <DropdownSelect
          label="Add a juror"
          placeholder="Choose a juror"
          items={remaining.map((j) => ({ id: j.jurorId, text: j.name, itemValue: j }))}
          // Always reset: a pick moves the juror into the chips below.
          selectedKey={null}
          isDisabled={assigning || full || remaining.length === 0}
          callback={(item) => {
            const juror = remaining.find((j) => j.jurorId === item.id);
            if (juror) setPicked((current) => [...current, juror]);
          }}
        />
        <ol aria-label="Selected jurors" className="flex flex-wrap gap-2">
          {picked.map((j, i) => (
            <li key={j.jurorId}>
              <Tag
                text={`${i + 1}. ${j.name} ×`}
                aria-label={`Remove ${j.name}`}
                isDisabled={assigning}
                onPress={() => setPicked((current) => current.filter((p) => p.jurorId !== j.jurorId))}
              />
            </li>
          ))}
        </ol>
        <p className="text-sm text-klerosUIComponentsSecondaryText">
          Selected {picked.length} of {c.panelSize}
        </p>
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
      <p>Pick {jurorCount(c.panelSize)} for this case. The panel keeps the order in which you pick them.</p>
      {body}
    </section>
  );
}
