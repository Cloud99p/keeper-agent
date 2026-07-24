/**
 * Execution Adapter
 *
 * Routes transactions to the correct execution path:
 *  - Solana → JitoManager (existing gRPC + RPC path)
 *  - Ethereum → KeeperHub MCP (via keeperhub-client)
 *
 * Handles x402 payment challenges for paid KeeperHub workflows.
 * Provides unified interface for the A2MCP server regardless of chain.
 *
 * @author Cloud99p
 * @license MIT
 */

import { VersionedTransaction, PublicKey } from '@solana/web3.js';
import { JitoManager } from './jito-manager.js';
import {
  KeeperHubClient,
  KeeperHubConfig,
  WorkflowResult,
  PaymentChallenge,
} from './keeperhub-client.js';
import { EvmTxBuilder, EvmTxParams, SignedEvmTx, EvmWallet } from './evm-tx-builder.js';

export type ChainType = 'solana' | 'ethereum' | 'base' | 'base-sepolia' | 'sepolia' | 'polygon' | 'arbitrum' | 'optimism';

export interface ExecutionRequest {
  chain: ChainType;
  // Solana params
  transactions?: VersionedTransaction[];
  payer?: PublicKey;
  // Ethereum params
  evmTx?: EvmTxParams;
  evmRawTx?: string;             // already-signed raw hex
  // Shared
  tipAmount?: number;            // lamports for SOL, override for wei on ETH
  webhookUrl?: string;
  idempotencyKey?: string;
}

export interface ExecutionResult {
  success: boolean;
  bundleId?: string;
  txHash?: string;
  txLink?: string;                // block explorer URL
  sponsored?: boolean;            // gas sponsored by KeeperHub
  chain: ChainType;
  slot?: number;
  tip: number;
  retries: number;
  error?: string;
  proofHash?: string;
  keeperhubResult?: WorkflowResult;
  keeperhubExecutionId?: string;  // KeeperHub execution ID for status polling
  paymentChallenge?: PaymentChallenge; // if 402 returned
}

export interface ExecutionAdapterConfig {
  keeperhub: KeeperHubConfig;
  ethRpcUrl?: string;
  ethWallet?: EvmWallet;
}

/**
 * Routes execution to the appropriate path based on chain type.
 */
export class ExecutionAdapter {
  private jitoManager: JitoManager | null;
  private keeperhubClient: KeeperHubClient;
  private evmBuilder: EvmTxBuilder | null = null;
  private config: ExecutionAdapterConfig;

  constructor(
    jitoManager: JitoManager | null,
    keeperhubClient: KeeperHubClient,
    config: ExecutionAdapterConfig
  ) {
    this.jitoManager = jitoManager;
    this.keeperhubClient = keeperhubClient;
    this.config = config;

    if (config.ethRpcUrl) {
      this.evmBuilder = new EvmTxBuilder(config.ethRpcUrl, config.ethWallet);
    }
  }

  /**
   * Execute a transaction on the specified chain.
   * Returns the execution result with proof chain hash.
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    switch (request.chain) {
      case 'solana':
        return this.executeSolana(request);
      case 'ethereum':
      case 'base':
      case 'base-sepolia':
      case 'sepolia':
      case 'polygon':
      case 'arbitrum':
      case 'optimism':
        return this.executeEthereum(request);
      default:
        return {
          success: false,
          chain: request.chain,
          tip: 0,
          retries: 0,
          error: `Unsupported chain: ${request.chain}`,
        };
    }
  }

  /**
   * Solana: Submit via JitoManager (existing path)
   */
  private async executeSolana(request: ExecutionRequest): Promise<ExecutionResult> {
    if (!request.transactions || request.transactions.length === 0) {
      return {
        success: false,
        chain: 'solana',
        tip: 0,
        retries: 0,
        error: 'No Solana transactions provided',
      };
    }

    const tip = request.tipAmount || 1000;
    const payer = request.payer || (request.transactions[0] as any).message?.staticAccountKeys?.[0] || new PublicKey('11111111111111111111111111111111');

    if (!this.jitoManager) {
      return {
        success: false,
        chain: 'solana',
        tip,
        retries: 0,
        error: 'JitoManager not initialized',
      };
    }

    try {
      const result = await this.jitoManager.submitBundle(
        request.transactions,
        payer,
        tip
      );

      return {
        success: true,
        chain: 'solana',
        bundleId: result.bundleId,
        slot: result.healthScore || 0,
        tip,
        retries: 0,
        proofHash: `sol_${result.bundleId.substring(0, 16)}`,
      };
    } catch (e: any) {
      return {
        success: false,
        chain: 'solana',
        tip,
        retries: 0,
        error: e.message,
      };
    }
  }

