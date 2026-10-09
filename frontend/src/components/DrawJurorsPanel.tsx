import { useState } from 'react';
import { Button } from '@kleros/ui-components-library';
import { ApiError, drawJurors, type Case, type DrawResult, type DrawnJuror, type ValidationIssue } from '../api';

const card = 'rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground p-6';
const GENERIC_ERROR = 'Could not draw jurors. Please try again.';

/** The backend `detail` is a message string, or a list of validation issues on 422. */
function drawErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC_ERROR;
  if (typeof error.detail === 'string') return error.detail;
  if (Array.isArray(error.detail)) return (error.detail as ValidationIssue[]).map((issue) => issue.msg).join(' ');
  return GENERIC_ERROR;
}

export default function DrawJurorsPanel({
  value: c,
  canDraw,
  onDrawn,
  onUnauthorized,
}: Readonly<{
  value: Case;
  canDraw: boolean;
  onDrawn: (result: DrawResult) => void;
  onUnauthorized: () => void;
}>) {
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jurors, setJurors] = useState<DrawnJuror[] | null>(null);

  if (jurors) return <DrawnJurorsList jurors={jurors} />;
  if (c.status !== 'awaiting_jurors') return null;
  if (c.selectionMethod === 'manual')
    return (
      <section className={card}>
        <h2 className="mb-4 text-lg font-semibold">Jurors</h2>
        <p>Manual juror assignment is not available yet.</p>
      </section>
    );

  const draw = async () => {
    setDrawing(true);
    setError(null);
    try {
      const result = await drawJurors(c.id);
      setJurors(result.jurors);
      onDrawn(result);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onUnauthorized();
      else setError(drawErrorMessage(e));
    } finally {
      setDrawing(false);
    }
  };

  return (
    <section className={`${card} flex flex-col items-start gap-4`}>
      <h2 className="text-lg font-semibold">Jurors</h2>
      <p>This case is waiting for a random draw of {c.panelSize} jurors.</p>
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

function DrawnJurorsList({ jurors }: Readonly<{ jurors: DrawnJuror[] }>) {
  return (
    <section className={card}>
      <h2 className="mb-4 text-lg font-semibold">Drawn jurors</h2>
      <ol aria-label="Drawn jurors" className="list-decimal space-y-2 pl-6">
        {jurors.map((juror) => (
          <li key={juror.userId} className="break-words">
            {juror.email}
            <span className="text-klerosUIComponentsSecondaryText">
              {' '}
              · Vote by {new Date(juror.deadline).toLocaleString()}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
