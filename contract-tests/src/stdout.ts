import * as fs from 'node:fs';

const LINE_RE = /^LOGIN CODE (\S+) (\d{6})$/gm;

function readStdout(): string {
  return fs.readFileSync(process.env.CONTRACT_STDOUT_FILE!, 'utf8');
}

/** Current end of the backend stdout; pass to `codeSince` to read only what was printed afterwards. */
export function stdoutMark(): number {
  return readStdout().length;
}

export function stdoutSince(mark: number): string {
  return readStdout().slice(mark);
}

/** Latest login code printed for `email` after `mark` (or ever, when no mark is given). */
export function codeSince(email: string, mark = 0): string | null {
  let latest: string | null = null;
  for (const match of stdoutSince(mark).matchAll(LINE_RE)) {
    if (match[1] === email) latest = match[2];
  }
  return latest;
}

export function latestCode(email: string): string | null {
  return codeSince(email, 0);
}
