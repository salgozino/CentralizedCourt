import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import AuthenticatedPage from './components/AuthenticatedPage';
import CasesSection, { NewCase } from './components/CasesSection';
import CaseDetailPage from './components/CaseDetailPage';
import { getMe, type User } from './api';
import HomePage from './components/HomePage';
import LoginPage from './components/LoginPage';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const onUnauthorized = useCallback(() => {
    // Never carry an in-memory creation response into another login session.
    window.history.replaceState(null, '', '/');
    setUser(null);
  }, []);

  useEffect(() => {
    // History state survives reloads; deep links must recheck visibility with the API.
    window.history.replaceState({ ...window.history.state, usr: null }, '');
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
  const canCreate = user.roles.includes('admin') || user.roles.includes('creator');
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage user={user} onLogout={onUnauthorized} onUserChange={setUser} />} />
        <Route
          path="/cases"
          element={
            <AuthenticatedPage user={user} onLogout={onUnauthorized}>
              <CasesSection canCreate={canCreate} onUnauthorized={onUnauthorized} />
            </AuthenticatedPage>
          }
        />
        <Route
          path="/cases/new"
          element={
            <AuthenticatedPage user={user} onLogout={onUnauthorized}>
              <NewCase canCreate={canCreate} onUnauthorized={onUnauthorized} />
            </AuthenticatedPage>
          }
        />
        <Route
          path="/cases/:id"
          element={
            <AuthenticatedPage user={user} onLogout={onUnauthorized}>
              <CaseDetailPage user={user} onUnauthorized={onUnauthorized} />
            </AuthenticatedPage>
          }
        />
        <Route
          path="*"
          element={
            <AuthenticatedPage user={user} onLogout={onUnauthorized}>
              <h1 className="text-2xl font-semibold">Page not found</h1>
              <Link to="/">Back to Home</Link>
            </AuthenticatedPage>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
