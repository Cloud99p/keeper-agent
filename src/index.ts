/**
 * Solana Transaction Stack - Main Entry Point
 * Windows-compatible implementation using jito-ts SDK
 */

import dotenv from 'dotenv';
import { Connection, clusterApiUrl, PublicKey } from '@solana/web3.js';
import { JitoManager } from './jito-manager.js';
import { GeyserClient } from './geyser-client.js';
import { TxBuilder } from './tx-builder.js';

// Load environment variables
dotenv.config();

class SolanaTxStack {
  private connection: Connection;
  private jitoManager: JitoManager;
  private geyserClient: GeyserClient;
  private txBuilder: TxBuilder;

  constructor() {
    // Initialize Solana connection
    const rpcUrl = process.env.RPC_URL || clusterApiUrl('mainnet-beta');
    this.connection = new Connection(rpcUrl, {
      commitment: process.env.SOLANA_COMMITMENT as any || 'confirmed',
      wsEndpoint: rpcUrl.replace('https', 'wss')
    });

    // Initialize components
    this.jitoManager = new JitoManager(this.connection);
    this.geyserClient = new GeyserClient();
    this.txBuilder = new TxBuilder(this.connection);

    console.log('✅ SolanaTxStack initialized');
    console.log(`   RPC: ${rpcUrl}`);
    console.log(`   Cluster: ${process.env.SOLANA_CLUSTER || 'mainnet-beta'}`);
  }

  /**
   * Start all services
   */
  async start(): Promise<void> {
    console.log('\n🚀 Starting Solana Transaction Stack...\n');

    try {
      // Initialize Jito (bundle submission)
      await this.jitoManager.initialize();
      console.log('✅ Jito Manager initialized');

      // Initialize Geyser (real-time streaming)
      await this.geyserClient.connect();
      console.log('✅ Geyser Client connected');

      // Start monitoring
      await this.startMonitoring();

      console.log('\n✅ All services started successfully!\n');
    } catch (error: any) {
      console.error('❌ Failed to start services:', error.message);
      throw error;
    }
  }

  /**
   * Start monitoring loop
   */
  private async startMonitoring(): Promise<void> {
    console.log('📊 Starting monitoring loop...');

    // Example: Monitor for opportunities every 5 seconds
    setInterval(async () => {
      try {
        await this.checkOpportunities();
      } catch (error: any) {
        console.error('Monitoring error:', error.message);
      }
    }, 5000);
  }

  /**
   * Check for trading/arbitrage opportunities
   */
  private async checkOpportunities(): Promise<void> {
    // Implement your strategy logic here
    // This is a placeholder for demonstration

    const slot = await this.connection.getSlot();
    const tipAccount = await this.jitoManager.getNextTipAccount();

    console.log(`[Slot ${slot}] Checking opportunities... Tip: ${tipAccount?.toString().slice(0, 8)}...`);
  }

  /**
   * Submit a bundle via Jito
   */
  async submitBundle(transactions: Buffer[]): Promise<string | null> {
    try {
      const bundleId = await this.jitoManager.submitBundle(transactions);
      console.log('✅ Bundle submitted:', bundleId);
      return bundleId;
    } catch (error: any) {
      console.error('❌ Bundle submission failed:', error.message);
      return null;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('\n🛑 Shutting down...');

    await this.geyserClient.disconnect();
    console.log('✅ Geyser client disconnected');

    console.log('✅ Shutdown complete\n');
  }
}

// Main execution
async function main() {
  const stack = new SolanaTxStack();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await stack.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await stack.shutdown();
    process.exit(0);
  });

  try {
    await stack.start();

    // Keep the process running
    console.log('Press Ctrl+C to stop\n');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run main
main();

export { SolanaTxStack };
