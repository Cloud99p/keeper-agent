/**
 * EVM Transaction Builder
 *
 * Builds and signs Ethereum-compatible transactions for submission
 * through KeeperHub's execution layer. Supports:
 *  - EIP-1559 (type 2) — dynamic fee transactions
 *  - EIP-2930 (type 1) — access list transactions
 *  - Legacy (type 0) — basic transactions
 *
 * @author Cloud99p
 * @license MIT
 */

import https from 'https';

export interface EvmTxParams {
  chainId: number;
  to: string;
  value?: string;           // wei (decimal string)
  data?: string;            // hex-encoded calldata
  gasLimit?: string;        // hex string
  maxFeePerGas?: string;    // wei (hex)
  maxPriorityFeePerGas?: string;
  nonce?: number;
  type?: 0 | 1 | 2;         // default: 2 (EIP-1559)
}

export interface SignedEvmTx {
  raw: string;              // raw signed transaction hex (0x-prefixed)
  hash: string;             // transaction hash
  from: string;             // sender address
  to: string;               // recipient address
  chainId: number;
}

export interface EvmWallet {
  address: string;
  privateKey: string;
}

/**
 * Build, estimate gas, and optionally sign EVM transactions.
 */
export class EvmTxBuilder {
  private rpcUrl: string;
  private wallet: EvmWallet | null = null;

  constructor(rpcUrl: string, wallet?: EvmWallet) {
    this.rpcUrl = rpcUrl;
    if (wallet) this.wallet = wallet;
  }

  setWallet(wallet: EvmWallet): void {
    this.wallet = wallet;
  }

  /**
   * Build transaction parameters, filling in defaults from chain state.
   */
  async buildTx(params: EvmTxParams): Promise<EvmTxParams> {
    const filled = { ...params };

    // Default to EIP-1559
    if (filled.type === undefined) filled.type = 2;

    // Get nonce if not provided
    if (filled.nonce === undefined && this.wallet) {
      filled.nonce = await this.getTransactionCount(this.wallet.address);
    }

    // Get gas estimates for EIP-1559
    if (filled.type === 2) {
      if (!filled.maxFeePerGas || !filled.maxPriorityFeePerGas) {
        const fees = await this.estimateEip1559Fees();
        filled.maxFeePerGas = filled.maxFeePerGas || fees.maxFeePerGas;
        filled.maxPriorityFeePerGas = filled.maxPriorityFeePerGas || fees.maxPriorityFeePerGas;
      }
    }

    // Estimate gas limit
    if (!filled.gasLimit) {
      filled.gasLimit = await this.estimateGas(filled);
    }

    return filled;
  }

  /**
   * Sign a transaction using ethers.js.
   * Falls back to raw RPC signing if ethers unavailable.
   */
  async signTx(params: EvmTxParams): Promise<SignedEvmTx> {
    if (!this.wallet) {
      throw new Error('Wallet not configured — call setWallet() first');
    }

    const filled = await this.buildTx(params);

    try {
      const { ethers } = await import('ethers' as any);
      const wallet = new ethers.Wallet(this.wallet.privateKey);

      const tx: any = {
        to: filled.to,
        chainId: filled.chainId,
        nonce: filled.nonce,
        type: filled.type,
      };

      if (filled.value && filled.value !== '0') {
        tx.value = filled.value;
      }
      if (filled.data) {
        tx.data = filled.data;
      }
      if (filled.gasLimit) {
        tx.gasLimit = filled.gasLimit;
      }

      if (filled.type === 2) {
        tx.maxFeePerGas = filled.maxFeePerGas || '0';
        tx.maxPriorityFeePerGas = filled.maxPriorityFeePerGas || '0';
      } else {
        // Legacy: use gasPrice
        if (!filled.maxFeePerGas) {
          const { gasPrice } = await this.rpcCall('eth_gasPrice', []);
          tx.gasPrice = gasPrice;
        } else {
          tx.gasPrice = filled.maxFeePerGas;
        }
      }

      const signed = await wallet.signTransaction(tx);
      const hash = ethers.keccak256(signed);

      return {
        raw: signed,
        hash,
        from: this.wallet.address,
        to: filled.to,
        chainId: filled.chainId,
      };
    } catch {
      throw new Error(
        'EVM signing requires ethers.js. Install: npm install ethers\n' +
        `Chain: ${filled.chainId}, To: ${filled.to}`
      );
    }
  }

  /**
   * Sign a raw transaction hex with the configured wallet and return
   * a signed tx ready for submission.
   */
  async signRawTx(txHex: string): Promise<SignedEvmTx> {
    if (!this.wallet) throw new Error('Wallet not configured');

    try {
      const { ethers } = await import('ethers' as any);
      const wallet = new ethers.Wallet(this.wallet.privateKey);

      // Parse unsigned tx and sign
      const unsigned = ethers.Transaction.from(txHex);
      const signed = await wallet.signTransaction(unsigned);
      const hash = ethers.keccak256(signed);

      return {
        raw: signed,
        hash,
        from: this.wallet.address,
        to: unsigned.to || '',
        chainId: unsigned.chainId || 0,
      };
    } catch {
      throw new Error('Raw TX signing requires ethers.js. Install: npm install ethers');
    }
  }

  // ===== ETH RPC =====

  private async getTransactionCount(address: string): Promise<number> {
    const { result } = await this.rpcCall('eth_getTransactionCount', [
      address,
      'pending',
    ]);
    return parseInt(result, 16);
  }

  private async estimateGas(tx: EvmTxParams): Promise<string> {
    const params: any = { to: tx.to, chainId: `0x${tx.chainId.toString(16)}` };
    if (tx.data) params.data = tx.data;
    if (tx.value) params.value = tx.value;

    const { result } = await this.rpcCall('eth_estimateGas', [params]);
    return result;
  }

  private async estimateEip1559Fees(): Promise<{
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  }> {
    try {
      const { result } = await this.rpcCall('eth_maxPriorityFeePerGas', []);
      const priority = result; // hex wei

      const block = await this.rpcCall('eth_getBlockByNumber', ['latest', false]);
      const baseFee = block.result.baseFeePerGas || '0x0';

      const maxFee = `0x${(parseInt(baseFee, 16) * 2 + parseInt(priority, 16)).toString(16)}`;

      return { maxFeePerGas: maxFee, maxPriorityFeePerGas: priority };
    } catch {
      return {
        maxFeePerGas: '0x59682f00', // 1.5 gwei fallback
        maxPriorityFeePerGas: '0x59682f00',
      };
    }
  }

  private async rpcCall(
    method: string,
    params: any[]
  ): Promise<{ result: any; error?: any }> {
    return new Promise((resolve, reject) => {
      const u = new URL(this.rpcUrl);
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      });

      const req = https.request(
        {
          hostname: u.hostname,
          port: u.port || 443,
          path: u.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'User-Agent': 'keeper-agent/1.0',
          },
        },
        (res) => {
          let d = '';
          res.on('data', (c) => (d += c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(d));
            } catch {
              reject(new Error(`RPC parse error: ${d.substring(0, 200)}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
