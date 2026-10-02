import { AlertMessage, Button, Card, TextField } from "@kleros/ui-components-library";
import { useState, type FormEvent } from "react";
import { api, ApiError, type User } from "./api";

interface Props {
  onLoggedIn: (user: User) => void;
}

function LoginScreen({ onLoggedIn }: Readonly<Props>) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.requestCode(email.trim());
      setStep("code");
    } catch (e) {
      setError(e instanceof ApiError && e.status === 422 ? "Enter a valid email." : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLoggedIn(await api.verify(email.trim(), code.trim()));
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? "Invalid or expired code."
          : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  function backToEmail() {
    setStep("email");
    setCode("");
    setError("");
  }

  return (
    <Card round className="mx-auto mt-16 flex h-auto w-full max-w-md flex-col gap-4 p-8">
      <h1 className="text-klerosUIComponentsPrimaryText text-2xl font-semibold">
        CentralizedCourt
      </h1>
      {step === "email" ? (
        <form className="flex flex-col gap-4" onSubmit={submitEmail}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            isRequired
            autoFocus
            className="w-full"
          />
          <Button type="submit" text="Send login code" isLoading={busy} isDisabled={busy} />
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submitCode}>
          <p className="text-klerosUIComponentsSecondaryText text-sm">
            If <strong>{email.trim()}</strong> is registered, a 6-digit code was printed to the
            backend console.
          </p>
          <TextField
            label="Login code"
            value={code}
            onChange={setCode}
            isRequired
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            className="w-full"
          />
          <div className="flex gap-2">
            <Button type="submit" text="Log in" isLoading={busy} isDisabled={busy} />
            <Button variant="secondary" text="Use another email" onPress={backToEmail} />
          </div>
        </form>
      )}
      {error && <AlertMessage variant="error" title="Login failed" msg={error} />}
    </Card>
  );
}

export default LoginScreen;
