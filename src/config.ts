/**
 * Configuration Service
 * 
 * Centralized configuration management with environment overrides.
 * All values validated at startup with sensible defaults for devnet.
 */

import { Commitment } from '@solana/web3.js';

export interface Config {
  // Yellowstone gRPC
  yellowstoneRpcUrl: string;
  yellowstoneAuthToken?: string;

  // Jito Block Engine
  jitoBlockEngineUrl: string;
  jitoAuthKeypairPath: string;

  // Solana RPC
  solanaRpcUrl: string;
  solanaRpcToken?: string;
  solanaCommitment: Commitment;

  // Failure Agent
  agentMaxRetries: number;
  agentMinConfidence: number;
  agentVerbose: boolean;

  // Bundle Configuration
  tipPercentile: number;
  congestionMultiplier: number;
  minTipLamports: number;
  maxTipLamports: number;

  // Logging
  lifecycleLogPath: string;
  debug: boolean;
}

export interface TipCalculationFactors {
  recentLandedTips: number[];
  skipRate: number;
  leaderQuality: number;
  congestionLevel: number;
}

/**
 * Calculate dynamic tip from real on-chain data
 * 
 * Formula:
 *   baseTip = percentile(recent_landed_tips, tipPercentile)
 *   congestionMultiplier = 1.0 + (skipRate * congestionMultiplier)
 *   leaderQualityFactor = leaderHistory[leaderId]?.successRate || 1.0
 *   finalTip = baseTip * congestionMultiplier * leaderQualityFactor
 * 
 * @param factors - Real-time data from Yellowstone and Jito
 * @param config - Configuration values
 * @returns Calculated tip in lamports
 */
export function calculateDynamicTip(
  factors: TipCalculationFactors,
  config: Config
): number {
  const { recentLandedTips, skipRate, leaderQuality, congestionLevel } = factors;
  const { tipPercentile, congestionMultiplier, minTipLamports, maxTipLamports } = config;

  // Validate inputs
  if (recentLandedTips.length === 0) {
    // No historical data, use minimum safe tip
    console.warn('[CONFIG] No recent tip data, using minimum tip');
    return minTipLamports;
  }

  // Sort tips for percentile calculation
  const sortedTips = [...recentLandedTips].sort((a, b) => a - b);
  
  // Calculate percentile index
  const percentileIndex = Math.floor(sortedTips.length * tipPercentile);
  const baseTip = sortedTips[Math.min(percentileIndex, sortedTips.length - 1)] ?? minTipLamports;

  // Calculate congestion multiplier from skip rate
  // Higher skip rate = more congestion = higher tip needed
  const congestionFactor = 1.0 + (skipRate * congestionMultiplier);

  // Leader quality factor (0.5 to 1.5 range)
  // Poor leader history = higher tip to incentivize inclusion
  const leaderQualityFactor = Math.max(0.5, Math.min(1.5, leaderQuality));

  // Calculate final tip
  let finalTip = Math.round(baseTip * congestionFactor * leaderQualityFactor);

  // Apply safety bounds
  finalTip = Math.max(minTipLamports, Math.min(maxTipLamports, finalTip));

  if (config.debug) {
    console.log('[CONFIG] Tip calculation:', {
      baseTip,
      congestionFactor,
      leaderQualityFactor,
      finalTip,
      inputFactors: { skipRate, congestionLevel, leaderQuality, tipCount: recentLandedTips.length }
    });
  }

  return finalTip;
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  const config: Config = {
    // Yellowstone gRPC
    yellowstoneRpcUrl: process.env.YELLOWSTONE_RPC_URL || 'https://api.devnet.solana.com',
    yellowstoneAuthToken: process.env.YELLOWSTONE_AUTH_TOKEN,

    // Jito Block Engine
    jitoBlockEngineUrl: process.env.JITO_BLOCK_ENGINE_URL || 'https://devnet.block-engine.jito.wtf',
    jitoAuthKeypairPath: process.env.JITO_AUTH_KEYPAIR_PATH || '~/.config/solana/id.json',

    // Solana RPC
    solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    solanaRpcToken: process.env.SOLANA_RPC_TOKEN,
    solanaCommitment: (process.env.SOLANA_COMMITMENT as Commitment) || 'confirmed',

    // Failure Agent
    agentMaxRetries: parseInt(process.env.AGENT_MAX_RETRIES || '3', 10),
    agentMinConfidence: parseFloat(process.env.AGENT_MIN_CONFIDENCE || '0.6'),
    agentVerbose: process.env.AGENT_VERBOSE !== 'false',

    // Bundle Configuration
    tipPercentile: parseFloat(process.env.TIP_PERCENTILE || '0.75'),
    congestionMultiplier: parseFloat(process.env.CONGESTION_MULTIPLIER || '0.5'),
    minTipLamports: parseInt(process.env.MIN_TIP_LAMPORTS || '1000', 10),
    maxTipLamports: parseInt(process.env.MAX_TIP_LAMPORTS || '100000', 10),

    // Logging
    lifecycleLogPath: process.env.LIFECYCLE_LOG_PATH || './lifecycle_log.json',
    debug: process.env.DEBUG !== 'false',
  };

  // Validate critical configuration
  validateConfig(config);

  return config;
}

