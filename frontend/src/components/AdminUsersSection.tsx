import { useEffect, useState } from "react";
import { Checkbox } from "@kleros/ui-components-library";
import { listUsers, setUserRoles, type ExtraRole, type User } from "../api";

const EXTRA_ROLES: ExtraRole[] = ["creator", "juror"];

type Props = Readonly<{
  currentUserId: number;
  onSelfChange: (user: User) => void;
}>;

export default function AdminUsersSection({ currentUserId, onSelfChange }: Props) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listUsers()
      .then((list) => active && setUsers(list))
      .catch(() => active && setError("Could not load users"));
    return () => {
      active = false;
    };
  }, []);

  async function toggle(target: User, role: ExtraRole, on: boolean) {
    const next = EXTRA_ROLES.filter((r) =>
      r === role ? on : target.roles.includes(r),
    );
    setError(null);
    try {
      const updated = await setUserRoles(target.id, next);
      setUsers((prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? prev);
      if (updated.id === currentUserId) onSelfChange(updated);
    } catch {
      setError("Could not update roles");
    }
  }

  return (
    <section aria-labelledby="users-heading" className="flex flex-col gap-3">
      <h2 id="users-heading" className="text-xl font-semibold">
        Users
      </h2>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {users && (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Roles</th>
              <th scope="col">Assign</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.roles.join(", ")}</td>
                <td className="flex gap-4">
                  {EXTRA_ROLES.map((role) => (
                    <Checkbox
                      key={role}
                      label={role}
                      aria-label={`${role} for ${u.email}`}
                      isSelected={u.roles.includes(role)}
                      onChange={(on) => toggle(u, role, on)}
                    />
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
