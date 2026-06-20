/**
 * DeepSeek API Client
 * 
 * Provides AI-powered reasoning for bundle failure analysis.
 * Uses DeepSeek's chat completion API for enhanced decision-making.
 * 
 * Features:
 * - Enhanced failure analysis with LLM reasoning
 * - Confidence scoring from AI
 * - Natural language explanations
 * - Fallback to local reasoning if API unavailable
 */

import { Config } from './config.js';
import { FailureType, BundleStage, FailureContext } from './lifecycle.js';

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekResponse {
  id: string;
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface DeepSeekDecision {
  action: 'retry' | 'abort' | 'wait_and_retry';
  tip_adjustment_percent: number;
  blockhash_refresh: boolean;
  delay_ms: number;
  reasoning_summary: string;
  confidence: number;
  ai_analysis: string;
}

export class DeepSeekClient {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private enabled: boolean;
  private timeoutMs: number;

  constructor(config: Config) {
    this.apiKey = process.env.AI_API_KEY || '';
    this.model = process.env.AI_MODEL || 'deepseek-chat';
    this.baseUrl = 'https://api.deepseek.com/v1';
    this.timeoutMs = parseInt(process.env.AI_TIMEOUT_MS || '30000', 10); // Default 30s
    this.enabled = !!this.apiKey && this.apiKey !== 'sk-your-deepseek-api-key-here';
    
    if (this.enabled) {
      console.log('[DEEPSEEK] Client initialized with model:', this.model, `(timeout: ${this.timeoutMs}ms)`);
    } else {
      console.warn('[DEEPSEEK] API key not configured, falling back to local reasoning');
    }
  }

  /**
   * Analyze failure using DeepSeek API
   * 
   * Sends failure context to DeepSeek and gets AI-powered decision.
   * Falls back to local reasoning if API call fails.
   */
  async analyzeFailure(context: FailureContext): Promise<DeepSeekDecision | null> {
    if (!this.enabled) {
      console.log('[DEEPSEEK] Skipping API call (not enabled)');
      return null;
    }

    try {
      const prompt = this.buildPrompt(context);
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are an expert Solana blockchain engineer specializing in Jito MEV bundle optimization.
Your task is to analyze bundle submission failures and recommend retry strategies.

You must output a JSON object with this exact structure:
{
  "action": "retry" | "abort" | "wait_and_retry",
  "tip_adjustment_percent": number (0-200),
  "blockhash_refresh": boolean,
  "delay_ms": number (0-10000),
  "reasoning_summary": string (concise, 1-2 sentences),
  "confidence": number (0-1),
  "ai_analysis": string (detailed analysis)
}

Guidelines:
- Be conservative with retries when confidence is low
- Consider blockhash age (150 slots validity window)
- Factor in network congestion (skip rate > 0.2 = congested)
- Poor leader quality (< 0.6) needs higher tip incentives
- Fee failures need aggressive tip increases (50-150%)
- Blockhash expiry needs refresh + moderate tip increase (25-50%)
- Abort only for unrecoverable errors or very low confidence (< 0.3)`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 1000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[DEEPSEEK] API error:', response.status, errorText);
        return null;
      }

      const data = await response.json() as DeepSeekResponse;
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        console.warn('[DEEPSEEK] Empty response from API');
        return null;
      }

      // Parse JSON from response (might be wrapped in markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[DEEPSEEK] Could not parse JSON from response:', content);
        return null;
      }

      const decision: DeepSeekDecision = JSON.parse(jsonMatch[0]);
      
      // Validate decision structure
      if (!this.validateDecision(decision)) {
        console.warn('[DEEPSEEK] Invalid decision structure');
        return null;
      }

      console.log('[DEEPSEEK] Analysis complete:', {
        action: decision.action,
        confidence: decision.confidence,
        tipAdjustment: decision.tip_adjustment_percent,
      });

      return decision;

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error(`[DEEPSEEK] API call timed out after ${this.timeoutMs}ms`);
      } else {
        console.error('[DEEPSEEK] API call failed:', error);
      }
      return null; // Fallback to local reasoning
    }
  }

  /**
   * Build prompt from failure context
   */
  private buildPrompt(context: FailureContext): string {
    const {
      failureType,
      failureStage,
      submissionSlot,
      blockhashAge,
      slotConditions,
      recentTips,
      submissionLatency,
    } = context;

    const tipStats = recentTips.length > 0 ? {
      min: Math.min(...recentTips),
      max: Math.max(...recentTips),
      avg: Math.round(recentTips.reduce((a, b) => a + b, 0) / recentTips.length),
      median: [...recentTips].sort((a, b) => a - b)[Math.floor(recentTips.length / 2)],
    } : null;

    return `Analyze this Solana Jito bundle failure:

FAILURE DETAILS:
- Type: ${failureType}
- Stage: ${failureStage}
- Submission Slot: ${submissionSlot}
- Blockhash Age: ${blockhashAge} slots (${150 - blockhashAge} slots remaining before expiry)
- Submission Latency: ${submissionLatency}ms

NETWORK CONDITIONS:
- Skip Rate: ${(slotConditions.skipRate * 100).toFixed(1)}%
- Congestion Level: ${(slotConditions.congestionLevel * 100).toFixed(1)}%
- Leader Quality: ${(slotConditions.leaderQuality * 100).toFixed(1)}%

TIP MARKET (recent landed bundles):
${tipStats ? `- Range: ${tipStats.min}-${tipStats.max} lamports
- Average: ${tipStats.avg} lamports
- Median: ${tipStats.median} lamports` : '- No recent tip data available'}

Provide your recommended retry strategy in JSON format.`;
  }

  /**
   * Validate decision structure
   */
  private validateDecision(decision: DeepSeekDecision): boolean {
    const validActions = ['retry', 'abort', 'wait_and_retry'];
    
    return (
      typeof decision === 'object' &&
      validActions.includes(decision.action) &&
      typeof decision.tip_adjustment_percent === 'number' &&
      decision.tip_adjustment_percent >= 0 &&
      decision.tip_adjustment_percent <= 200 &&
      typeof decision.blockhash_refresh === 'boolean' &&
      typeof decision.delay_ms === 'number' &&
      decision.delay_ms >= 0 &&
      decision.delay_ms <= 10000 &&
      typeof decision.reasoning_summary === 'string' &&
      typeof decision.confidence === 'number' &&
      decision.confidence >= 0 &&
      decision.confidence <= 1 &&
      typeof decision.ai_analysis === 'string'
    );
  }

  /**
   * Check if DeepSeek is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current model
   */
  getModel(): string {
    return this.model;
  }
}
