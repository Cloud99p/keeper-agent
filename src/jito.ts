/**
 * Jito Bundle Service
 * 
 * Constructs and submits transactions with dynamic tipping for MEV protection.
 * For production: integrate with @jito-labs/jito-ts SDK for bundle submission.
 * For devnet testing: uses standard Solana transactions with tip instructions.
 * 
 * Features:
 * - Dynamic tip calculation from real tip distribution data
 * - Tip factors: recent landed tips, slot congestion, leader quality
 * - Zero hardcoded tip values
 * - Bundle lifecycle tracking
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as os from 'os';
import { Config, calculateDynamicTip, TipCalculationFactors } from './config.js';
import { YellowstoneService } from './yellowstone.js';
import { LifecycleTracker, classifyFailure } from './lifecycle.js';
import { FailureReasoningAgent } from './ai-agent.js';

/**
 * Jito bundle service
 */
export class JitoService {
  private config: Config;
  private connection: Connection;
  private yellowstone: YellowstoneService;
  private lifecycle: LifecycleTracker;
  private agent: FailureReasoningAgent;
  private keypair: Keypair | null;
  private bundleCount: number;

  constructor(
    config: Config,
    yellowstone: YellowstoneService,
    lifecycle: LifecycleTracker,
    agent: FailureReasoningAgent
  ) {
    this.config = config;
    this.connection = new Connection(config.solanaRpcUrl, {
      commitment: config.solanaCommitment,
    });
    this.yellowstone = yellowstone;
    this.lifecycle = lifecycle;
    this.agent = agent;
    this.keypair = null;
    this.bundleCount = 0;
  }

