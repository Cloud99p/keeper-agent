/**
 * Jito Bundle Manager
 *
 * Architecture:
 * 1. gRPC via @grpc/grpc-js + protobuf (preferred — real Jito bundles)
 * 2. Direct Solana RPC submission (fallback — works, confirmed)
 *
 * The Jito REST API does NOT support sendBundle — it only supports
 * query methods (getTipAccounts, getBundleStatuses).
 * Bundle submission requires gRPC (protobuf).
 */

import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export interface JitoConfig {
  blockEngineUrl: string;
  authKeypairPath: string;
  rpcUrl: string;
}

export class JitoManager {
  private connection: Connection;
  private config: JitoConfig;
  private tipAccounts: PublicKey[] = [];
  private currentTipIndex: number = 0;
  private keypair: Keypair | null = null;
  private _available: boolean = false;
  private grpcAvailable: boolean = false;
  private grpcClient: any = null;

  constructor(connection: Connection) {
    this.connection = connection;
    this.config = {
      blockEngineUrl: process.env.JITO_BLOCK_ENGINE_URL || 'frankfurt.mainnet.block-engine.jito.wtf',
      authKeypairPath: process.env.JITO_AUTH_KEYPAIR_PATH || '.keypair/auth-id.json',
      rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
    };
  }

  async initialize(): Promise<void> {
    console.log('[JITO] Initializing...');
    try {
      // Load auth keypair
      const resolvedPath = path.isAbsolute(this.config.authKeypairPath)
        ? this.config.authKeypairPath
        : path.resolve(process.cwd(), this.config.authKeypairPath);
      const keypairData = fs.readFileSync(resolvedPath, 'utf-8');
      const secretKey = Uint8Array.from(JSON.parse(keypairData));
      this.keypair = Keypair.fromSecretKey(secretKey);
      console.log(`[JITO] Auth keypair loaded: ${this.keypair.publicKey.toBase58()}`);

      // Try gRPC initialization (primary path)
      await this.initGrpc();

      // Get tip accounts for future use (via REST — works for queries)
      await this.fetchTipAccountsREST();

      this._available = true;
      console.log(`[JITO] Ready — gRPC: ${this.grpcAvailable ? 'YES' : 'NO'}, ${this.tipAccounts.length} tip accounts`);
    } catch (error: any) {
      console.warn('[JITO] Init warning:', error.message);
    }
  }

  private async initGrpc(): Promise<void> {
    try {
      // Try to load jito-ts gen modules (gRPC)
      const searcherPath = path.resolve(process.cwd(), 'node_modules/jito-ts/dist/gen/block-engine/searcher.js');
      if (!fs.existsSync(searcherPath)) {
        console.log('[JITO] jito-ts gen modules not found');
        return;
      }

      const searcher = require(searcherPath);

      if (!searcher.SearcherServiceClient) {
        console.log('[JITO] SearcherServiceClient not found in jito-ts gen');
        return;
      }

      const address = this.config.blockEngineUrl.includes(':')
        ? this.config.blockEngineUrl
        : this.config.blockEngineUrl + ':443';

      const grpc = require('@grpc/grpc-js');
      const channelCredentials = grpc.credentials.createSsl();
      this.grpcClient = new searcher.SearcherServiceClient(address, channelCredentials);

      // Test: fetch tip accounts via gRPC
      const tipAccounts = await this.grpcCallTipAccounts(grpc, searcher);
      if (tipAccounts && tipAccounts.length > 0) {
        this.tipAccounts = tipAccounts;
        this.grpcAvailable = true;
        console.log(`[JITO] gRPC connected — ${tipAccounts.length} tip accounts`);
      }
    } catch (err: any) {
      console.log(`[JITO] gRPC init failed (${err.message}), using direct RPC for submission`);
    }
  }

