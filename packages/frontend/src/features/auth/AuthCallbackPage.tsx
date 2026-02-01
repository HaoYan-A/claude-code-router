import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((state) => state.setAuth);

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    const userParam = searchParams.get('user');

    if (accessToken && refreshToken && userParam) {
      try {
        const user = JSON.parse(userParam);
        setAuth({
          user: {
            id: user.id,
            role: user.role,
            githubUsername: user.githubUsername,
            avatarUrl: user.avatarUrl,
            email: user.email,
            name: user.name,
            isAdmin: false,
          },
          accessToken,
          refreshToken,
        });
        navigate('/dashboard', { replace: true });
      } catch {
        navigate('/login?error=Failed to parse user data', { replace: true });
      }
    } else {
      navigate('/login?error=Missing authentication data', { replace: true });
    }
  }, [searchParams, setAuth, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
        <p className="mt-2 text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
}
