import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth.store';
import { API_PREFIX } from '@claude-code-router/shared';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const error = searchParams.get('error');

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleGitHubLogin = () => {
    window.location.href = `${API_PREFIX}/auth/github`;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Claude Code Router</CardTitle>
          <CardDescription>Sign in to manage your API keys</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {decodeURIComponent(error)}
            </div>
          )}
          <Button
            className="w-full bg-[#24292F] hover:bg-[#3d4449] active:bg-[#1a1e22] cursor-pointer transition-colors"
            onClick={handleGitHubLogin}
          >
            <Github className="mr-2 h-5 w-5" />
            Continue with GitHub
          </Button>
          <div className="text-center text-sm text-muted-foreground">
            <Link to="/admin/login" className="text-emerald-600 hover:underline">
              Admin Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
