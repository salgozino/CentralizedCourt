import { useState } from 'react';
import { Button, Radio } from '@kleros/ui-components-library';
import { ApiError, castVote, getCase, type CaseDetail, type User } from '../api';
import { errorMessage } from '../cases/presentation';

const card = 'rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground p-6';

/**
 * The signed-in juror's own vote while the case is voting; nothing for readers outside the panel. A 409 means the
 * page is stale (vote already stored, or the deadline passed and the case resolved), so the case is reloaded and the
 * reason stays visible above the fresh state.
 */
export default function VotePanel({
  value: c,
  user,
  onVoted,
  onUnauthorized,
}: Readonly<{
  value: CaseDetail;
  user: User;
  onVoted: (updated: CaseDetail) => void;
  onUnauthorized: () => void;
}>) {
  const [choice, setChoice] = useState<string | null>(null);
  const [casting, setCasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read once per mount: a deadline crossed while the page is open is still enforced by the backend (409).
  const [openedAt] = useState(Date.now);

  const seat = c.jurors.find((j) => j.jurorId === user.id);
  if (!seat || (c.status !== 'voting' && !error)) return null;

  const cast = async () => {
    if (choice === null) return;
    setCasting(true);
    setError(null);
    try {
      onVoted(await castVote(c.id, Number(choice)));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onUnauthorized();
      setError(errorMessage(e, 'Could not cast your vote. Please try again.'));
      if (e instanceof ApiError && e.status === 409) {
        try {
          onVoted(await getCase(String(c.id)));
        } catch {
          // Keep the current page; the error above already explains why the vote was not stored.
        }
      }
    } finally {
      setCasting(false);
    }
  };

  const alert = error && (
    <p role="alert" className="text-sm text-klerosUIComponentsError">
      {error}
    </p>
  );
  let body;
  if (c.status !== 'voting') body = alert;
  else if (seat.outcomeIndex !== null)
    body = (
      <>
        {alert}
        <p>You voted: {c.outcomes[seat.outcomeIndex]}</p>
      </>
    );
  else if (openedAt >= new Date(seat.deadline).getTime()) body = <p>Your voting deadline has passed.</p>;
  else
    body = (
      <>
        <p>Your vote is final. Vote by {new Date(seat.deadline).toLocaleString()}.</p>
        <Radio
          groupLabel="Outcome"
          small
          value={choice ?? undefined}
          onChange={(value: string) => setChoice(value)}
          options={c.outcomes.map((outcome, index) => ({ label: outcome, value: String(index) }))}
        />
        {alert}
        <Button
          text={casting ? 'Casting vote…' : 'Cast vote'}
          isLoading={casting}
          isDisabled={casting || choice === null}
          onPress={() => void cast()}
        />
      </>
    );

  return (
    <section aria-label="Your vote" className={`${card} flex flex-col items-start gap-4`}>
      <h2 className="text-lg font-semibold">Your vote</h2>
      {body}
    </section>
  );
}
