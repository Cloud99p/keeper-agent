/**
 * Transaction Builder
 * Windows-compatible Solana transaction construction
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram
} from '@solana/web3.js';

export interface TxConfig {
  priorityFee: number;
  computeUnitLimit: number;
  recentBlockhashValidity: number;
}

export class TxBuilder {
  private connection: Connection;
  private config: TxConfig;

  constructor(connection: Connection) {
    this.connection = connection;
    this.config = {
      priorityFee: parseInt(process.env.PRIORITY_FEE || '10000'),
      computeUnitLimit: parseInt(process.env.COMPUTE_UNIT_LIMIT || '200000'),
      recentBlockhashValidity: 60 // seconds
    };
  }

  /**
   * Create a basic SOL transfer transaction
   */
  async createTransferTx(
    fromPubkey: PublicKey,
    toPubkey: PublicKey,
    amount: number,
    payer: Keypair
  ): Promise<Transaction> {
    const { blockhash } = await this.connection.getLatestBlockhash();

    const tx = new Transaction({
      feePayer: fromPubkey,
      recentBlockhash: blockhash
    });

    // Add priority fee
    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: this.config.priorityFee
      }),
      ComputeBudgetProgram.setComputeUnitLimit({
        units: this.config.computeUnitLimit
      })
    );

    // Add transfer
    tx.add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: amount * LAMPORTS_PER_SOL
      })
    );

    return tx;
  }

  /**
   * Create a transaction with custom instructions
   */
  async createCustomTx(
    instructions: TransactionInstruction[],
    feePayer: PublicKey
  ): Promise<Transaction> {
    const { blockhash } = await this.connection.getLatestBlockhash();

    const tx = new Transaction({
      feePayer,
      recentBlockhash: blockhash
    });

    // Add priority fee
    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: this.config.priorityFee
      }),
      ComputeBudgetProgram.setComputeUnitLimit({
        units: this.config.computeUnitLimit
      })
    );

    // Add custom instructions
    tx.add(...instructions);

    return tx;
  }

  /**
   * Sign transaction
   */
  signTransaction(tx: Transaction, signers: Keypair[]): Transaction {
    tx.partialSign(...signers);
    return tx;
  }

  /**
   * Send and confirm transaction
   */
  async sendTransaction(
    tx: Transaction,
    signers: Keypair[]
  ): Promise<string> {
    // Sign transaction
    tx.partialSign(...signers);

    // Send transaction
    const signature = await this.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });

    console.log('[TX] Sent:', signature);

    // Confirm transaction
    const confirmation = await this.connection.confirmTransaction(
      signature,
      'confirmed'
    );

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('[TX] Confirmed:', signature);
    return signature;
  }

  /**
   * Send transaction without confirmation (fire and forget)
   */
  async sendTransactionAsync(tx: Transaction, signers: Keypair[]): Promise<string> {
    tx.partialSign(...signers);

    const signature = await this.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
      maxRetries: 3
    });

    console.log('[TX] Sent (async):', signature);
    return signature;
  }

  /**
   * Serialize transaction to buffer
   */
  serializeTransaction(tx: Transaction): Buffer {
    return tx.serialize();
  }

  /**
   * Get priority fee recommendation
   */
  async getPriorityFeeRecommendation(): Promise<number> {
    try {
      // Get recent priority fees from the network
      const priorityFees = await this.connection.getRecentPrioritizationFees();
      
      if (priorityFees.length === 0) {
        return this.config.priorityFee;
      }

      // Use median priority fee
      const sorted = priorityFees.map(pf => pf.prioritizationFee).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];

      return median;
    } catch (error: any) {
      console.warn('[TX] Failed to get priority fee recommendation:', error.message);
      return this.config.priorityFee;
    }
  }

  /**
   * Update config
   */
  updateConfig(newConfig: Partial<TxConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[TX] Config updated:', this.config);
  }
}
