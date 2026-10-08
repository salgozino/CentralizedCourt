import type { ReactNode } from 'react';
import { Button } from '@kleros/ui-components-library';
import { NavLink } from 'react-router-dom';
import { logout, type User } from '../api';

export default function AuthenticatedPage({
  user,
  onLogout,
  children,
}: Readonly<{ user: User; onLogout: () => void; children: ReactNode }>) {
  async function handleLogout() {
    try {
      await logout();
    } finally {
      onLogout();
    }
  }
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-4 sm:p-8">
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
      <nav aria-label="Main navigation" className="flex gap-6 border-b border-klerosUIComponentsStroke">
        {['/', '/cases'].map((path) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `py-3 ${isActive ? 'border-b-2 border-klerosUIComponentsPrimaryPurple font-semibold text-klerosUIComponentsPrimaryPurple' : 'text-klerosUIComponentsSecondaryText'}`
            }
          >
            {path === '/' ? 'Home' : 'Cases'}
          </NavLink>
        ))}
      </nav>
      <main>{children}</main>
    </div>
  );
}
