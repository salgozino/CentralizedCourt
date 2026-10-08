import { useEffect, useState } from 'react';
import { ApiError } from '../api';

type ReadState<T> = { kind: 'loading' } | { kind: 'ready'; data: T } | { kind: 'missing' } | { kind: 'error' };

/** Ignore late responses after navigation, logout, or a retry. */
export function useCaseRead<T>(load: () => Promise<T>, onUnauthorized: () => void) {
  const [response, setResponse] = useState<{ load: () => Promise<T>; attempt: number; state: ReadState<T> } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const finish = (state: ReadState<T>) => setResponse({ load, attempt, state });
    load()
      .then((data) => {
        if (active) finish({ kind: 'ready', data });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) onUnauthorized();
        else finish({ kind: error instanceof ApiError && error.status === 404 ? 'missing' : 'error' });
      });
    return () => {
      active = false;
    };
  }, [load, onUnauthorized, attempt]);
  // A new route or retry has no matching response yet; do not flash the old case.
  const state: ReadState<T> =
    response?.load === load && response.attempt === attempt ? response.state : { kind: 'loading' };
  return { state, retry: () => setAttempt((n) => n + 1) };
}
