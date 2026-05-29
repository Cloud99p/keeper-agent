/**
 * Fault Injection Service
 * 
 * Simulates real-world failure scenarios to test AI agent reasoning.
 * Used for demonstrating autonomous failure recovery.
 * 
 * Failure Scenarios:
 * - Blockhash expiry (wait >150 slots before submit)
 * - Fee too low (set tip to 0)
 * - Compute exceeded (simulate compute unit failure)
 * - Network congestion (simulate high skip rate)
 */

import { Connection, Transaction, SystemProgram, Keypair, PublicKey } from '@solana/web3.js';

export interface FaultScenario {
  type: 'blockhash_expiry' | 'fee_too_low' | 'compute_exceeded' | 'network_congestion';
  enabled: boolean;
  parameters: {
    delaySlots?: number;      // For blockhash expiry
    tipOverride?: number;     // For fee too low
    computeLimit?: number;    // For compute exceeded
    skipRate?: number;        // For network congestion
  };
}

export class FaultInjector {
  private connection: Connection;
  private scenario: FaultScenario | null;
  private injectionCount: number;
  private maxInjections: number;

  constructor(connection: Connection) {
    this.connection = connection;
    this.scenario = null;
    this.injectionCount = 0;
    this.maxInjections = 1; // Only inject once per test run
  }

  /**
   * Enable blockhash expiry fault
   * Waits >150 slots before submitting, causing blockhash to expire
   */
  enableBlockhashExpiry(delaySlots: number = 160): void {
    console.log('[FAULT] Enabling blockhash expiry fault (delay: %d slots)', delaySlots);
    this.scenario = {
      type: 'blockhash_expiry',
      enabled: true,
      parameters: { delaySlots },
    };
  }

  /**
   * Enable fee too low fault
   * Sets tip to 0 or very low amount
   */
  enableFeeTooLow(tipOverride: number = 0): void {
    console.log('[FAULT] Enabling fee too low fault (tip: %d lamports)', tipOverride);
    this.scenario = {
      type: 'fee_too_low',
      enabled: true,
      parameters: { tipOverride },
    };
  }

  /**
   * Check if fault should be injected
   */
  shouldInjectFault(): boolean {
    return this.scenario !== null && 
           this.scenario.enabled && 
           this.injectionCount < this.maxInjections;
  }

  /**
   * Apply fault to transaction
   */
  async applyFault(
    transaction: Transaction,
    keypair: Keypair,
    currentSlot: number
  ): Promise<{
    transaction: Transaction;
    delayMs: number;
    reason: string;
  }> {
    if (!this.scenario) {
      return { transaction, delayMs: 0, reason: 'No fault enabled' };
    }

    this.injectionCount++;

    switch (this.scenario.type) {
      case 'blockhash_expiry': {
        const delaySlots = this.scenario.parameters.delaySlots || 160;
        const delayMs = delaySlots * 400; // ~400ms per slot
        
        console.log('[FAULT] Blockhash expiry injection:');
        console.log('  - Fetching blockhash at slot:', currentSlot);
        console.log('  - Will wait %d slots (%dms) before submit', delaySlots, delayMs);
        console.log('  - Blockhash will be EXPIRED at submission');
        
        return {
          transaction,
          delayMs,
          reason: `blockhash_expiry_injection:${delaySlots}_slots`,
        };
      }

      case 'fee_too_low': {
        const tipOverride = this.scenario.parameters.tipOverride || 0;
        
        // Remove existing tip and replace with low tip
        const lowTipTx = new Transaction();
        
        // Copy original instructions (excluding tip)
        for (const instruction of transaction.instructions) {
          // Skip tip instructions (transfer to known tip accounts)
          const tipAccounts = [
            'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
            '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
          ];
          
          const isTipInstruction = instruction.keys.some(
            key => tipAccounts.includes(key.pubkey.toString())
          );
          
          if (!isTipInstruction) {
            lowTipTx.add(instruction);
          }
        }
        
        // Add minimal tip (or zero)
        if (tipOverride > 0) {
          lowTipTx.add(
            SystemProgram.transfer({
              fromPubkey: keypair.publicKey,
              toPubkey: new PublicKey('Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY'),
              lamports: tipOverride,
            })
          );
        }
        
        console.log('[FAULT] Fee too low injection:');
        console.log('  - Original tip: removed');
        console.log('  - New tip: %d lamports', tipOverride);
        
        return {
          transaction: lowTipTx,
          delayMs: 0,
          reason: `fee_too_low_injection:${tipOverride}_lamports`,
        };
      }

      default:
        return { transaction, delayMs: 0, reason: 'Unknown fault type' };
    }
  }

  /**
   * Get current fault scenario
   */
  getCurrentScenario(): FaultScenario | null {
    return this.scenario;
  }

  /**
   * Reset fault injector
   */
  reset(): void {
    this.scenario = null;
    this.injectionCount = 0;
    console.log('[FAULT] Fault injector reset');
  }

  /**
   * Get injection stats
   */
  getStats(): {
    totalInjections: number;
    scenarioType: string | null;
  } {
    return {
      totalInjections: this.injectionCount,
      scenarioType: this.scenario?.type || null,
    };
  }
}