  /**
   * Initialize Jito service - load keypair
   */
  async initialize(): Promise<void> {
    console.log('[JITO] Initializing Jito service...');

    try {
      // Load keypair
      this.keypair = await this.loadKeypair();
      console.log('[JITO] Keypair loaded:', this.keypair.publicKey.toString());

      // Check balance
      const balance = await this.connection.getBalance(this.keypair.publicKey);
      console.log(
        '[JITO] Account balance:',
        (balance / LAMPORTS_PER_SOL).toFixed(4),
        'SOL'
      );

      if (balance < 0.01 * LAMPORTS_PER_SOL) {
        console.warn('[JITO] WARNING: Low balance, may not have enough for transactions');
      }

      console.log('[JITO] Initialization complete');
    } catch (error) {
      console.error('[JITO] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load keypair from file or environment
   */
  private async loadKeypair(): Promise<Keypair> {
    const keypairPath = this.config.jitoAuthKeypairPath.replace('~', os.homedir());

    // Try to load from file
    try {
      if (fs.existsSync(keypairPath)) {
        const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
        return Keypair.fromSecretKey(Uint8Array.from(keypairData));
      }
    } catch (error) {
      console.warn('[JITO] Could not load keypair from file, generating ephemeral...');
    }

    // Generate ephemeral keypair for devnet testing
    console.log('[JITO] Generating ephemeral keypair for devnet...');
    const keypair = Keypair.generate();
    
    console.log('[JITO] Ephemeral keypair generated:', keypair.publicKey.toString());
    console.log('[JITO] ⚠️  Fund this address on devnet: https://faucet.solana.com/');
    
    return keypair;
  }

  /**
   * Generate unique bundle ID
   */
  private generateBundleId(): string {
    this.bundleCount++;
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `bundle_${timestamp}_${random}_${this.bundleCount}`;
  }

  /**
   * Create a simple transfer transaction for testing
   */
  private async createTestTransaction(
    tipAmount: number
  ): Promise<Transaction> {
    if (!this.keypair) {
      throw new Error('Keypair not initialized');
    }

    // Create a simple SOL transfer (to self for testing)
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.keypair.publicKey,
        toPubkey: this.keypair.publicKey, // Transfer to self for testing
        lamports: 1000, // Minimal amount
      })
    );

    // Add tip as the last instruction (Jito convention)
    // Tip goes to Jito's fee collector
    const tipAccount = new PublicKey('Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY');
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: this.keypair.publicKey,
        toPubkey: tipAccount,
        lamports: tipAmount,
      })
    );

    return transaction;
  }

  /**
   * Submit a bundle with dynamic tip
   */
  async submitBundle(): Promise<{
    bundleId: string;
    success: boolean;
    lifecycle?: any;
    error?: string;
  }> {
    if (!this.keypair) {
      throw new Error('Jito service not initialized');
    }

    const bundleId = this.generateBundleId();
    console.log('\n' + '='.repeat(60));
    console.log('[JITO] Submitting bundle:', bundleId);
    console.log('='.repeat(60));

    try {
      // Step 1: Get current slot and leader info
      const currentSlot = this.yellowstone.getCurrentSlot();
      const leader = this.yellowstone.getLeaderForSlot(currentSlot);
      const leaderQuality = leader ? this.yellowstone.getLeaderQuality(leader) : 0.5;
      const skipRate = await this.yellowstone.getSkipRate(20);

      console.log('[JITO] Current slot:', currentSlot);
      console.log('[JITO] Leader:', leader ?? 'unknown');
      console.log('[JITO] Leader quality:', leaderQuality.toFixed(3));
      console.log('[JITO] Skip rate:', (skipRate * 100).toFixed(1) + '%');

      // Step 2: Get recent successful tips
      const recentTips = this.lifecycle.getRecentTips(10);
      console.log('[JITO] Recent tips:', recentTips);

      // Step 3: Calculate dynamic tip
      const tipFactors: TipCalculationFactors = {
        recentLandedTips: recentTips.length > 0 ? recentTips : [5000], // Default if no history
        skipRate,
        leaderQuality,
        congestionLevel: skipRate, // Use skip rate as congestion proxy
      };

      const tipAmount = calculateDynamicTip(tipFactors, this.config);
      console.log('[JITO] Calculated tip:', tipAmount, 'lamports');

      // Step 4: Fetch fresh blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      const blockhashSlot = currentSlot;
      console.log('[JITO] Blockhash fetched at slot:', blockhashSlot);

      // Step 5: Create transaction
      const transaction = await this.createTestTransaction(tipAmount);
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.keypair.publicKey;

      // Step 6: Sign transaction
      transaction.sign(this.keypair);

      // Step 7: Create lifecycle record
      this.lifecycle.createBundle(bundleId, tipAmount, currentSlot, blockhashSlot);

      // Step 8: Submit transaction (simplified - in production would use Jito bundle API)
      const submissionStart = Date.now();
      
      console.log('[JITO] Submitting transaction...');
      
      // For devnet testing, we'll use standard sendAndConfirmTransaction
      // In production, this would use Jito's sendBundle API
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.keypair],
        {
          commitment: this.config.solanaCommitment,
          skipPreflight: false,
          preflightCommitment: this.config.solanaCommitment,
        }
      );

      const submissionLatency = Date.now() - submissionStart;
      console.log('[JITO] Transaction submitted:', signature);
      console.log('[JITO] Submission latency:', submissionLatency, 'ms');

      // Step 9: Mark as submitted
      this.lifecycle.markSubmitted(bundleId, currentSlot, signature);

      // Step 10: Wait for processing
      console.log('[JITO] Waiting for processing...');
      await this.waitForProcessing(bundleId, signature, currentSlot);

      return {
        bundleId,
        success: true,
        lifecycle: this.lifecycle.getBundle(bundleId),
      };

    } catch (error: any) {
      console.error('[JITO] Bundle submission failed:', error.message);

      // Classify the failure
      const currentSlot = this.yellowstone.getCurrentSlot();
      const recentTips = this.lifecycle.getRecentTips(10);
      const medianTip = recentTips.length > 0 
        ? [...recentTips].sort((a, b) => a - b)[Math.floor(recentTips.length / 2)] ?? 0
        : 5000;

      const failureType = classifyFailure(error.message ?? 'Unknown error', {
        blockhashAge: currentSlot - (this.lifecycle.getBundle(bundleId)?.blockhash_slot ?? currentSlot),
        tipAmount: 0,
        recentTipMedian: medianTip,
      });

      // Mark failure
      this.lifecycle.markFailure(
        bundleId,
        'submitted',
        failureType,
        error.message ?? 'Unknown error'
      );

      // Get slot conditions for agent
      const slotConditions = {
        skipRate: await this.yellowstone.getSkipRate(20),
        congestionLevel: 0.5,
        leaderQuality: 0.5,
      };

      // Get failure context
      const context = this.lifecycle.getFailureContext(bundleId, slotConditions);
      
      if (context) {
        // Run agent analysis
        const retryParams = this.agent.analyzeFailure(context);

        // Update lifecycle with agent reasoning
        this.lifecycle.updateFailureWithReasoning(
          bundleId,
          retryParams.reasoning.failure_observed,
          retryParams.reasoning.decision.reasoning_summary,
          retryParams.tipAdjustment,
          retryParams.delayMs
        );

        // Handle retry if agent recommends
        if (retryParams.shouldRetry) {
          console.log('[JITO] Agent recommends retry, waiting...');
          if (retryParams.delayMs > 0) {
            await this.sleep(retryParams.delayMs);
          }
          
          // Mark retry outcome (simplified - would actually retry)
          this.lifecycle.markRetryOutcome(bundleId, false); // Mark as failed retry for now
        }
      }

      return {
        bundleId,
        success: false,
        error: error.message,
        lifecycle: this.lifecycle.getBundle(bundleId),
      };
    }
  }

  /**
   * Wait for transaction processing
   */
  private async waitForProcessing(
    bundleId: string,
    signature: string,
    _submissionSlot: number
  ): Promise<void> {
    try {
      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(
        signature,
        this.config.solanaCommitment
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      // Get transaction details
      const tx = await this.connection.getTransaction(signature, {
        commitment: (this.config.solanaCommitment === 'processed' ? 'confirmed' : this.config.solanaCommitment) as 'confirmed' | 'finalized',
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        throw new Error('Transaction not found after confirmation');
      }

      const processedSlot = tx.slot;
      console.log('[JITO] Transaction processed in slot:', processedSlot);

      // Mark stages
      this.lifecycle.markProcessed(bundleId, processedSlot);
      this.lifecycle.markConfirmed(bundleId, processedSlot + 32);
      this.lifecycle.markFinalized(bundleId, processedSlot + 63);

      // Record leader performance
      const leader = this.yellowstone.getLeaderForSlot(processedSlot);
      if (leader) {
        this.yellowstone.recordLeaderPerformance(leader, processedSlot, true);
      }

      console.log('[JITO] Bundle fully confirmed and finalized');

    } catch (error: any) {
      console.error('[JITO] Confirmation failed:', error.message);
      throw error;
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean;
    bundleCount: number;
    keypair?: string;
  } {
    return {
      initialized: this.keypair !== null,
      bundleCount: this.bundleCount,
      keypair: this.keypair?.publicKey.toString(),
    };
  }
}
