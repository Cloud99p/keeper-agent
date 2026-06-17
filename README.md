# Solana Transaction Stack

High-performance Solana transaction stack with Jito bundle support. Built for Windows, Linux, and macOS.

## Features

- 🚀 **Jito Bundle Submission** - Submit transaction bundles via Jito Labs
- 📊 **Real-Time Streaming** - Geyser-based account/program monitoring
- 💰 **Priority Fee Management** - Dynamic priority fee calculation
- 🪟 **Windows Native** - Fully compatible with Windows (no WSL required)
- 🔧 **TypeScript** - Type-safe development experience

## Prerequisites

- **Node.js** >= 20.0.0 (LTS recommended)
- **npm** >= 8.0.0 or **yarn** >= 1.22
- **Git**

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/solana-tx-stack.git
cd solana-tx-stack
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
```

### 3. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your configuration
# Required: RPC_URL, BLOCK_ENGINE_URL, AUTH_KEYPAIR_PATH
```

### 4. Create KeyPair (if you don't have one)

```bash
# Generate a new keypair for Jito authentication
# Save the output JSON file and reference it in AUTH_KEYPAIR_PATH
```

### 5. Run

```bash
# Development mode (with hot reload)
npm run dev

# Production build
npm run build
npm start
```

## Project Structure

```
solana-tx-stack/
├── src/
│   ├── index.ts           # Main entry point
│   ├── jito-manager.ts    # Jito bundle management
│   ├── geyser-client.ts   # Real-time data streaming
│   └── tx-builder.ts      # Transaction construction
├── .env.example           # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

## Configuration

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `RPC_URL` | ✅ | Solana RPC endpoint | `https://api.mainnet-beta.solana.com` |
| `BLOCK_ENGINE_URL` | ✅ | Jito Block Engine URL | `mainnet.block-engine.jito.wtf` |
| `GEYSER_URL` | ❌ | Jito Geyser endpoint | `mainnet.geyser.jito.wtf:443` |
| `GEYSER_ACCESS_TOKEN` | ❌ | Geyser access token | `your-token` |
| `AUTH_KEYPAIR_PATH` | ✅ | Path to keypair JSON | `./keypair.json` |
| `BUNDLE_TRANSACTION_LIMIT` | ❌ | Max transactions per bundle | `5` |
| `PRIORITY_FEE` | ❌ | Priority fee in microlamports | `10000` |
| `COMPUTE_UNIT_LIMIT` | ❌ | Compute unit limit | `200000` |

### Network Endpoints

**Mainnet:**
- Block Engine: `mainnet.block-engine.jito.wtf`
- Geyser: `mainnet.geyser.jito.wtf:443`
- RPC: `https://api.mainnet-beta.solana.com`

**Testnet:**
- Block Engine: `testnet.block-engine.jito.wtf`
- RPC: `https://api.testnet.solana.com`

## Usage Examples

### Basic Bundle Submission

```typescript
import { SolanaTxStack } from './src/index.js';

const stack = new SolanaTxStack();
await stack.start();

// Submit a bundle
const bundleId = await stack.submitBundle(transactions);
```

### Custom Transaction

```typescript
import { TxBuilder } from './src/tx-builder.js';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const builder = new TxBuilder(connection);

const tx = await builder.createTransferTx(
  fromPubkey,
  toPubkey,
  1.0, // SOL amount
  payerKeypair
);

const signature = await builder.sendTransaction(tx, [payerKeypair]);
```

### Monitor Accounts

```typescript
import { GeyserClient } from './src/geyser-client.js';

const geyser = new GeyserClient();
await geyser.connect();

// Get recent events
const events = geyser.getRecentEvents(10);
```

## Windows-Specific Notes

This project is **fully compatible with Windows** out of the box:

- ✅ Native Windows support (no WSL required)
- ✅ Git Bash, PowerShell, or CMD all work
- ✅ Node.js 20 LTS recommended
- ✅ All native modules pre-built for Windows

### Troubleshooting on Windows

**Issue: Native module errors**
```bash
# Clean reinstall
rmdir /s /q node_modules
del package-lock.json
npm install --include=optional
```

**Issue: TypeScript build errors**
```bash
# Clear build cache
npm run clean
npm run build
```

**Issue: Permission errors**
```bash
# Run terminal as Administrator
# Or use Git Bash instead of PowerShell
```

## Development

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

### Test

```bash
npm test
```

### Clean

```bash
npm run clean
```

## Advanced: WSL2 Setup (Optional)

For advanced features like full Yellowstone gRPC support, consider WSL2:

```powershell
# Install WSL2 (PowerShell as Admin)
wsl --install -d Ubuntu

# In WSL2 Ubuntu:
sudo apt update
sudo apt install -y build-essential pkg-config libssl-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
```

## Security

- 🔒 Never commit `.env` files
- 🔒 Keep keypair files secure (chmod 600)
- 🔒 Use environment variables for secrets
- 🔒 Rotate authentication keys regularly

## License

MIT

## Contributing

1. Fork the repo
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Support

- Issues: GitHub Issues
- Discussions: GitHub Discussions
- Documentation: See `/src` for inline comments

---

**Built with ❤️ for the Solana ecosystem**
