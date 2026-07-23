/**
 * KeeperHub MCP Client
 *
 * Talks to KeeperHub's MCP server (https://app.keeperhub.com/mcp) to execute
 * onchain workflows. Handles:
 *  - x402 payment challenges (HTTP 402 → sign → retry)
 *  - Workflow discovery and execution
 *  - Dual-protocol routing (x402 on Base → USDC, MPP on Tempo → USDC.e)
 *
 * @author Cloud99p
 * @license MIT
 */

import https from 'https';
import http from 'http';

export interface KeeperHubConfig {
  apiKey: string;                   // kh_xxx API key
  baseUrl?: string;                 // Default: https://app.keeperhub.com
  ethPrivateKey?: string;           // For signing x402 challenges (EIP-712)
  ethAddress?: string;              // ETH wallet address for x402
}

export interface WorkflowInput {
  slug: string;
  inputs: Record<string, any>;
}

export interface WorkflowResult {
  executionId: string;
  status: 'pending' | 'completed' | 'failed';
  txHash?: string;
  chain?: string;
  result?: any;
  error?: string;
}

export interface KeeperTipFloor {
  landing: number;      // lamports equivalent for Solana
  gasPrice?: string;    // wei for Ethereum
  timestamp: number;
}

export interface PaymentChallenge {
  protocol: 'x402' | 'mpp';
  chain: 'base' | 'tempo';
  amount: string;       // USDC amount (decimal string)
  recipient: string;    // recipient ETH address
  network: string;      // e.g. 'eip155:8453'
  nonce?: string;
  deadline?: string;
  scheme?: string;      // 'exact' | 'upto' | 'batch-settlement'
  paymentRequired?: Record<string, any>;  // parsed from PAYMENT-REQUIRED header
}

/**
 * KeeperHub HTTP client — lightweight, no external deps.
 */
export class KeeperHubClient {
  private config: KeeperHubConfig;
  private baseUrl: string;

  constructor(config: KeeperHubConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://app.keeperhub.com';
  }

  /**
   * Call a KeeperHub workflow by slug. Automatically handles x402 payment
   * challenges by signing and retrying if ethPrivateKey is configured.
   */
  async callWorkflow(workflow: WorkflowInput): Promise<WorkflowResult> {
    const url = `${this.baseUrl}/api/mcp/workflows/${workflow.slug}/call`;

    const { status, body, headers } = await this.httpPost(url, workflow.inputs);

    if (status === 200) {
      return body as WorkflowResult;
    }

    // Handle x402 payment challenge
    if (status === 402) {
      const challenge = this.parse402Challenge(headers, body);
      if (!challenge) {
        throw new Error(`KeeperHub 402 but no payment challenge found`);
      }

      if (challenge.protocol === 'x402' && this.config.ethPrivateKey) {
        return this.handleX402Payment(url, workflow.inputs, challenge);
      }

      // Return challenge details so caller can handle externally
      return {
        executionId: '',
        status: 'pending',
        error: `402 payment required: ${challenge.amount} USDC on ${challenge.chain} via ${challenge.protocol}`,
      };
    }

    throw new Error(`KeeperHub returned ${status}: ${JSON.stringify(body).substring(0, 500)}`);
  }

  /**
   * Parse x402 payment challenge from response headers/body.
   */
  private parse402Challenge(
    headers: Record<string, string>,
    body: any
  ): PaymentChallenge | null {
    // V2 x402 uses PAYMENT-REQUIRED header (base64 JSON)
    if (headers['payment-required']) {
      try {
        const decoded = Buffer.from(headers['payment-required'], 'base64').toString('utf-8');
        const pr = JSON.parse(decoded);
        return {
          protocol: 'x402',
          chain: 'base',
          amount: pr.amount || pr.price || '0',
          recipient: pr.to || pr.recipient || '',
          network: pr.network || 'eip155:8453',
          scheme: pr.scheme || 'exact',
          nonce: pr.nonce,
          deadline: pr.deadline,
          paymentRequired: pr,
        };
      } catch { /* fall through */ }
    }

    // Check body for x-payment-info
    if (body && body['x-payment-info']) {
      const pi = body['x-payment-info'];
      return {
        protocol: 'x402',
        chain: 'base',
        amount: pi.amount || '0',
        recipient: pi.recipient || '',
        network: pi.network || 'eip155:8453',
        paymentRequired: pi,
      };
    }

    return null;
  }

