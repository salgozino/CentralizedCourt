import { useState, type FormEvent } from 'react';
import { Button, TextField } from '@kleros/ui-components-library';
import { ApiError, requestCode, verifyCode, type User } from '../api';

export default function LoginPage({ onLogin }: Readonly<{ onLogin: (user: User) => void }>) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitEmail(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestCode(email);
      setCodeSent(true);
    } catch {
      setError('Could not request a code. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await verifyCode(email, code));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Invalid or expired code'
          : 'Could not verify the code. Please try again.',
      );
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Log in</h1>
      {!codeSent ? (
        <form onSubmit={submitEmail} className="flex flex-col gap-4">
          <TextField label="Email" type="email" value={email} onChange={setEmail} isRequired />
          <Button type="submit" text="Send code" isDisabled={busy} />
        </form>
      ) : (
        <form onSubmit={submitCode} className="flex flex-col gap-4">
          <p>If the email exists, a code was printed in the backend console.</p>
          <TextField
            label="Code"
            value={code}
            onChange={setCode}
            inputProps={{ inputMode: 'numeric', maxLength: 6, autoComplete: 'one-time-code' }}
            isRequired
          />
          <Button type="submit" text="Verify" isDisabled={busy} />
          <Button
            type="button"
            variant="tertiary"
            text="Change email"
            onPress={() => {
              setCodeSent(false);
              setCode('');
              setError(null);
            }}
          />
        </form>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </main>
  );
}
