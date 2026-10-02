import { AlertMessage, Button, Card, Tag } from "@kleros/ui-components-library";
import type { ReactNode } from "react";
import AdminUsers from "./AdminUsers";
import type { Role, User } from "./api";

interface Props {
  user: User;
  onUserUpdated: (user: User) => void;
  onLogout: () => void;
}

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <Card round className="flex h-auto w-full flex-col gap-3 p-6">
      <section aria-label={title} className="flex flex-col gap-3">
        <h2 className="text-klerosUIComponentsPrimaryText text-lg font-semibold">{title}</h2>
        {children}
      </section>
    </Card>
  );
}

function HomeScreen({ user, onUserUpdated, onLogout }: Readonly<Props>) {
  const has = (role: Role) => user.roles.includes(role);
  const onlyUser = user.roles.every((role) => role === "user");

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-klerosUIComponentsPrimaryText text-2xl font-semibold">
            CentralizedCourt
          </h1>
          <p className="text-klerosUIComponentsSecondaryText" data-testid="current-email">
            {user.email}
          </p>
          <div className="flex flex-wrap gap-2" aria-label="Your roles">
            {user.roles.map((role) => (
              <Tag key={role} text={role} active />
            ))}
          </div>
        </div>
        <Button variant="secondary" text="Log out" onPress={onLogout} />
      </header>

      {onlyUser && (
        <AlertMessage
          variant="info"
          title="No permissions yet"
          msg="Your account has no roles beyond 'user'. Ask an admin to grant you the creator or juror role."
        />
      )}

      {has("admin") && (
        <Section title="Users">
          <AdminUsers currentUserId={user.id} onCurrentUserUpdated={onUserUpdated} />
        </Section>
      )}

      {has("creator") && (
        <Section title="Cases">
          <p className="text-klerosUIComponentsSecondaryText">
            Creating and listing cases is coming soon.
          </p>
        </Section>
      )}

      {has("juror") && (
        <Section title="My assignments">
          <p className="text-klerosUIComponentsSecondaryText">
            Cases you are drawn for as a juror will appear here.
          </p>
        </Section>
      )}
    </main>
  );
}

export default HomeScreen;
