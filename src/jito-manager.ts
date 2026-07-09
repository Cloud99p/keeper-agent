/**
 * Jito Bundle Manager — REST API version
 * Uses Jito Block Engine REST API directly (no broken jito-ts SDK)
 */

import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { NetworkHealthCalculator } from './network-health.js';
import { Keypair } from '@solana/web3.js';

export interface JitoConfig {
  blockEngineUrl: string;
  authKeypairPath: string;
  bundleTransactionLimit: number;
  rpcUrl: string;
}

export class JitoManager {
  private connection: Connection;
  private config: JitoConfig;
  private tipAccounts: PublicKey[] = [];
  private currentTipIndex: number = 0;
  private healthCalculator: NetworkHealthCalculator;
  private recentHealthScores: number[] = [];
  private keypair: Keypair | null = null;
  private _available: boolean = false;

  constructor(connection: Connection) {
    this.connection = connection;
    this.config = {
      blockEngineUrl: process.env.JITO_BLOCK_ENGINE_URL || 'https://frankfurt.mainnet.block-engine.jito.wtf',
      authKeypairPath: process.env.JITO_AUTH_KEYPAIR_PATH || '.keypair/auth-id.json',
      bundleTransactionLimit: parseInt(process.env.BUNDLE_TRANSACTION_LIMIT || '5'),
      rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
    };
    this.healthCalculator = new NetworkHealthCalculator(connection);
  }

  /**
   * Initialize Jito manager
   */
  async initialize(): Promise<void> {
    console.log('[JITO] Initializing via REST API...');
    try {
      // Load auth keypair
      const resolvedPath = path.isAbsolute(this.config.authKeypairPath)
        ? this.config.authKeypairPath
        : path.resolve(process.cwd(), this.config.authKeypairPath);
      const keypairData = fs.readFileSync(resolvedPath, 'utf-8');
      const secretKey = Uint8Array.from(JSON.parse(keypairData));
      this.keypair = Keypair.fromSecretKey(secretKey);
      console.log(`[JITO] Auth keypair loaded: ${this.keypair.publicKey.toBase58()}`);

      // Fetch tip accounts via REST
      await this.refreshTipAccounts();
      console.log(`[JITO] ${this.tipAccounts.length} tip accounts loaded`);
      this._available = true;
      console.log('[JITO] Initialization complete');
    } catch (error: any) {
      console.warn('[JITO] Initialization warning:', error.message);
      this._available = false;
    }
  }

  /**
   * Fetch tip accounts from Jito REST API
   */
  async refreshTipAccounts(): Promise<void> {
    try {
      const url = this.config.blockEngineUrl.replace(/\/+$/, '') + '/api/v1/bundles';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTipAccounts',
          params: []
        })
      });
      const data: any = await response.json();
      if (data.result && Array.isArray(data.result)) {
        this.tipAccounts = data.result.map((acc: string) => new PublicKey(acc));
      } else {
        throw new Error('Invalid tip accounts response');
      }
    } catch (error: any) {
      console.warn('[JITO] REST tip accounts failed:', error.message);
      this.tipAccounts = this.getDefaultTipAccounts();
    }
  }

  private getDefaultTipAccounts(): PublicKey[] {
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

  getNextTipAccount(): PublicKey | null {
    if (this.tipAccounts.length === 0) return null;
    const tipAccount = this.tipAccounts[this.currentTipIndex];
    this.currentTipIndex = (this.currentTipIndex + 1) % this.tipAccounts.length;
    return tipAccount;
  }

  /**
   * Submit a bundle to Jito via REST API
   */
  async submitBundle(
    transactions: VersionedTransaction[],
    payerPublicKey: PublicKey
  ): Promise<{ bundleId: string; simulationResult?: any; healthScore?: number }> {
    const url = this.config.blockEngineUrl.replace(/\/+$/, '') + '/api/v1/bundles';

    // Serialize transactions to base64
    const txArray = transactions.map(tx => Buffer.from(tx.serialize()).toString('base64'));

    // Send to Jito
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sendBundle',
        params: [txArray]
      })
    });

    const data: any = await response.json();

    if (data.error) {
      throw new Error(`Jito REST error: ${JSON.stringify(data.error)}`);
    }

    const bundleId = data.result || `bundle_${Date.now()}`;
    console.log(`[JITO] Bundle submitted: ${bundleId}`);

    return {
      bundleId,
      healthScore: 75,
    };
  }

  isAvailable(): boolean {
    return this._available;
  }
}
