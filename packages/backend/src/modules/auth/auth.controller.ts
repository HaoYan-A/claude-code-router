import type { Request, Response } from 'express';
import type { AdminLoginSchema, RefreshTokenSchema } from '@claude-code-router/shared';
import { env } from '../../config/env.js';
import { authService } from './auth.service.js';

export class AuthController {
  async adminLogin(req: Request<unknown, unknown, AdminLoginSchema>, res: Response): Promise<void> {
    const result = await authService.adminLogin(req.body.password);
    res.json({ success: true, data: result });
  }

  async githubAuth(_req: Request, res: Response): Promise<void> {
    const { url, state } = authService.getGitHubAuthUrl();
    res.cookie('github_oauth_state', state, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
    });
    res.redirect(url);
  }

  async githubCallback(req: Request, res: Response): Promise<void> {
    const { code, state } = req.query as { code?: string; state?: string };
    const storedState = req.cookies?.github_oauth_state;

    if (!code || !state || state !== storedState) {
      res.redirect(`${env.FRONTEND_URL}/login?error=invalid_state`);
      return;
    }

    res.clearCookie('github_oauth_state');

    try {
      const result = await authService.handleGitHubCallback(code);
      const params = new URLSearchParams({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: JSON.stringify(result.user),
      });
      res.redirect(`${env.FRONTEND_URL}/auth/callback?${params.toString()}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(message)}`);
    }
  }

  async refresh(req: Request<unknown, unknown, RefreshTokenSchema>, res: Response): Promise<void> {
    const result = await authService.refresh(req.body.refreshToken);
    res.json({ success: true, data: result });
  }

  async logout(req: Request<unknown, unknown, RefreshTokenSchema>, res: Response): Promise<void> {
    await authService.logout(
      req.auth!.isAdmin ? null : req.auth!.userId,
      req.auth!.isAdmin,
      req.body.refreshToken
    );
    res.json({ success: true, message: 'Logged out successfully' });
  }

  async logoutAll(req: Request, res: Response): Promise<void> {
    await authService.logoutAll(
      req.auth!.isAdmin ? null : req.auth!.userId,
      req.auth!.isAdmin
    );
    res.json({ success: true, message: 'Logged out from all devices' });
  }

  async me(req: Request, res: Response): Promise<void> {
    const user = await authService.getMe(req.auth!.userId, req.auth!.isAdmin);
    res.json({ success: true, data: user });
  }
}

export const authController = new AuthController();
