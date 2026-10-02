import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@kleros/ui-components-library';
import { api, ApiError } from './api';
import type { Profile } from './api';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function Login({ onLogin }: { onLogin: (user: Profile) => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (sent) onLogin(await api<Profile>('/auth/verify', 'POST', { email, code }));
      else {
        await api('/auth/request-code', 'POST', { email });
        setSent(true);
      }
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return <section className="panel login">
    <h2>Sign in</h2>
    <p>Use a seeded account. There is no public signup.</p>
    <form onSubmit={submit}>
      <label htmlFor="email">Email</label>
      <input id="email" type="email" autoComplete="email" required value={email}
        disabled={sent || busy} onChange={(event) => setEmail(event.target.value)} />
      {sent && <>
        <p role="status">If the account exists, its code is in the backend console. It expires in 10 minutes.
          You have at most 5 verification attempts per 10 minutes. If blocked, wait before trying again;
          requesting a new code does not reset this limit.</p>
        <label htmlFor="code">6-digit code</label>
        <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}"
          maxLength={6} required value={code} onChange={(event) => setCode(event.target.value)} />
      </>}
      {error && <p role="alert">{error}</p>}
      <Button type="submit" isDisabled={busy} text={busy ? 'Please wait…' : sent ? 'Verify code' : 'Request code'} />
      {sent && <button type="button" disabled={busy} onClick={() => {
        setSent(false); setCode(''); setError('');
      }}>Change email / request a new code</button>}
    </form>
  </section>;
}

function RoleEditor({ user, onSaved }: { user: Profile; onSaved: (user: Profile) => void }) {
  const [creator, setCreator] = useState(user.roles.includes('creator'));
  const [juror, setJuror] = useState(user.roles.includes('juror'));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    try {
      const roles = [...(creator ? ['creator'] : []), ...(juror ? ['juror'] : [])];
      onSaved(await api<Profile>(`/admin/users/${user.id}/roles`, 'PUT', { roles }));
      setMessage('Roles saved');
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <form className="role-row" aria-label={`Roles for ${user.email}`} onSubmit={save}>
    <div><strong>{user.email}</strong><p>{user.roles.join(', ')}</p></div>
    <label><input type="checkbox" checked={creator} disabled={busy}
      onChange={(event) => setCreator(event.target.checked)} /> Creator</label>
    <label><input type="checkbox" checked={juror} disabled={busy}
      onChange={(event) => setJuror(event.target.checked)} /> Juror</label>
    <Button type="submit" isDisabled={busy} text="Save roles" />
    {message && <span role="status">{message}</span>}
    {error && <span role="alert">{error}</span>}
  </form>;
}

function Admin({ onSelfChanged, currentId }: { onSelfChanged: (user: Profile) => void; currentId: number }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api<Profile[]>('/admin/users').then((users) => { if (active) setUsers(users); })
      .catch((error) => { if (active) setError(errorMessage(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return <section className="panel">
    <h2>User administration</h2>
    <p>Assign creator and juror roles. Admin access cannot be changed here.</p>
    {loading && <p role="status">Loading users…</p>}
    {error && <p role="alert">{error}</p>}
    {users.map((user) => <RoleEditor key={user.id} user={user} onSaved={(updated) => {
      setUsers((users) => users.map((u) => u.id === updated.id ? updated : u));
      if (updated.id === currentId) onSelfChanged(updated);
    }} />)}
  </section>;
}

export function RoleSections({ user, onSelfChanged }: { user: Profile; onSelfChanged: (user: Profile) => void }) {
  return <>
    {user.roles.includes('admin') && <Admin currentId={user.id} onSelfChanged={onSelfChanged} />}
    {user.roles.includes('creator') && <section className="panel"><h2>Cases</h2><p>Case creation will be available in slice 2.</p></section>}
    {user.roles.includes('juror') && <section className="panel"><h2>My assignments</h2><p>Jury assignments will be available in slice 3.</p></section>}
    {user.roles.length === 1 && <section className="panel"><h2>No permissions yet</h2><p>Ask an admin to assign you creator or juror roles.</p></section>}
  </>;
}

function App() {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setError('');
    try { setUser(await api<Profile>('/me')); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) setUser(null);
      else setError(errorMessage(error));
    }
  }

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        await api('/auth/csrf');
        const profile = await api<Profile>('/me');
        if (active) setUser(profile);
      } catch (error) {
        if (active && !(error instanceof ApiError && error.status === 401)) setError(errorMessage(error));
      } finally { if (active) setLoading(false); }
    }
    void init();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user]);

  async function signOut() {
    setBusy(true); setError('');
    try { await api('/auth/logout', 'POST'); setUser(null); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return <main>
    <header><p className="eyebrow">Local dispute resolution</p><h1>CentralizedCourt</h1></header>
    {error && <p role="alert">{error} <button onClick={() => window.location.reload()}>Retry</button></p>}
    {loading ? <p role="status">Loading session…</p> : user ? <>
      <section className="panel profile">
        <div><h2>{user.email}</h2><p>Roles: {user.roles.join(', ')}</p></div>
        <button onClick={() => void refresh()}>Refresh profile</button>
        <Button isDisabled={busy} onPress={() => void signOut()} text="Logout" />
      </section>
      <RoleSections user={user} onSelfChanged={setUser} />
    </> : <Login onLogin={setUser} />}
  </main>;
}

export default App;
