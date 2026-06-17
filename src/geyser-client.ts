/**
 * Geyser Client for Real-Time Solana Data Streaming
 * Windows-compatible implementation
 */

import { Connection, PublicKey } from '@solana/web3.js';

export interface GeyserConfig {
  url: string;
  accessToken?: string;
  accountsOfInterest: string[];
  programsOfInterest: string[];
}

export interface AccountUpdate {
  pubkey: PublicKey;
  lamports: number;
  owner: PublicKey;
  executable: boolean;
  rentEpoch: number;
  data: Buffer;
  writeVersion: number;
  txnSignature?: string;
}

export class GeyserClient {
  private config: GeyserConfig;
  private connection: Connection | null = null;
  private isConnected: boolean = false;
  private eventQueue: Array<{
    type: string;
    timestamp: number;
    data: any;
  }> = [];

  constructor() {
    this.config = {
      url: process.env.GEYSER_URL || '',
      accessToken: process.env.GEYSER_ACCESS_TOKEN,
      accountsOfInterest: (process.env.ACCOUNTS_OF_INTEREST || '').split(',').filter(Boolean),
      programsOfInterest: (process.env.PROGRAMS_OF_INTEREST || '').split(',').filter(Boolean)
    };
  }

  /**
   * Connect to Geyser stream
   */
  async connect(): Promise<void> {
    console.log('[GEYSER] Connecting...');

    try {
      if (this.config.url) {
        // Use Yellowstone gRPC if configured
        await this.connectViaGrpc();
      } else {
        // Fallback to WebSocket subscription
        await this.connectViaWebSocket();
      }

      this.isConnected = true;
      console.log('[GEYSER] Connected successfully');
    } catch (error: any) {
      console.warn('[GEYSER] Connection failed:', error.message);
      console.log('[GEYSER] Running in offline mode');
      this.isConnected = false;
    }
  }

  /**
   * Connect via gRPC (Yellowstone)
   */
  private async connectViaGrpc(): Promise<void> {
    // Note: For full gRPC support, consider using WSL2 or Docker
    // This is a placeholder for future implementation
    console.log('[GEYSER] gRPC mode requested (requires WSL2 for full support)');
    await this.connectViaWebSocket();
  }

  /**
   * Connect via WebSocket (fallback)
   */
  private async connectViaWebSocket(): Promise<void> {
    const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
    const wsUrl = rpcUrl.replace('https', 'wss');
    
    this.connection = new Connection(wsUrl, {
      commitment: 'confirmed',
      wsEndpoint: wsUrl
    });

    console.log('[GEYSER] WebSocket connection established');

    // Subscribe to accounts of interest
    if (this.config.accountsOfInterest.length > 0) {
      await this.subscribeToAccounts();
    }

    // Subscribe to programs of interest
    if (this.config.programsOfInterest.length > 0) {
      await this.subscribeToPrograms();
    }
  }

  /**
   * Subscribe to specific accounts
   */
  private async subscribeToAccounts(): Promise<void> {
    if (!this.connection) return;

    for (const accountPubkey of this.config.accountsOfInterest) {
      try {
        const pubkey = new PublicKey(accountPubkey);
        
        this.connection.onAccountChange(
          pubkey,
          (accountInfo) => {
            this.handleAccountUpdate(pubkey, accountInfo);
          },
          'confirmed'
        );

        console.log(`[GEYSER] Subscribed to account: ${accountPubkey.slice(0, 8)}...`);
      } catch (error: any) {
        console.warn(`[GEYSER] Failed to subscribe to ${accountPubkey}:`, error.message);
      }
    }
  }

  /**
   * Subscribe to specific programs
   */
  private async subscribeToPrograms(): Promise<void> {
    if (!this.connection) return;

    for (const programPubkey of this.config.programsOfInterest) {
      try {
        const pubkey = new PublicKey(programPubkey);
        
        this.connection.onProgramAccountChange(
          pubkey,
          (accountInfo) => {
            this.handleAccountUpdate(pubkey, accountInfo);
          },
          'confirmed'
        );

        console.log(`[GEYSER] Subscribed to program: ${programPubkey.slice(0, 8)}...`);
      } catch (error: any) {
        console.warn(`[GEYSER] Failed to subscribe to ${programPubkey}:`, error.message);
      }
    }
  }

  /**
   * Handle account update
   */
  private handleAccountUpdate(pubkey: PublicKey, accountInfo: any): void {
    const update: AccountUpdate = {
      pubkey,
      lamports: accountInfo.lamports,
      owner: accountInfo.owner,
      executable: accountInfo.executable,
      rentEpoch: accountInfo.rentEpoch,
      data: accountInfo.data,
      writeVersion: Date.now(),
      txnSignature: undefined
    };

    this.eventQueue.push({
      type: 'account_update',
      timestamp: Date.now(),
      data: update
    });

    // Keep queue size manageable
    if (this.eventQueue.length > 1000) {
      this.eventQueue.shift();
    }

    // Log update
    console.log(`[GEYSER] Account update: ${pubkey.toString().slice(0, 8)}... | Lamports: ${accountInfo.lamports}`);
  }

  /**
   * Disconnect from Geyser
   */
  async disconnect(): Promise<void> {
    console.log('[GEYSER] Disconnecting...');

    if (this.connection) {
      // Note: Solana web3.js doesn't expose a direct disconnect method
      // The connection will be garbage collected
      this.connection = null;
    }

    this.isConnected = false;
    console.log('[GEYSER] Disconnected');
  }

  /**
   * Get recent events from queue
   */
  getRecentEvents(limit: number = 10): Array<any> {
    return this.eventQueue.slice(-limit);
  }

  /**
   * Check if connected
   */
  isHealthy(): boolean {
    return this.isConnected;
  }

  /**
   * Get connection stats
   */
  getStats(): {
    isConnected: boolean;
    eventQueueSize: number;
    accountsSubscribed: number;
    programsSubscribed: number;
  } {
    return {
      isConnected: this.isConnected,
      eventQueueSize: this.eventQueue.length,
      accountsSubscribed: this.config.accountsOfInterest.length,
      programsSubscribed: this.config.programsOfInterest.length
    };
  }
}
