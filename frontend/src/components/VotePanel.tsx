import { useState } from 'react';
import { Button, Radio } from '@kleros/ui-components-library';
import { ApiError, castVote, type CaseDetail, type User, type ValidationIssue } from '../api';

const card = 'rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground p-6';
const GENERIC_ERROR = 'Could not cast your vote. Please try again.';

function voteErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC_ERROR;
  if (typeof error.detail === 'string') return error.detail;
  if (Array.isArray(error.detail)) return (error.detail as ValidationIssue[]).map((issue) => issue.msg).join(' ');
  return GENERIC_ERROR;
}

/** The signed-in juror's own vote while the case is voting; nothing for readers outside the panel. */
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
  if (c.status !== 'voting' || !seat) return null;

  const cast = async () => {
    if (choice === null) return;
    setCasting(true);
    setError(null);
    try {
      onVoted(await castVote(c.id, Number(choice)));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onUnauthorized();
      else setError(voteErrorMessage(e));
    } finally {
      setCasting(false);
    }
  };

  let body;
  if (seat.outcomeIndex !== null) body = <p>You voted: {c.outcomes[seat.outcomeIndex]}</p>;
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
        {error && (
          <p role="alert" className="text-sm text-klerosUIComponentsError">
            {error}
          </p>
        )}
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
