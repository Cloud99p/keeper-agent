/**
 * Webhook Manager
 * 
 * Manages pending webhook callbacks for bundle submissions.
 * When a bundle is submitted with a webhookUrl, the result is
 * POSTed back to that URL once the outcome is known.
 * 
 * Format: POST { bundleId, status, slot, signature?, error?, pricing? }
 */

import https from 'https';
import http from 'http';

export interface PendingWebhook {
  id: string;
  bundleId: string;
  url: string;
  status: 'pending' | 'delivered' | 'failed';
  createdAt: number;
  deliveredAt?: number;
  attempts: number;
  lastError?: string;
  payload?: any;
}

class WebhookManager {
  private pending: Map<string, PendingWebhook> = new Map();
  private maxRetries: number = 3;
  private retryDelayMs: number = 5_000;

  /**
   * Register a new webhook callback
   */
  register(bundleId: string, url: string, payload?: any): string {
    const id = `wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    this.pending.set(id, {
      id,
      bundleId,
      url,
      status: 'pending',
      createdAt: Date.now(),
      attempts: 0,
      payload,
    });
    console.log(`[WEBHOOK] Registered ${id} for bundle ${bundleId} → ${url}`);
    return id;
  }

  /**
   * Fire a webhook with the bundle result
   */
  async fire(bundleId: string, result: any): Promise<void> {
    // Find all webhooks for this bundle
    const hooks = Array.from(this.pending.values())
      .filter(h => h.bundleId === bundleId && h.status === 'pending');

    for (const hook of hooks) {
      await this.deliver(hook, result);
    }
  }

  /**
   * Get pending webhooks
   */
  getPending(): PendingWebhook[] {
    return Array.from(this.pending.values());
  }

  /**
   * Get webhook count by status
   */
  getStats() {
    const all = Array.from(this.pending.values());
    return {
      total: all.length,
      pending: all.filter(h => h.status === 'pending').length,
      delivered: all.filter(h => h.status === 'delivered').length,
      failed: all.filter(h => h.status === 'failed').length,
    };
  }

  private async deliver(hook: PendingWebhook, result: any): Promise<void> {
    const payload = {
      bundleId: hook.bundleId,
      ...result,
      webhookId: hook.id,
      timestamp: new Date().toISOString(),
    };

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      hook.attempts = attempt;
      try {
        await this.post(hook.url, payload);
        hook.status = 'delivered';
        hook.deliveredAt = Date.now();
        console.log(`[WEBHOOK] Delivered ${hook.id} OK (attempt ${attempt})`);
        return;
      } catch (err: any) {
        hook.lastError = err.message;
        console.warn(`[WEBHOOK] Deliver ${hook.id} failed (attempt ${attempt}/${this.maxRetries}): ${err.message}`);
        if (attempt < this.maxRetries) {
          await new Promise(r => setTimeout(r, this.retryDelayMs * attempt));
        }
      }
    }

    hook.status = 'failed';
    console.error(`[WEBHOOK] Deliver ${hook.id} FAILED after ${this.maxRetries} attempts`);
  }

  private post(url: string, payload: any): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const body = JSON.stringify(payload);
        const urlObj = new URL(url);
        const requester = url.startsWith('https') ? https : http;
        const req = requester.request(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'User-Agent': 'SolanaMEVAgent/3.0.0 (Webhook)',
          },
          timeout: 10_000,
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
            }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(body);
        req.end();
      } catch (e: any) {
        reject(e);
      }
    });
  }
}

// Singleton
let _instance: WebhookManager | null = null;
export function getWebhookManager(): WebhookManager {
  if (!_instance) _instance = new WebhookManager();
  return _instance;
}

export default WebhookManager;
