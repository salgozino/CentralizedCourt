import { useEffect, useState } from "react";
import { api, type User } from "./api";
import HomeScreen from "./HomeScreen";
import LoginScreen from "./LoginScreen";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .csrf()
      .then(() => api.me())
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await api.logout().catch(() => undefined);
    setUser(null);
  }

  if (loading) return <p className="p-8">Loading…</p>;
  if (!user) return <LoginScreen onLoggedIn={setUser} />;
  return <HomeScreen user={user} onUserUpdated={setUser} onLogout={logout} />;
}

export default App;
