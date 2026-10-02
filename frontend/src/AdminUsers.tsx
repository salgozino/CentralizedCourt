import { AlertMessage, Checkbox } from "@kleros/ui-components-library";
import { useEffect, useState } from "react";
import { api, type AssignableRole, type User } from "./api";

const ASSIGNABLE: AssignableRole[] = ["creator", "juror"];

interface Props {
  currentUserId: number;
  onCurrentUserUpdated: (user: User) => void;
}

function AdminUsers({ currentUserId, onCurrentUserUpdated }: Readonly<Props>) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .listUsers()
      .then(setUsers)
      .catch(() => setError("Could not load users."));
  }, []);

  async function toggle(user: User, role: AssignableRole, selected: boolean) {
    const current = ASSIGNABLE.filter((r) => user.roles.includes(r));
    const roles = selected ? [...current, role] : current.filter((r) => r !== role);
    setSavingId(user.id);
    setError("");
    try {
      const updated = await api.setRoles(user.id, roles);
      setUsers((prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? null);
      if (updated.id === currentUserId) onCurrentUserUpdated(updated);
    } catch {
      setError(`Could not update roles for ${user.email}.`);
    } finally {
      setSavingId(null);
    }
  }

  if (users === null) {
    return error ? <AlertMessage variant="error" title="Error" msg={error} /> : <p>Loading users…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <AlertMessage variant="error" title="Error" msg={error} />}
      <table className="w-full text-left text-sm">
        <thead className="text-klerosUIComponentsSecondaryText">
          <tr>
            <th className="py-2">Email</th>
            <th className="py-2">Roles</th>
            {ASSIGNABLE.map((role) => (
              <th key={role} className="py-2 capitalize">
                {role}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-klerosUIComponentsStroke border-t">
              <td className="py-2">{user.email}</td>
              <td className="py-2" data-testid={`roles-${user.email}`}>
                {user.roles.join(", ")}
              </td>
              {ASSIGNABLE.map((role) => (
                <td key={role} className="py-2">
                  <Checkbox
                    small
                    label=""
                    aria-label={`${role} for ${user.email}`}
                    isSelected={user.roles.includes(role)}
                    isDisabled={savingId === user.id}
                    onChange={(selected) => toggle(user, role, selected)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AdminUsers;