/**
 * Validate configuration values
 */
function validateConfig(config: Config): void {
  const errors: string[] = [];

  // Validate URLs
  // Yellowstone can be HTTP(S) or gRPC (host:port format)
  const isHttpUrl = config.yellowstoneRpcUrl.startsWith('http');
  const isGrpcEndpoint = config.yellowstoneRpcUrl.includes(':') && !config.yellowstoneRpcUrl.startsWith('http');
  if (!isHttpUrl && !isGrpcEndpoint) {
    errors.push('YELLOWSTONE_RPC_URL must be a valid HTTP(S) URL or gRPC endpoint (host:port)');
  }

  if (!config.jitoBlockEngineUrl.startsWith('http')) {
    errors.push('JITO_BLOCK_ENGINE_URL must be a valid HTTP(S) URL');
  }

  if (!config.solanaRpcUrl.startsWith('http')) {
    errors.push('SOLANA_RPC_URL must be a valid HTTP(S) URL');
  }

  // Validate commitment
  const validCommitments: Commitment[] = ['processed', 'confirmed', 'finalized'];
  if (!validCommitments.includes(config.solanaCommitment)) {
    errors.push(`SOLANA_COMMITMENT must be one of: ${validCommitments.join(', ')}`);
  }

  // Validate agent settings
  if (config.agentMaxRetries < 0 || config.agentMaxRetries > 10) {
    errors.push('AGENT_MAX_RETRIES must be between 0 and 10');
  }

  if (config.agentMinConfidence < 0 || config.agentMinConfidence > 1) {
    errors.push('AGENT_MIN_CONFIDENCE must be between 0 and 1');
  }

  // Validate tip settings
  if (config.tipPercentile < 0 || config.tipPercentile > 1) {
    errors.push('TIP_PERCENTILE must be between 0 and 1');
  }

  if (config.minTipLamports <= 0) {
    errors.push('MIN_TIP_LAMPORTS must be positive');
  }

  if (config.maxTipLamports <= config.minTipLamports) {
    errors.push('MAX_TIP_LAMPORTS must be greater than MIN_TIP_LAMPORTS');
  }

  // Throw if any validation errors
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  console.log('[CONFIG] Configuration validated successfully');
}

/**
 * Get blockhash validity window in slots
 * Standard Solana blockhash validity is ~150 slots (~75 seconds)
 */
export const BLOCKHASH_VALIDITY_SLOTS = 150;

/**
 * Get confirmation thresholds
 */
export const CONFIRMATION_THRESHOLDS = {
  processed: 0,    // Transaction in block
  confirmed: 32,   // 32 slots deep
  finalized: 31,   // 31+ confirmations after confirmed
} as const;
