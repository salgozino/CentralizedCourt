import { useState } from 'react';
import { Button } from '@kleros/ui-components-library';
import { ApiError, drawJurors, type CaseDetail, type DrawResult, type DrawnJuror } from '../api';
import { errorMessage, jurorCount } from '../cases/presentation';
import ManualJurorPicker from './ManualJurorPicker';

const card = 'rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground p-6';

export default function DrawJurorsPanel({
  value: c,
  canDraw,
  onDrawn,
  onUnauthorized,
}: Readonly<{
  value: CaseDetail;
  canDraw: boolean;
  onDrawn: (result: DrawResult) => void;
  onUnauthorized: () => void;
}>) {
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (c.jurors.length > 0) return <DrawnJurorsList value={c} />;
  if (c.status !== 'awaiting_jurors') return null;
  if (c.selectionMethod === 'manual') {
    if (canDraw) return <ManualJurorPicker value={c} onDrawn={onDrawn} onUnauthorized={onUnauthorized} />;
    return (
      <section className={card}>
        <h2 className="mb-4 text-lg font-semibold">Jurors</h2>
        <p>This case is waiting for the creator to assign {jurorCount(c.panelSize)}.</p>
      </section>
    );
  }

  const draw = async () => {
    setDrawing(true);
    setError(null);
    try {
      const result = await drawJurors(c.id);
      onDrawn(result);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onUnauthorized();
      else setError(errorMessage(e, 'Could not draw jurors. Please try again.'));
    } finally {
      setDrawing(false);
    }
  };

  return (
    <section className={`${card} flex flex-col items-start gap-4`}>
      <h2 className="text-lg font-semibold">Jurors</h2>
      <p>This case is waiting for a random draw of {jurorCount(c.panelSize)}.</p>
      {error && (
        <p role="alert" className="text-sm text-klerosUIComponentsError">
          {error}
        </p>
      )}
      {canDraw && (
        <Button
          text={drawing ? 'Drawing jurors…' : 'Draw jurors'}
          isLoading={drawing}
          isDisabled={drawing}
          onPress={() => void draw()}
        />
      )}
    </section>
  );
}

/** While voting only who voted is shown; once resolved, every juror's choice is public. */
function voteStatus(c: CaseDetail, juror: DrawnJuror): string {
  if (c.status !== 'resolved') return juror.hasVoted ? 'Voted' : 'Pending';
  return juror.outcomeIndex === null ? 'Did not vote' : `Voted ${c.outcomes[juror.outcomeIndex]}`;
}

function DrawnJurorsList({ value: c }: Readonly<{ value: CaseDetail }>) {
  return (
    <section className={card}>
      <h2 className="mb-4 text-lg font-semibold">Drawn jurors</h2>
      <ol aria-label="Drawn jurors" className="list-decimal space-y-2 pl-6">
        {c.jurors.map((juror) => (
          <li key={juror.jurorId} className="break-words">
            {juror.name}
            <span className="text-klerosUIComponentsSecondaryText">
              {' '}
              {/* Deadlines no longer matter once the case is resolved. */}
              {c.status !== 'resolved' && `· Vote by ${new Date(juror.deadline).toLocaleString()} `}·{' '}
              {voteStatus(c, juror)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
