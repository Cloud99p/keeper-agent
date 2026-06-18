/**
 * Pre-flight Transaction Simulator
 * 
 * Simulates transactions before submission to catch failures early
 * and optimize compute unit budgets. Saves lamports by avoiding
 * doomed submissions.
 * 
 * Inspired by KAIROS implementation for SuperteamNG bounty
 */

import {
  Connection,
  VersionedTransaction,
  PublicKey,
  SimulatedTransactionResponse,
  ComputeBudgetProgram,
  TransactionInstruction,
} from '@solana/web3.js';

export interface SimulationResult {
  success: boolean;
  computeUnits?: number;
  error?: string;
  errorCode?: string;
  logs?: string[];
  computeBudget?: number; // Recommended compute unit limit
  simulationTimeMs: number;
}

export interface ComputeBudgetRecommendation {
  units: number;
  pricePerUnit: number;
  totalFeeLamports: number;
}

/**
 * Simulate transaction before submission
 * 
 * @param connection Solana connection
 * @param tx Versioned transaction to simulate
 * @param payerPublicKey Payer's public key
 * @returns Simulation result with success status and compute units
 */
export async function simulateBeforeSubmit(
  connection: Connection,
  tx: VersionedTransaction,
  payerPublicKey: PublicKey
): Promise<SimulationResult> {
  const startTime = Date.now();
  
  try {
    const simulation = await connection.simulateTransaction(tx, {
      commitment: 'processed',
      replaceRecentBlockhash: true,
      sigVerify: false, // Skip signature verification for faster simulation
    });
    
    const simulationTimeMs = Date.now() - startTime;
    
    if (simulation.value.err) {
      const errorCode = extractErrorCode(simulation.value.err);
      
      return {
        success: false,
        error: JSON.stringify(simulation.value.err),
        errorCode,
        logs: simulation.value.logs || [],
        simulationTimeMs,
      };
    }
    
    // Extract compute units from logs
    let computeUnits: number | undefined;
    if (simulation.value.logs) {
      const computeMatch = simulation.value.logs.find(log => 
        log.includes('Compute units:')
      );
      if (computeMatch) {
        const match = computeMatch.match(/Compute units: (\d+)/);
        if (match) {
          computeUnits = parseInt(match[1]);
        }
      }
    }
    
    // Calculate recommended compute budget (20% buffer)
    const computeBudget = computeUnits ? Math.ceil(computeUnits * 1.2) : undefined;
    
    return {
      success: true,
      computeUnits,
      computeBudget,
      logs: simulation.value.logs || [],
      simulationTimeMs,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      errorCode: 'simulation_error',
      simulationTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Extract error code from simulation error
 */
function extractErrorCode(err: any): string {
  if (typeof err === 'string') {
    return err;
  }
  
  if (err.InstructionError) {
    const [index, error] = err.InstructionError;
    if (typeof error === 'string') {
      return error;
    }
    if (error.Custom) {
      return `CUSTOM_${error.Custom}`;
    }
  }
  
  if (err.TransactionError) {
    return Object.keys(err.TransactionError)[0] || 'UNKNOWN';
  }
  
  return 'UNKNOWN_ERROR';
}

/**
 * Add compute budget instructions to transaction
 * 
 * @param instructions Original transaction instructions
 * @param computeUnits Recommended compute unit limit
 * @param pricePerUnit Compute unit price in microlamports
 * @returns New instructions array with compute budget
 */
export function addComputeBudget(
  instructions: TransactionInstruction[],
  computeUnits: number,
  pricePerUnit: number = 1000 // 1000 microlamports = 0.001 lamports
): TransactionInstruction[] {
  const computeBudgetInstructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: pricePerUnit }),
  ];
  
  return [...computeBudgetInstructions, ...instructions];
}

/**
 * Calculate optimal compute unit price based on network conditions
 * 
 * @param basePrice Base price in microlamports
 * @param healthScore Network health score (0-100)
 * @returns Recommended price per compute unit
 */
export function calculateComputeUnitPrice(
  basePrice: number,
  healthScore: number
): number {
  // Increase price when network is congested
  if (healthScore < 40) {
    return Math.ceil(basePrice * 2.0); // +100% during congestion
  }
  if (healthScore < 70) {
    return Math.ceil(basePrice * 1.5); // +50% during degradation
  }
  return basePrice;
}

/**
 * Classify simulation failure type
 */
export function classifySimulationFailure(errorCode: string): string {
  const failureMap: Record<string, string> = {
    // Blockhash issues
    'BlockhashNotFound': 'expired_blockhash',
    'BlockhashExpired': 'expired_blockhash',
    
    // Fee issues
    'InsufficientFundsForFee': 'fee_too_low',
    'InsufficientFunds': 'insufficient_funds',
    
    // Compute issues
    'ComputationalBudgetExceeded': 'compute_exceeded',
    'MAX_COMPUTE_UNIT_LIMIT_REACHED': 'compute_exceeded',
    
    // Program errors
    'Custom': 'program_error',
    'InvalidAccount': 'invalid_account',
    'InvalidInstructionData': 'invalid_instruction',
    
    // Bundle-specific
    'BundleFailed': 'bundle_failure',
  };
  
  return failureMap[errorCode] || 'unknown';
}

/**
 * Format simulation result for logging
 */
export function formatSimulationResult(result: SimulationResult): string {
  if (result.success) {
    return `✅ Pre-flight passed | CU: ${result.computeUnits || 'N/A'} | Budget: ${result.computeBudget || 'N/A'} | Time: ${result.simulationTimeMs}ms`;
  }
  
  const failureType = result.errorCode ? classifySimulationFailure(result.errorCode) : 'unknown';
  return `❌ Pre-flight failed | Type: ${failureType} | Error: ${result.errorCode || result.error} | Time: ${result.simulationTimeMs}ms`;
}
