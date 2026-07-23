/**
 * Jito Tip Oracle
 * 
 * Fetches real-time tip floor from Jito API and caches it.
 * Falls back to heuristic estimates when API is unavailable.
 * 
 * API: https://bundles.jito.wtf/api/v1/bundles/tip_floor
 * Returns array of: { time, landed_tips_25th/50th/75th/95th/99th_percentile, ema_landed_tips_50th_percentile }
 * All values in SOL (not lamports).
 * We use ema_landed_tips_50th_percentile for the recommended tip.
 */

import https from 'https';
import http from 'http';

interface JitoTipFloor {
  landing: number;    // lamports — recommended tip for next slot inclusion
  confirmed: number;  // lamports — slightly lower, confirmed within a few slots
  timestamp: number;
}

interface JitoApiResponseEntry {
  time: string;
  landed_tips_25th_percentile: number;
  landed_tips_50th_percentile: number;
  landed_tips_75th_percentile: number;
  landed_tips_95th_percentile: number;
  landed_tips_99th_percentile: number;
  ema_landed_tips_50th_percentile: number;
}

interface CachedTip {
  data: JitoTipFloor | null;
  fetchedAt: number;
}

export class TipOracle {
  private cache: CachedTip = { data: null, fetchedAt: 0 };
  private cacheTtlMs: number;
  private apiUrl: string;
  private lastSource: 'api' | 'stale' | 'heuristic' = 'heuristic';

  constructor(cacheTtlMs: number = 30_000) {
    this.cacheTtlMs = cacheTtlMs;
    this.apiUrl = 'https://bundles.jito.wtf/api/v1/bundles/tip_floor';
  }

  /**
   * Get the current tip floor from Jito API (cached)
   */
  async getTipFloor(): Promise<JitoTipFloor> {
    const now = Date.now();
    if (this.cache.data && (now - this.cache.fetchedAt) < this.cacheTtlMs) {
      return this.cache.data;
    }

    try {
      const result = await this.fetchTipFloor();
      this.cache = { data: result, fetchedAt: now };
      this.lastSource = 'api';
      return result;
    } catch (err: any) {
      console.warn('[TIP-ORACLE] API fetch failed:', err.message);
      this.lastSource = this.cache.data ? 'stale' : 'heuristic';
      if (this.cache.data) return this.cache.data;
      return {
        landing: 10_000,
        confirmed: 5_000,
        timestamp: now,
      };
    }
  }

  /**
   * Get a recommended tip in lamports
   * @param priority low/medium/high — affects tip multiplier
   */
  async getRecommendedTip(priority: 'low' | 'medium' | 'high' = 'medium'): Promise<{
    lamports: number;
    source: 'api' | 'stale' | 'heuristic';
    floor: JitoTipFloor;
  }> {
    const floor = await this.getTipFloor();
    const now = Date.now();
    const source = this.cache.data && this.cache.fetchedAt > 0 && (now - this.cache.fetchedAt) < Math.max(this.cacheTtlMs, 100)
      ? 'api'
      : this.cache.data ? 'stale' : 'heuristic';

    const multipliers: Record<string, number> = {
      low: 0.8,
      medium: 1.0,
      high: 1.5,
    };

    const base = floor.landing;
    const lamports = Math.max(Math.round(base * (multipliers[priority] || 1.0)), 1000);

    return { lamports, source: this.lastSource, floor };
  }

  /**
   * Get the tip floor in SOL (human readable)
   */
  async getTipFloorSol(): Promise<number> {
    const floor = await this.getTipFloor();
    return floor.landing / 1_000_000_000;
  }

  /**
   * Get market context for AI reasoning
   */
  async getMarketContext(): Promise<{
    tipFloorLamports: number;
    tipFloorSol: number;
    confidence: 'api' | 'stale' | 'heuristic';
  }> {
    const rec = await this.getRecommendedTip('medium');
    return {
      tipFloorLamports: rec.floor.landing,
      tipFloorSol: rec.floor.landing / 1_000_000_000,
      confidence: rec.source as 'api' | 'stale' | 'heuristic',
    };
  }

  private fetchTipFloor(): Promise<JitoTipFloor> {
    return new Promise((resolve, reject) => {
      const requester = this.apiUrl.startsWith('https') ? https : http;
      requester.get(this.apiUrl, { timeout: 10_000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            // API returns array: [{ time, landed_tips_25th_percentile, ..., ema_landed_tips_50th_percentile }]
            // All values are in SOL — convert to lamports
            if (Array.isArray(parsed)) {
              const entry: JitoApiResponseEntry = parsed[0];
              if (!entry || entry.ema_landed_tips_50th_percentile === undefined) {
                reject(new Error('Unexpected API response format: missing ema_landed_tips_50th_percentile'));
                return;
              }
              // Convert SOL → lamports
              const emaLanded = Math.round(entry.ema_landed_tips_50th_percentile * 1_000_000_000);
              const p50 = entry.landed_tips_50th_percentile
                ? Math.round(entry.landed_tips_50th_percentile * 1_000_000_000)
                : emaLanded;
              const p75 = entry.landed_tips_75th_percentile
                ? Math.round(entry.landed_tips_75th_percentile * 1_000_000_000)
                : emaLanded;
              // EMA 50th (smoothed median) is most reliable for competitive tip
              // Apply 1.3x buffer to beat the median
              // Cap at p75 to avoid outlier-driven overpayment
              const baseTip = Math.round(emaLanded * 1.3);
              const landing = Math.min(Math.max(baseTip, 1000), p75);
              const confirmed = Math.max(p50, 1000);
              resolve({ landing, confirmed, timestamp: Date.now() });
            } else if (typeof parsed === 'object' && parsed.landing !== undefined) {
              // Legacy format fallback — values already in lamports
              resolve({
                landing: Math.round(parsed.landing),
                confirmed: Math.round(parsed.confirmed || parsed.landing * 0.8),
                timestamp: Date.now(),
              });
            } else {
              reject(new Error('Unexpected API response format'));
            }
          } catch (e: any) {
            reject(new Error(`Parse error: ${e.message}`));
          }
        });
      }).on('error', reject).on('timeout', function(this: any) { this.destroy(); reject(new Error('Timeout')); });
    });
  }
}

// Singleton for server-wide use
let _instance: TipOracle | null = null;
export function getTipOracle(ttlMs?: number): TipOracle {
  if (!_instance) _instance = new TipOracle(ttlMs);
  return _instance;
}

// Re-export for convenience
export const getTipFloor = () => getTipOracle().getTipFloor();
export const getRecommendedTip = (p?: 'low' | 'medium' | 'high') => getTipOracle().getRecommendedTip(p);
export const getMarketContext = () => getTipOracle().getMarketContext();
