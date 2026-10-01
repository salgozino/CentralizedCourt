import { useEffect, useState } from "react";
import { getMe, type User } from "./api";
import HomePage from "./components/HomePage";
import LoginPage from "./components/LoginPage";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getMe()
      .then((me) => active && setUser(me))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <p className="p-8">Loading...</p>;
  if (!user) return <LoginPage onLogin={setUser} />;
  return <HomePage user={user} onLogout={() => setUser(null)} onUserChange={setUser} />;
}

export default App;