  private grpcCallTipAccounts(grpc: any, searcher: any): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + 10_000);
      this.grpcClient.GetTipAccounts({}, { deadline }, (error: any, response: any) => {
        if (error) reject(new Error(error.message));
        else resolve(response?.accounts || []);
      });
    });
  }

  private async fetchTipAccountsREST(): Promise<void> {
    try {
      const url = `https://${this.config.blockEngineUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}/api/v1/bundles`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTipAccounts', params: [] })
      });
      const data: any = await response.json();
      if (data.result && Array.isArray(data.result)) {
        this.tipAccounts = data.result.map((acc: string) => new PublicKey(acc));
      }
    } catch {
      // Use defaults if REST fails
      if (this.tipAccounts.length === 0) {
        this.tipAccounts = [
          '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
          'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
          'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
        ].map(pk => new PublicKey(pk));
      }
    }
  }

  getNextTipAccount(): PublicKey | null {
    if (this.tipAccounts.length === 0) return null;
    const tip = this.tipAccounts[this.currentTipIndex];
    this.currentTipIndex = (this.currentTipIndex + 1) % this.tipAccounts.length;
    return tip;
  }

  async submitBundle(
    transactions: VersionedTransaction[],
    payerPublicKey: PublicKey
  ): Promise<{ bundleId: string; healthScore?: number }> {
    // Path 1: gRPC bundle submission (real Jito bundles)
    if (this.grpcAvailable && this.grpcClient) {
      return this.submitBundleGRPC(transactions);
    }

    // Path 2: Direct Solana RPC (works, confirmed)
    return this.submitDirectRPC(transactions);
  }

  private async submitBundleGRPC(
    transactions: VersionedTransaction[]
  ): Promise<{ bundleId: string; healthScore?: number }> {
    const bundleModule = require(path.resolve(process.cwd(), 'node_modules/jito-ts/dist/gen/block-engine/bundle.js'));
    const packetModule = require(path.resolve(process.cwd(), 'node_modules/jito-ts/dist/gen/block-engine/packet.js'));
    const searcherModule = require(path.resolve(process.cwd(), 'node_modules/jito-ts/dist/gen/block-engine/searcher.js'));

    // Build packets
    const packets = transactions.map(tx => packetModule.Packet.create({
      data: Buffer.from(tx.serialize()),
      meta: { size: 0, addr: '', port: 0, flags: undefined, senderStake: 0 }
    }));

    const bundle = bundleModule.Bundle.create({ packets });
    const request = searcherModule.SendBundleRequest.create({ bundle });

    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + 15_000);
      this.grpcClient.SendBundle(request, { deadline }, (error: any, response: any) => {
        if (error) {
          console.log(`[JITO] gRPC SendBundle failed: ${error.message}`);
          // Fallback to direct RPC
          this.submitDirectRPC(transactions).then(resolve).catch(reject);
          return;
        }
        const bundleId = response?.uuid || `bundle_${Date.now()}`;
        console.log(`[JITO] Bundle submitted via gRPC: ${bundleId}`);
        resolve({ bundleId, healthScore: 75 });
      });
    });
  }

  private async submitDirectRPC(
    transactions: VersionedTransaction[]
  ): Promise<{ bundleId: string; healthScore?: number }> {
    console.log(`[JITO] Submitting ${transactions.length} tx(s) directly to Solana RPC`);
    const signatures: string[] = [];

    for (const tx of transactions) {
      try {
        const sig = await this.connection.sendTransaction(tx, {
          skipPreflight: true,
          maxRetries: 2,
        });
        console.log(`[JITO] Direct RPC tx: ${sig}`);
        signatures.push(sig);
      } catch (rpcErr: any) {
        console.warn(`[JITO] Direct RPC failed: ${rpcErr.message}`);
        throw rpcErr;
      }
    }

    return {
      bundleId: signatures.length > 0 ? signatures[0] : `direct_${Date.now()}`,
      healthScore: 50,
    };
  }

  isAvailable(): boolean {
    return this._available;
  }

  hasGrpc(): boolean {
    return this.grpcAvailable;
  }
}
