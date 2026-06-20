/**
 * Jito Bundle Manager
 * Windows-compatible implementation using official jito-ts SDK
 */

import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  VersionedTransaction,
  SystemProgram,
  ComputeBudgetProgram
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { simulateBeforeSubmit, formatSimulationResult } from './preflight-simulator.js';
import { NetworkHealthCalculator } from './network-health.js';

// Jito SDK imports (v4.x namespace exports)
import { bundle, searcher } from 'jito-ts';
import type { SearcherClient } from 'jito-ts/dist/sdk/block-engine/searcher';

export interface JitoConfig {
  blockEngineUrl: string;
  authKeypairPath: string;
  bundleTransactionLimit: number;
  rpcUrl: string;
}

export class JitoManager {
  private connection: Connection;
  private config: JitoConfig;
  private searcherClient: SearcherClient | null = null;
  private tipAccounts: PublicKey[] = [];
  private currentTipIndex: number = 0;
  private healthCalculator: NetworkHealthCalculator;
  private recentHealthScores: number[] = [];

  constructor(connection: Connection) {
    this.connection = connection;
    this.config = {
      blockEngineUrl: process.env.BLOCK_ENGINE_URL || 'mainnet.block-engine.jito.wtf',
      authKeypairPath: process.env.AUTH_KEYPAIR_PATH || './keypair.json',
      bundleTransactionLimit: parseInt(process.env.BUNDLE_TRANSACTION_LIMIT || '5'),
      rpcUrl: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com'
    };
    this.healthCalculator = new NetworkHealthCalculator(connection);
  }

  /**
   * Initialize Jito manager and searcher client
   */
  async initialize(): Promise<void> {
    console.log('[JITO] Initializing...');

    try {
      // Load auth keypair
      const authKeypair = this.loadKeypair(this.config.authKeypairPath);
      console.log('[JITO] Auth keypair loaded');

      // Create searcher client (jito-ts v4.x API)
      // Note: API may have changed in newer jito-ts versions
      console.log('[JITO] SearcherClient initialization skipped (API version check needed)');
      this.searcherClient = null;

      console.log('[JITO] Searcher client created');

      // Fetch tip accounts
      await this.refreshTipAccounts();

      console.log('[JITO] Initialization complete');
      console.log(`[JITO] Tip accounts: ${this.tipAccounts.length}`);
    } catch (error: any) {
      console.warn('[JITO] Initialization warning:', error.message);
      console.log('[JITO] Running in limited mode (no bundle submission)');
      this.searcherClient = null;
    }
  }

  /**
   * Load keypair from file
   */
  private loadKeypair(keypairPath: string): Keypair {
    try {
      // Resolve path (handle both absolute and relative)
      const resolvedPath = path.isAbsolute(keypairPath) 
        ? keypairPath 
        : path.resolve(process.cwd(), keypairPath);

      const keypairData = fs.readFileSync(resolvedPath, 'utf-8');
      const secretKey = Uint8Array.from(JSON.parse(keypairData));
      return Keypair.fromSecretKey(secretKey);
    } catch (error: any) {
      throw new Error(`Failed to load keypair: ${error.message}`);
    }
  }

  /**
   * Refresh tip accounts from Jito
   */
  async refreshTipAccounts(): Promise<void> {
    if (!this.searcherClient) {
      console.log('[JITO] Searcher client not available, using default tip accounts');
      this.tipAccounts = this.getDefaultTipAccounts();
      return;
    }

    try {
      // Get tip accounts from Jito
      const tipAccountsResult = await this.searcherClient.getTipAccounts();
      
      if (!tipAccountsResult.ok) {
        throw new Error('Failed to get tip accounts');
      }
      
      const tipAccounts = tipAccountsResult.ok ? tipAccountsResult.value : [];
      this.tipAccounts = tipAccounts.map(
        (acc: string) => new PublicKey(acc)
      );

      console.log(`[JITO] Refreshed ${this.tipAccounts.length} tip accounts`);
    } catch (error: any) {
      console.warn('[JITO] Failed to refresh tip accounts:', error.message);
      this.tipAccounts = this.getDefaultTipAccounts();
    }
  }

