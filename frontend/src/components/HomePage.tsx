import { Button } from '@kleros/ui-components-library';
import { logout, type User } from '../api';
import AdminUsersSection from './AdminUsersSection';
import CasesSection from './CasesSection';

type Props = Readonly<{
  user: User;
  onLogout: () => void;
  onUserChange: (user: User) => void;
}>;

export default function HomePage({ user, onLogout, onUserChange }: Props) {
  const has = (role: string) => user.roles.includes(role);
  const hasPermissions = ['admin', 'creator', 'juror'].some(has);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      onLogout();
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold">{user.email}</p>
          <ul aria-label="Roles" className="flex gap-2 text-sm">
            {user.roles.map((role) => (
              <li key={role} className="rounded-full border px-2">
                {role}
              </li>
            ))}
          </ul>
        </div>
        <Button text="Log out" variant="secondary" onPress={handleLogout} />
      </header>
      <main className="flex flex-col gap-8">
        {has('admin') && <AdminUsersSection currentUserId={user.id} onSelfChange={onUserChange} />}
        <CasesSection canCreate={has('creator') || has('admin')} onUnauthorized={onLogout} />
        {has('juror') && (
          <section aria-labelledby="assignments-heading">
            <h2 id="assignments-heading" className="text-xl font-semibold">
              My assignments
            </h2>
            <p>Assignments will be available in slice 3.</p>
          </section>
        )}
        {!hasPermissions && <p>You have no permissions yet. Ask an admin to assign you a role.</p>}
      </main>
    </div>
  );
}
