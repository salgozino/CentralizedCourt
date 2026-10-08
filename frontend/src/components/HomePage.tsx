import { Link } from 'react-router-dom';
import type { User } from '../api';
import AdminUsersSection from './AdminUsersSection';
import AuthenticatedPage from './AuthenticatedPage';

type Props = Readonly<{ user: User; onLogout: () => void; onUserChange: (user: User) => void }>;

export default function HomePage({ user, onLogout, onUserChange }: Props) {
  const has = (role: string) => user.roles.includes(role);
  const hasPermissions = ['admin', 'creator', 'juror'].some(has);
  return (
    <AuthenticatedPage user={user} onLogout={onLogout}>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold">Home</h1>
          <p className="mt-2">
            <Link to="/cases" className="text-klerosUIComponentsPrimaryPurple underline">
              Go to cases →
            </Link>
          </p>
        </div>
        {has('admin') && <AdminUsersSection currentUserId={user.id} onSelfChange={onUserChange} />}
        {has('juror') && (
          <section aria-labelledby="assignments-heading">
            <h2 id="assignments-heading" className="text-xl font-semibold">
              My assignments
            </h2>
            <p>Assignments will be available in slice 3.</p>
          </section>
        )}
        {!hasPermissions && <p>You have no permissions yet. Ask an admin to assign you a role.</p>}
      </div>
    </AuthenticatedPage>
  );
}