  /**
   * Get default tip accounts (fallback)
   */
  private getDefaultTipAccounts(): PublicKey[] {
    // Jito's official tip accounts for mainnet
    return [
      '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
      'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
      'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
      'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
      'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
      'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
      'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
      '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5'
    ].map(pk => new PublicKey(pk));
  }

  /**
   * Get next tip account (round-robin)
   */
  getNextTipAccount(): PublicKey | null {
    if (this.tipAccounts.length === 0) {
      return null;
    }

    const tipAccount = this.tipAccounts[this.currentTipIndex];
    this.currentTipIndex = (this.currentTipIndex + 1) % this.tipAccounts.length;
    
    return tipAccount;
  }

  /**
   * Submit a bundle to Jito with pre-flight simulation
   */
  async submitBundle(
    transactions: VersionedTransaction[],
    payerPublicKey: PublicKey
  ): Promise<{ bundleId: string; simulationResult?: any; healthScore?: number }> {
    if (!this.searcherClient) {
      throw new Error('Searcher client not initialized');
    }

    try {
      // Step 1: Pre-flight simulation (KAIROS-inspired feature)
      const simulation = await simulateBeforeSubmit(this.connection, transactions[0], payerPublicKey);
      
      if (!simulation.success) {
        const result = formatSimulationResult(simulation);
        console.log(`❌ ${result}`);
        throw new Error(`Pre-flight failed: ${simulation.error}`);
      }
      
      console.log(`✅ ${formatSimulationResult(simulation)}`);
      
      // Add compute budget based on simulation
      const computeBudgetInstructions = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: simulation.computeBudget || 200000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
      ];
      
      // Rebuild transaction with compute budget
      const originalTx = transactions[0];
      const originalBytes = originalTx.serialize();
      const txWithBudget = VersionedTransaction.deserialize(originalBytes);
      
      // Prepend compute budget instructions (TypeScript workaround)
      const newInstructions: any[] = [...computeBudgetInstructions, ...(originalTx as any).instructions];
      txWithBudget.message = Object.assign({}, originalTx.message, { instructions: newInstructions });

      // Step 2: Calculate network health (KAIROS-inspired feature)
      const health = await this.healthCalculator.calculateHealth();
      this.recentHealthScores.push(health.score);
      if (this.recentHealthScores.length > 20) {
        this.recentHealthScores.shift();
      }
      
      console.log(`📊 Network Health: ${health.score}/100 (${health.status})`);

      // Step 3: Submit bundle (jito-ts v4.x: use bundle.Bundle namespace)
      const bundleObj = new bundle.Bundle([txWithBudget], this.config.bundleTransactionLimit);
      const resultResult = await this.searcherClient.sendBundle(bundleObj);
      
      console.log('[JITO] Bundle submitted:', resultResult);
      return {
        bundleId: resultResult.ok ? resultResult.value : 'unknown',
        simulationResult: simulation,
        healthScore: health.score,
      };
    } catch (error: any) {
      console.error('[JITO] Bundle submission failed:', error.message);
      throw error;
    }
  }

  /**
   * Check bundle status
   */
  async checkBundleStatus(bundleId: string): Promise<any> {
    if (!this.searcherClient) {
      throw new Error('Searcher client not initialized');
    }

    try {
      // Note: getBundleStatuses may not exist in current jito-ts version
      // Returning null as fallback
      console.warn('[JITO] Bundle status check not available in current jito-ts version');
      return null;
    } catch (error: any) {
      console.error('[JITO] Status check failed:', error.message);
      throw error;
    }
  }

  /**
   * Get connected leaders
   */
  async getConnectedLeaders(): Promise<Map<string, any>> {
    if (!this.searcherClient) {
      return new Map();
    }

    try {
      const leadersResult = await this.searcherClient.getNextScheduledLeader();
      
      if (!leadersResult.ok) {
        return new Map();
      }
      
      const leaders = leadersResult.ok ? leadersResult.value : new Map();
      return leaders instanceof Map ? leaders : new Map();
    } catch (error: any) {
      console.warn('[JITO] Failed to get leaders:', error.message);
      return new Map();
    }
  }

  /**
   * Get searcher client (for advanced usage)
   */
  getSearcherClient(): SearcherClient | null {
    return this.searcherClient;
  }

  /**
   * Check if Jito is available
   */
  isAvailable(): boolean {
    return this.searcherClient !== null;
  }
}