  /**
   * Ethereum/Base/Other EVM: Submit via KeeperHub MCP
   *
   * Flow:
   * 1. Build & sign the ETH transaction (if not pre-signed)
   * 2. Submit to KeeperHub execution workflow
   * 3. If 402, process x402 payment challenge
   * 4. Return result
   */
  private async executeEthereum(request: ExecutionRequest): Promise<ExecutionResult> {
    const chainId = this.getChainId(request.chain);

    // Step 1: Try Direct Execution REST API (fast path — no MCP session)
    try {
      const result = await this.keeperhubClient.directExecuteTransfer({
        chainId: String(chainId),
        recipientAddress: request.evmTx?.to || '0x0000000000000000000000000000000000000001',
        amount: request.evmTx?.value || '0',
      });

      // Direct Execution may return txHash inline (no polling needed)
      if (result.txHash) {
        return {
          success: true,
          chain: request.chain,
          txHash: result.txHash,
          txLink: result.txLink,
          keeperhubExecutionId: result.executionId,
          tip: 0,
          retries: 0,
        };
      }

      // If no txHash yet, poll via MCP status endpoint
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 500));
        try {
          const status = await this.keeperhubClient.mcpGetTransactionStatus(result.executionId);
          if (status.transactionHash) {
            return {
              success: true,
              chain: request.chain,
              txHash: status.transactionHash,
              txLink: status.transactionLink,
              sponsored: status.sponsored,
              keeperhubExecutionId: result.executionId,
              tip: 0,
              retries: i,
            };
          }
          if (status.error) {
            return {
              success: false,
              chain: request.chain,
              error: status.error,
              keeperhubExecutionId: result.executionId,
              tip: 0,
              retries: i,
            };
          }
        } catch { /* poll again */ }
      }

      return {
        success: false,
        chain: request.chain,
        error: 'Timed out waiting for transfer status',
        tip: 0,
        retries: 10,
      };
    } catch (directErr: any) {
      // If not a payment/x402 error, log and try MCP fallback
      if (!directErr.message?.includes('x402') && !directErr.message?.includes('402')) {
        console.log(`[EXEC] Direct execution unavailable (${directErr.message}), falling back to MCP...`);
      } else {
        // x402 payment challenge — propagate up
        throw directErr;
      }
    }

    // Step 2: Try KeeperHub MCP execute_transfer (fallback — gas sponsored on testnets)
    try {
      const result = await this.keeperhubClient.mcpExecuteTransfer({
        chainId: String(chainId),
        toAddress: request.evmTx?.to || '0x0000000000000000000000000000000000000001',
        amount: request.evmTx?.value || '0',
      });

      // Poll for transaction hash
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 500));
        try {
          const status = await this.keeperhubClient.mcpGetTransactionStatus(result.executionId);
          if (status.transactionHash) {
            return {
              success: true,
              chain: request.chain,
              txHash: status.transactionHash,
              txLink: status.transactionLink,
              sponsored: status.sponsored,
              keeperhubExecutionId: result.executionId,
              tip: 0,
              retries: i,
            };
          }
          if (status.error) {
            return {
              success: false,
              chain: request.chain,
              error: status.error,
              keeperhubExecutionId: result.executionId,
              tip: 0,
              retries: i,
            };
          }
        } catch { /* poll again */ }
      }

      return {
        success: false,
        chain: request.chain,
        error: 'Timed out waiting for MCP transfer status',
        tip: 0,
        retries: 10,
      };
    } catch (mcpErr: any) {
      // Fallback: build and sign locally, submit via old KeeperHub workflow
      if (!mcpErr.message?.includes('MCP')) throw mcpErr; // non-MCP error, propagate
    }

    // Step 2: Fallback — build/sign locally and submit via KeeperHub workflow
    let signedTx: SignedEvmTx | null = null;
    if (request.evmRawTx) {
      if (this.evmBuilder) {
        signedTx = await this.evmBuilder.signRawTx(request.evmRawTx);
      } else {
        return {
          success: false,
          chain: request.chain,
          tip: 0,
          retries: 0,
          error: 'EVM builder not configured — ETH RPC URL required',
        };
      }
    } else if (request.evmTx && this.evmBuilder) {
      signedTx = await this.evmBuilder.signTx({ ...request.evmTx, chainId });
    } else {
      return {
        success: false,
        chain: request.chain,
        tip: 0,
        retries: 0,
        error: 'No EVM transaction data provided and no ETH wallet configured',
      };
    }

    try {
      const chainName = this.getChainName(request.chain);
      const workflowSlug = this.getExecutionWorkflowSlug(request.chain);

      const keeperResult = await this.keeperhubClient.callWorkflow({
        slug: workflowSlug,
        inputs: {
          chain: chainName,
          tx: signedTx.raw,
          from: signedTx.from,
          to: signedTx.to,
          webhookUrl: request.webhookUrl || null,
          idempotencyKey: request.idempotencyKey || null,
        },
      });

      if (keeperResult.status === 'completed' || keeperResult.status === 'pending') {
        return {
          success: true,
          chain: request.chain,
          txHash: keeperResult.txHash || signedTx.hash,
          tip: request.tipAmount || 0,
          retries: 0,
          keeperhubResult: keeperResult,
          proofHash: `evm_${(keeperResult.txHash || signedTx.hash).substring(0, 16)}`,
        };
      }

      return {
        success: false,
        chain: request.chain,
        tip: request.tipAmount || 0,
        retries: 0,
        error: keeperResult.error || 'KeeperHub execution failed',
        keeperhubResult: keeperResult,
      };
    } catch (e: any) {
      return {
        success: false,
        chain: request.chain,
        tip: request.tipAmount || 0,
        retries: 0,
        error: e.message,
      };
    }
  }

  /**
   * Update EVM wallet after initialization.
   */
  setEvmWallet(wallet: EvmWallet): void {
    if (this.evmBuilder) {
      this.evmBuilder.setWallet(wallet);
    }
  }

  // ===== Helpers =====

  private getChainId(chain: ChainType): number {
    const ids: Record<ChainType, number> = {
      ethereum: 1,
      base: 8453,
      'base-sepolia': 84532,
      sepolia: 11155111,
      polygon: 137,
      arbitrum: 42161,
      optimism: 10,
      solana: -1, // not applicable
    };
    return ids[chain] || 1;
  }

  private getChainName(chain: ChainType): string {
    const names: Record<ChainType, string> = {
      ethereum: 'ethereum',
      base: 'base',
      'base-sepolia': 'base-sepolia',
      sepolia: 'sepolia',
      polygon: 'polygon',
      arbitrum: 'arbitrum',
      optimism: 'optimism',
      solana: 'solana',
    };
    return names[chain] || 'ethereum';
  }

  private getExecutionWorkflowSlug(chain: ChainType): string {
    // KeeperHub workflow slugs for transaction execution
    // These would be workflows created/registered on KeeperHub
    const slugs: Record<ChainType, string> = {
      ethereum: 'tx-executor',
      base: 'tx-executor-base',
      'base-sepolia': 'tx-executor-base-sepolia',
      sepolia: 'tx-executor-sepolia',
      polygon: 'tx-executor-polygon',
      arbitrum: 'tx-executor-arbitrum',
      optimism: 'tx-executor-op',
      solana: 'tx-executor-solana',
    };
    return slugs[chain] || 'tx-executor';
  }

  /**
   * Check if KeeperHub is reachable.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const workflows = await this.keeperhubClient.listWorkflows();
      return Array.isArray(workflows);
    } catch {
      return false;
    }
  }
}
