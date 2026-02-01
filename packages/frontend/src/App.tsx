import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';
import { Layout } from './components/Layout';
import { LoginPage } from './features/auth/LoginPage';
import { AdminLoginPage } from './features/auth/AdminLoginPage';
import { AuthCallbackPage } from './features/auth/AuthCallbackPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { UsersPage } from './features/users/UsersPage';
import { ApiKeysPage } from './features/api-keys/ApiKeysPage';
import { LogsPage } from './features/logs/LogsPage';
import { AccountsPage } from './features/accounts/AccountsPage';
import { GuidePage } from './features/guide/GuidePage';
import { BestPracticesPage } from './features/guide/BestPracticesPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="guide" element={<GuidePage />} />
        <Route path="best-practices" element={<BestPracticesPage />} />
      </Route>
    </Routes>
  );
}

export default App;
