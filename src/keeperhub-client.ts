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
    if (status === 200 && body && body.items && Array.isArray(body.items)) {
      return body.items.map((w: any) => ({
        slug: w.listedSlug || w.slug,
        name: w.name,
        price: w.priceUsdcPerCall || 0,
      }));
    }
    if (status === 200 && Array.isArray(body)) {
      return body.map((w: any) => ({
        slug: w.listedSlug || w.slug,
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
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error(`Request timed out: ${url}`));
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
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error(`Request timed out: ${url}`));
      });
      req.on('error', reject);
    });
  }

  // ──────────────────────────────────────────────
  // MCP Protocol Client
  // Uses JSON-RPC over HTTPS with session management
  // ──────────────────────────────────────────────

  /**
   * Make a JSON-RPC request to the KeeperHub MCP server.
   * Handles session initialization automatically.
   */
  private async mcpRequest(body: any, sessionId?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Mcp-Protocol-Version': '2025-03-26',
        'Content-Length': String(Buffer.byteLength(payload)),
      };
      if (sessionId) headers['Mcp-Session-Id'] = sessionId;
      const opts = {
        hostname: new URL(this.baseUrl).hostname,
        path: '/mcp',
        method: 'POST',
        headers,
      };
      const req = https.request(opts, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(d) });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, data: d });
          }
        });
      });
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('MCP request timed out')); });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Initialize an MCP session and return the session ID.
   */
  async mcpInitSession(): Promise<string> {
    const init = await this.mcpRequest({ jsonrpc: '2.0', method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'keeper-agent', version: '1.0.0' } }, id: 1 });
    if (init.status !== 200) throw new Error(`MCP init failed: ${init.status}`);
    const sessionId = (init.headers?.['mcp-session-id'] || init.headers?.['Mcp-Session-Id']) as string;
    if (!sessionId) throw new Error('No MCP session ID returned');
    // Send initialized notification WITH session ID
    await this.mcpRequest({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, sessionId);
    return sessionId;
  }

  /**
   * Execute a transfer via the Direct Execution REST API (fast path).
   * Single HTTPS POST — no MCP session management needed.
   * Docs: POST /api/execute/transfer
   */
  async directExecuteTransfer(params: {
    chainId: string;
    recipientAddress: string;
    amount: string;
    tokenAddress?: string;
  }): Promise<{ executionId: string; status: string; txHash?: string; txLink?: string }> {
    const url = `${this.baseUrl}/api/execute/transfer`;
    // Retry once on timeout — Cloudflare routing can be intermittent
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { status, body } = await this.httpPost(url, {
          chainId: params.chainId,
          recipientAddress: params.recipientAddress,
          amount: params.amount,
          ...(params.tokenAddress ? { tokenAddress: params.tokenAddress } : {}),
        });
        if (status === 200 || status === 202) {
          return body as any;
        }
        // 402 = x402 payment required — throw challenge info
        if (status === 402) {
          const challenge = this.parse402Challenge({}, body);
          if (challenge) {
            throw new Error(`x402 payment required: ${challenge.amount} USDC on ${challenge.chain}`);
          }
          throw new Error(`Direct execution returned 402: ${JSON.stringify(body).substring(0, 300)}`);
        }
        throw new Error(`Direct execution returned ${status}: ${JSON.stringify(body).substring(0, 500)}`);
      } catch (err: any) {
        if (attempt === 0 && err.message?.includes('timed out')) {
          console.warn(`[KEEPERHUB] Direct execution attempt ${attempt + 1} timed out, retrying...`);
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Direct execution failed after retries');
  }

  /**
   * Execute a transfer via KeeperHub's execute_transfer MCP tool.
   * Returns the execution ID for status polling.
   */
  async mcpExecuteTransfer(params: {
    chainId: string;
    toAddress: string;
    amount: string;
    tokenAddress?: string;
  }): Promise<{ executionId: string; status: string }> {
    const sessionId = await this.mcpInitSession();
    const result = await this.mcpRequest({
      jsonrpc: '2.0', method: 'tools/call',
      params: {
        name: 'execute_transfer',
        arguments: {
          chain_id: params.chainId,
          to_address: params.toAddress,
          amount: params.amount,
          ...(params.tokenAddress ? { token_address: params.tokenAddress } : {}),
        },
      },
      id: Date.now(),
    }, sessionId);
    const content = result?.data?.result?.content?.[0];
    if (!content) throw new Error('No execute_transfer result');
    // MCP tools return errors with isError: true
    if (result?.data?.result?.isError || content?.isError) {
      throw new Error(`MCP execute_transfer error: ${content.text}`);
    }
    if (!content.text) throw new Error('Empty execute_transfer result');
    return JSON.parse(content.text);
  }

  /**
   * Get the status of a previously submitted transfer.
   */
  async mcpGetTransactionStatus(executionId: string): Promise<{
    executionId: string;
    status: string;
    transactionHash?: string;
    transactionLink?: string;
    error: string | null;
    sponsored?: boolean;
    result?: any;
  }> {
    const sessionId = await this.mcpInitSession();
    const result = await this.mcpRequest({
      jsonrpc: '2.0', method: 'tools/call',
      params: {
        name: 'get_direct_execution_status',
        arguments: { execution_id: executionId },
      },
      id: Date.now(),
    }, sessionId);
    const content = result?.data?.result?.content?.[0];
    if (!content) throw new Error('No status result');
    // MCP tools return errors with isError: true
    if (result?.data?.result?.isError || content?.isError) {
      throw new Error(`MCP status error: ${content.text}`);
    }
    if (!content.text) throw new Error('Empty status result');
    return JSON.parse(content.text);
  }

  /**
   * Create a new workflow via the REST API.
   * Docs: POST /api/workflows/create
   */
  async createWorkflow(params: {
    slug: string;
    name: string;
    description?: string;
    projectId?: string;
    tagId?: string;
    inputs: Record<string, any>;
  }): Promise<{ id: string; slug: string; name: string }> {
    const url = `${this.baseUrl}/api/workflows/create`;
    const { status, body } = await this.httpPost(url, {
      slug: params.slug,
      name: params.name,
      description: params.description || '',
      projectId: params.projectId || null,
      tagId: params.tagId || null,
      inputs: params.inputs,
    });
    if (status === 200 || status === 201) {
      return body as any;
    }
    throw new Error(`Workflow creation returned ${status}: ${JSON.stringify(body).substring(0, 500)}`);
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
