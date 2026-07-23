/**
 * Real-time Slot Streaming Layer (KAIROS-style gRPC)
 * 
 * Emits: slot events (processed/confirmed/finalized) via Yellowstone gRPC
 * Falls back to HTTP polling if no credentials configured
 * 
 * Usage:
 *  const stream = new SlotStream(rpcUrl, grpcEndpoint, grpcToken)
 *  stream.on('slot', (event) => console.log(event))
 *  await stream.start()
 */

import { EventEmitter } from 'events';
import { Connection } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export interface SlotEvent {
  slot: number;
  status: 'processed' | 'confirmed' | 'finalized';
  timestamp: number;
  parent?: number;
}

export class SlotStream extends EventEmitter {
  private running = false;
  private mockInterval: NodeJS.Timeout | null = null;
  private currentSlot = 0;
  private connection: Connection;
  private isMock: boolean;
  private grpcClient: any = null;
  private grpcStream: any = null;
  private grpcEndpoint?: string;
  private grpcToken?: string;

  constructor(rpcUrl: string, grpcEndpoint?: string, grpcToken?: string) {
    super();
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.grpcEndpoint = grpcEndpoint;
    this.grpcToken = grpcToken;
    this.isMock = !grpcEndpoint || grpcEndpoint.trim() === '';
    
    console.log(`[STREAM] Mode: ${this.isMock ? 'MOCK (HTTP polling)' : 'REAL (Yellowstone gRPC)'}`);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      this.currentSlot = await this.connection.getSlot('processed');
      console.log(`[STREAM] Starting from slot ${this.currentSlot}`);
    } catch (error: any) {
      console.warn(`[STREAM] Failed to get current slot: ${error.message}`);
      this.currentSlot = 470000000;
    }

    if (this.isMock) {
      this.startMockStream();
    } else {
      await this.startRealStream();
    }
  }

  stop(): void {
    this.running = false;
    
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
    
    if (this.grpcStream) {
      this.grpcStream.end();
      this.grpcStream = null;
    }
    
    if (this.grpcClient) {
      this.grpcClient.close();
      this.grpcClient = null;
    }
    
    console.log('[STREAM] Stopped');
  }

  /**
   * MOCK STREAM - HTTP polling every 400ms
   */
  private startMockStream(): void {
    console.log('[STREAM] Mock stream started — polling every 400ms');

    this.mockInterval = setInterval(async () => {
      if (!this.running) return;

      try {
        const slot = await this.connection.getSlot('processed');
        
        if (slot > this.currentSlot) {
          for (let s = this.currentSlot + 1; s <= slot; s++) {
            this.emitSlot(s, 'processed');
            
            setTimeout(() => {
              if (this.running) this.emitSlot(s, 'confirmed');
            }, 800);
            
            setTimeout(() => {
              if (this.running) this.emitSlot(s, 'finalized');
            }, 12800);
          }
          
          this.currentSlot = slot;
        }
      } catch (error: any) {
        console.error('[STREAM] Polling error:', error.message);
      }
    }, 400);
  }

  /**
   * REAL STREAM - Yellowstone gRPC via @grpc/grpc-js (KAIROS approach)
   */
  private async startRealStream(): Promise<void> {
    if (!this.grpcEndpoint || !this.grpcToken) {
      console.error('[STREAM] Cannot start real stream - missing credentials');
      this.startMockStream();
      return;
    }

    console.log(`[STREAM] Connecting via @grpc/grpc-js to ${this.grpcEndpoint}`);

    try {
      // Dynamically import gRPC modules
      const grpc = await import('@grpc/grpc-js');
      const protoLoader = await import('@grpc/proto-loader');

      // Download Yellowstone proto if not exists
      const protoPath = path.join(process.cwd(), 'yellowstone.proto');
      
      if (!fs.existsSync(protoPath)) {
        console.log('[STREAM] Downloading Yellowstone proto definition...');
        const response = await fetch(
          'https://raw.githubusercontent.com/rpcpool/yellowstone-grpc/master/yellowstone-grpc-proto/proto/geyser.proto'
        );
        const protoContent = await response.text();
        fs.writeFileSync(protoPath, protoContent);
        console.log('[STREAM] Proto file saved');
      }

      // Load proto definition
      const packageDef = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const proto = grpc.loadPackageDefinition(packageDef) as any;

      // Create SSL credentials with token metadata
      const sslCreds = grpc.credentials.createSsl();
      const metaCallback = (
        _params: any,
        callback: (err: null, metadata: any) => void
      ) => {
        const meta = new grpc.Metadata();
        meta.add('x-token', this.grpcToken!);
        callback(null, meta);
      };
      const callCreds = grpc.credentials.createFromMetadataGenerator(metaCallback);
      const combinedCreds = grpc.credentials.combineChannelCredentials(
        sslCreds,
        callCreds
      );

      // Connect to Geyser service
      const GeyserService = proto.geyser?.Geyser;
      if (!GeyserService) {
        throw new Error('Geyser service not found in proto');
      }

      this.grpcClient = new GeyserService(this.grpcEndpoint, combinedCreds);

      // Open Subscribe stream
      this.grpcStream = this.grpcClient.Subscribe();

      // Send subscription request for slots
      this.grpcStream.write({
        slots: {
          'keeper-agent': {}  // Named filter key
        },
        accounts: {},
        transactions: {},
        blocks: {},
        blocks_meta: {},
        entry: {},
        commitment: 1,  // processed
        accounts_data_slice: [],
        ping: undefined,
      });

      console.log('[STREAM] Subscription sent — waiting for slot events...');
      this.emit('connected');

      // Handle incoming data
      this.grpcStream.on('data', (data: any) => {
        if (!this.running) return;

        if (data.slot) {
          const slotNum = parseInt(data.slot.slot);
          if (isNaN(slotNum)) return;

          const statusStr = (data.slot.status || '').toLowerCase();
          let status: 'processed' | 'confirmed' | 'finalized' = 'processed';
          
          if (statusStr.includes('finalized')) status = 'finalized';
          else if (statusStr.includes('confirmed')) status = 'confirmed';
          else if (statusStr.includes('processed')) status = 'processed';

          this.emitSlot(slotNum, status, data.slot.parent ? parseInt(data.slot.parent) : undefined);
        }
      });

      // Handle errors
      this.grpcStream.on('error', (error: any) => {
        console.error('[STREAM] gRPC error:', error.message);
        this.emit('error', error);
        
        // Auto-reconnect after 5 seconds
        setTimeout(() => {
          if (this.running) {
            console.log('[STREAM] Attempting reconnection...');
            this.startRealStream();
          }
        }, 5000);
      });

      // Handle end of stream
      this.grpcStream.on('end', () => {
        console.log('[STREAM] Stream ended');
        this.emit('disconnected');
      });

    } catch (error: any) {
      console.error('[STREAM] Failed to start gRPC stream:', error.message);
      console.log('[STREAM] Falling back to mock mode');
      this.startMockStream();
    }
  }

  private emitSlot(slot: number, status: 'processed' | 'confirmed' | 'finalized', parent?: number): void {
    const event: SlotEvent = {
      slot,
      status,
      timestamp: Date.now(),
      parent,
    };
    
    this.emit('slot', event);
    
    if (status === 'processed' && slot > this.currentSlot) {
      this.currentSlot = slot;
    }
  }

  getCurrentSlot(): number {
    return this.currentSlot;
  }

  isRealtime(): boolean {
    return !this.isMock && this.grpcStream !== null;
  }
}
