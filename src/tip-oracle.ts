/**
 * Jito Tip Oracle
 * 
 * Fetches real-time tip floor from Jito API and caches it.
 * Falls back to heuristic estimates when API is unavailable.
 * 
 * API: https://bundles.jito.wtf/api/v1/bundles/tip_floor
 * Returns: { "time": "2026-07-23T...", "landing": 5123, "confirmed": 4122 }
 * landing = tip to get included in next slot
 * confirmed = tip for confirmation within a few slots
 */

import https from 'https';
import http from 'http';

interface JitoTipFloor {
  landing: number;    // lamports — next slot inclusion
  confirmed: number;  // lamports — confirmed within a few slots
  timestamp: number;
}

interface CachedTip {
  data: JitoTipFloor | null;
  fetchedAt: number;
}

export class TipOracle {
  private cache: CachedTip = { data: null, fetchedAt: 0 };
  private cacheTtlMs: number;
  private apiUrl: string;

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
      return result;
    } catch (err: any) {
      console.warn('[TIP-ORACLE] API fetch failed:', err.message);
      // Return heuristic estimate based on previous cache or default
      if (this.cache.data) return this.cache.data;
      return {
        landing: 10_000,       // 0.00001 SOL — conservative default
        confirmed: 5_000,      // 0.000005 SOL
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
    source: 'api' | 'cache' | 'heuristic';
    floor: JitoTipFloor;
  }> {
    const floor = await this.getTipFloor();
    const now = Date.now();
    const source = this.cache.data && (now - this.cache.fetchedAt) < this.cacheTtlMs
      ? 'api'
      : this.cache.data ? 'cache' : 'heuristic';

    const multipliers: Record<string, number> = {
      low: 0.8,
      medium: 1.0,
      high: 1.5,
    };

    const base = floor.landing;
    const lamports = Math.max(Math.round(base * (multipliers[priority] || 1.0)), 1000);

    return { lamports, source, floor };
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
    confidence: 'api' | 'cache' | 'heuristic';
  }> {
    const rec = await this.getRecommendedTip('medium');
    return {
      tipFloorLamports: rec.floor.landing,
      tipFloorSol: rec.floor.landing / 1_000_000_000,
      confidence: rec.source as 'api' | 'cache' | 'heuristic',
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
            // API returns object with time, landing, confirmed
            if (parsed.landing !== undefined) {
              resolve({
                landing: Math.round(parsed.landing),
                confirmed: Math.round(parsed.confirmed || parsed.landing * 0.8),
                timestamp: Date.now(),
              });
            } else if (Array.isArray(parsed)) {
              // Sometimes API returns array of recent tips
              const vals = parsed.filter((v: any) => typeof v === 'number');
              if (vals.length > 0) {
                resolve({
                  landing: Math.round(vals[0]),
                  confirmed: Math.round(vals[Math.min(2, vals.length - 1)]),
                  timestamp: Date.now(),
                });
              } else {
                reject(new Error('Unexpected API response format'));
              }
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