  /**
   * Handle x402 payment: sign EIP-712 challenge and retry original request.
   *
   * x402 V2: The PAYMENT-SIGNATURE header contains a base64-encoded
   * PaymentPayload { scheme, from, to, amount, nonce, deadline, signature }.
   */
  private async handleX402Payment(
    url: string,
    inputs: Record<string, any>,
    challenge: PaymentChallenge
  ): Promise<WorkflowResult> {
    if (!this.config.ethPrivateKey || !this.config.ethAddress) {
      throw new Error('ETH private key and address required for x402 payment signing');
    }

    console.log(`[KEEPERHUB] x402 payment: ${challenge.amount} USDC to ${challenge.recipient}`);

    // Build the EIP-712 typed data for TransferWithAuthorization (ERC-3009)
    const domain = {
      name: 'USDC',
      version: '2',
      chainId: 8453, // Base mainnet
      verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    };

    const nonce = challenge.nonce || Math.floor(Math.random() * 1e18).toString();
    const deadline = challenge.deadline || Math.floor(Date.now() / 1000 + 300).toString();

    const message = {
      from: this.config.ethAddress,
      to: challenge.recipient,
      value: challenge.amount,
      validAfter: '0',
      validBefore: deadline,
      nonce,
    };

    const types = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    // NOTE: Real EIP-712 signing requires ethers.js or viem.
    // For now we build the payload structure — actual signing happens
    // at runtime with the configured ETH key.
    const signature = await this.signEIP712(domain, types, message);

    const payload = {
      scheme: challenge.scheme || 'exact',
      from: this.config.ethAddress,
      to: challenge.recipient,
      amount: challenge.amount,
      nonce,
      deadline,
      signature,
    };

    const paymentSignature = Buffer.from(JSON.stringify(payload)).toString('base64');

    // Retry with PAYMENT-SIGNATURE header
    const { status, body } = await this.httpPost(url, inputs, {
      'PAYMENT-SIGNATURE': paymentSignature,
      'Content-Type': 'application/json',
    });

    if (status === 200) {
      console.log(`[KEEPERHUB] x402 payment accepted ✅`);
      return body as WorkflowResult;
    }

    throw new Error(`KeeperHub x402 retry returned ${status}: ${JSON.stringify(body).substring(0, 300)}`);
  }

  /**
   * EIP-712 signing stub. Uses ethers.js if available, otherwise throws.
   * Replace with actual signing at runtime.
   */
  private async signEIP712(
    domain: Record<string, any>,
    types: Record<string, any>,
    message: Record<string, any>
  ): Promise<string> {
    // Try ethers.js first
    try {
      const { ethers } = await import('ethers' as any);
      const wallet = new ethers.Wallet(this.config.ethPrivateKey!);
      const typedData = { domain, types, message, primaryType: 'TransferWithAuthorization' };
      return await wallet.signTypedData(domain, types, message);
    } catch {
      // ethers not available — throw descriptive error
      throw new Error(
        'EIP-712 signing requires ethers.js. Install: npm install ethers\n' +
        `Chain: ${domain.chainId}, Contract: ${domain.verifyingContract}\n` +
        `From: ${message.from}, To: ${message.to}, Value: ${message.value}`
      );
    }
  }

  /**
   * Discover available workflows from KeeperHub.
   */
  async listWorkflows(): Promise<Array<{ slug: string; name: string; price: number }>> {
    const url = `${this.baseUrl}/api/mcp/workflows`;
    const { status, body } = await this.httpGet(url);
    if (status === 200 && Array.isArray(body)) {
      return body.map((w: any) => ({
        slug: w.slug,
        name: w.name,
        price: w.priceUsdcPerCall || 0,
      }));
    }
    return [];
  }

  /**
   * Get market tip floor from KeeperHub gas-oracle (for Ethereum).
   */
  async getTipFloor(): Promise<KeeperTipFloor> {
    try {
      const { status, body } = await this.httpGet(
        `${this.baseUrl}/api/mcp/workflows/gas-oracle/call`
      );
      if (status === 200 && body) {
        return {
          landing: Math.ceil(parseFloat((body as any).gasPrice || '0') * 1e9),
          gasPrice: (body as any).gasPrice,
          timestamp: Date.now(),
        };
      }
    } catch { /* fallback */ }

    return {
      landing: 10_000, // fallback lamports
      timestamp: Date.now(),
    };
  }

  // ===== HTTP Helpers =====

  private async httpPost(
    url: string,
    data: any,
    extraHeaders?: Record<string, string>
  ): Promise<{ status: number; body: any; headers: Record<string, string> }> {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const body = JSON.stringify(data);
      const opts = {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'User-Agent': 'keeper-agent/1.0',
          ...extraHeaders,
        },
      };
      const mod = url.startsWith('https') ? https : http;
      const req = mod.request(opts, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') h[k] = v;
            else if (Array.isArray(v)) h[k] = v[0] || '';
          }
          let parsed: any;
          try {
            parsed = JSON.parse(d);
          } catch {
            parsed = d;
          }
          resolve({ status: res.statusCode || 500, body: parsed, headers: h });
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  private async httpGet(
    url: string
  ): Promise<{ status: number; body: any; headers: Record<string, string> }> {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(
        url,
        { headers: { 'Authorization': `Bearer ${this.config.apiKey}`, 'User-Agent': 'keeper-agent/1.0' } },
        (res) => {
          let d = '';
          res.on('data', (c) => (d += c));
          res.on('end', () => {
            const h: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (typeof v === 'string') h[k] = v;
              else if (Array.isArray(v)) h[k] = v[0] || '';
            }
            let parsed: any;
            try {
              parsed = JSON.parse(d);
            } catch {
              parsed = d;
            }
            resolve({ status: res.statusCode || 500, body: parsed, headers: h });
          });
        }
      );
      req.on('error', reject);
    });
  }
}

// Singleton
let _instance: KeeperHubClient | null = null;

export function getKeeperHubClient(config?: KeeperHubConfig): KeeperHubClient {
  if (!_instance && config) {
    _instance = new KeeperHubClient(config);
  }
  if (!_instance) {
    throw new Error('KeeperHubClient not initialized — call getKeeperHubClient(config) first');
  }
  return _instance;
}
