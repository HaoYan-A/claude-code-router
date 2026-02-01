import type { Request, Response } from 'express';
import { proxyService } from './proxy.service.js';

export class ProxyController {
  async handleProxy(req: Request, res: Response): Promise<void> {
    const proxyPath = req.path.replace(/^\/proxy/, '');

    await proxyService.proxyRequest(
      {
        method: req.method,
        path: proxyPath,
        headers: this.getForwardHeaders(req),
        body: req.body,
        userId: req.proxyAuth!.userId,
        apiKeyId: req.proxyAuth!.apiKeyId,
        clientIp: req.ip,
        userAgent: req.get('user-agent'),
      },
      res
    );
  }

  private getForwardHeaders(req: Request): Record<string, string> {
    const headers: Record<string, string> = {};
    const forwardHeaders = ['anthropic-version', 'anthropic-beta'];

    for (const header of forwardHeaders) {
      const value = req.get(header);
      if (value) {
        headers[header] = value;
      }
    }

    return headers;
  }
}

export const proxyController = new ProxyController();
