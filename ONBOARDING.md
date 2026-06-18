# Onboarding Guide - Solana Transaction Stack

> Complete setup guide for new users. Follow these steps to get your transaction stack running in under 10 minutes.

---

## 🎯 What You're Building

A production-grade Solana transaction infrastructure that:
- Submits transactions via **Jito bundles** (MEV protection)
- Streams real-time data via **Yellowstone gRPC**
- Uses **AI-powered failure recovery** (autonomous retries)
- Calculates **dynamic tips** from live on-chain data
- Tracks every transaction through **4 confirmation stages**

**End Result**: You can submit transactions that are protected from front-running, optimized for success, and automatically retry on failures.

---

## ⏱️ Time Estimate

| Step | Time | Prerequisites |
|------|------|---------------|
| 1. Install Node.js | 5 min | None |
| 2. Clone & Install | 2 min | Git |
| 3. Configure | 3 min | None |
| 4. Generate Keypair | 1 min | None |
| 5. Test on Devnet | 2 min | Funded keypair |
| **Total** | **~13 min** | |

---

## Step 1: Install Prerequisites

### Node.js (Required)

**Windows:**
1. Download from [nodejs.org](https://nodejs.org/)
2. Choose **LTS version** (v20.x or higher)
3. Run installer, accept defaults
4. Verify: Open PowerShell, run `node --version`

**macOS:**
```bash
# Using Homebrew
brew install node@20

# Or download from nodejs.org
```

**Linux:**
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version  # Should be v20.x or higher
npm --version   # Should be 8.x or higher
```

### Git (Required)

**Windows:** Download from [git-scm.com](https://git-scm.com/)
**macOS:** `xcode-select --install`
**Linux:** `sudo apt install git`

**Verify:**
```bash
git --version
```

---

## Step 2: Clone & Install

### Clone Repository

```bash
git clone https://github.com/Cloud99p/solana-tx-stack.git
cd solana-tx-stack
```

### Install Dependencies

```bash
npm install
```

**Expected output:**
```
added 150 packages in 15s

30 packages are looking for funding
  run `npm fund` for details
```

**Troubleshooting:**

If you see errors about native modules:

```bash
# Windows (PowerShell)
rmdir /s /q node_modules
del package-lock.json
npm install --include=optional

# macOS/Linux
rm -rf node_modules package-lock.json
npm install --include=optional
```

---

## Step 3: Configure Environment

### Copy Template

```bash
cp .env.example .env
```

### Edit `.env`

Open `.env` in your text editor. Here's what each line means:

```env
# === Network Selection ===
# Choose: devnet (testing) or mainnet-beta (production)
SOLANA_NETWORK=devnet

# === RPC Endpoint ===
# Devnet (free, for testing)
RPC_URL=https://api.devnet.solana.com

# Mainnet (requires funding, real SOL)
# RPC_URL=https://rpc.solinfra.dev
# RPC_X_TOKEN=rpc_your_token_here

# === Yellowstone gRPC (Optional) ===
# Devnet uses HTTP fallback automatically
# Mainnet: Get token from https://solinfra.dev
# YELLOWSTONE_ENDPOINT=https://grpc.solinfra.dev:443
# YELLOWSTONE_X_TOKEN=grpc_your_token_here

# === Jito Bundle Service (Mainnet only) ===
# Devnet: Direct transaction submission
# Mainnet: Bundle submission via Jito
# JITO_BLOCK_ENGINE_URL=https://mainnet.block-engine.jito.wtf
# AUTH_KEYPAIR_PATH=./keypairs/mainnet.json

# === Advanced Settings ===
# Minimum tip in lamports (1 SOL = 1,000,000,000 lamports)
# Devnet: 1000 (0.000001 SOL)
# Mainnet: 10000 (0.00001 SOL)
MIN_TIP_LAMPORTS=1000
```

**For First-Time Testing (Devnet):**

Just use the defaults - they're already configured for devnet testing!

---

## Step 4: Generate Keypair

A keypair is your identity on Solana. It's a public/private key pair:
- **Public key**: Your address (share this to receive SOL)
- **Private key**: Your secret (NEVER share this!)

### Generate

```bash
node scripts/generate-keypair.js
```

**Expected output:**
```
✅ Keypair generated: keypairs/devnet-1718704800000.json
📤 Public Key: 8Y7eA8ajBDCMxuyYctLfRvgmnbTrGu6bZwTTfSTxUT1b

⚠️  IMPORTANT: Backup this file! Loss = loss of funds.
🔒 Permissions: chmod 600 keypairs/devnet-1718704800000.json
```

### Secure Your Keypair

```bash
# macOS/Linux
chmod 600 keypairs/*.json

# Windows (PowerShell)
icacls keypairs\*.json /grant:r "%USERNAME%:R"
```

### Backup (CRITICAL!)

**Copy your keypair file to a secure location:**
- External USB drive
- Password manager (as text)
- Encrypted cloud storage

**If you lose this file, you lose access to any funds sent to that address!**

---

## Step 5: Fund Keypair

### Devnet (Free Test SOL)

**Option A: Automatic (Test Script)**

The test script will tell you if you need funds:

```bash
node scripts/test-bundle.js
```

If balance is low, it will show:
```
⚠️  Low balance! Need at least 0.001 SOL
Devnet: Request airdrop with solana airdrop 15
```

**Option B: Manual Airdrop**

```bash
# Install Solana CLI (if not installed)
# Windows/macOS: https://docs.solana.com/cli/install-solana-cli-tools

# Airdrop 15 SOL (devnet only, free)
solana airdrop 15 --url devnet <YOUR_PUBLIC_KEY>

# Example:
solana airdrop 15 --url devnet 8Y7eA8ajBDCMxuyYctLfRvgmnbTrGu6bZwTTfSTxUT1b
```

**Option C: Web Faucet**

1. Go to [Solana Faucet](https://faucet.solana.com/)
2. Enter your public key
3. Request airdrop (up to 15 SOL per day)

### Mainnet (Real SOL)

**For production testing:**

1. Send SOL from an exchange (Coinbase, Binance, etc.)
2. Or transfer from another Solana wallet
3. **Recommended**: 0.02 SOL for testing (covers 15-20 bundles)

**Mainnet test address** (if using existing keypair):
```
EBSgchs8GfMb1SaD3h5UKGhmB8k1x8HomPZFd2xDTbwB
```

---

## Step 6: Run Your First Test

### Quick Test

```bash
node scripts/test-bundle.js
```

**Expected output:**
```
🧪 Solana Test Bundle

📤 Address: 8Y7eA8ajBDCMxuyYctLfRvgmnbTrGu6bZwTTfSTxUT1b
💰 Balance: 14.99 SOL

📦 Sending transaction...
✅ Success!
🔗 Signature: 5kwcHV3UVNafD66VGWcn9ffw9iJpuKNn29XVx3YP6oyTTsJCp2t89EYiosy2qZurHPuPKSVMhkJFTBr341XatNHj
🌐 Explorer: https://explorer.solana.com/tx/5kwcHV3UVNafD66VGWcn9ffw9iJpuKNn29XVx3YP6oyTTsJCp2t89EYiosy2qZurHPuPKSVMhkJFTBr341XatNHj?cluster=devnet
```

### Verify on Explorer

Click the explorer link or manually go to:
```
https://explorer.solana.com/tx/<YOUR_SIGNATURE>?cluster=devnet
```

You should see:
- ✅ Status: Success
- 💰 Amount: 0.001 SOL
- 📝 Program: System Program (transfer)

---

## Step 7: Run the Full Stack

### Development Mode

```bash
npm run dev
```

**Expected output:**
```
✅ SolanaTxStack initialized
  RPC: https://api.devnet.solana.com

🚀 Starting Solana Transaction Stack...

✅ Jito Manager initialized
✅ Geyser Client connected

✅ All services started!

Press Ctrl+C to stop

[10:30:45 AM] Monitoring...
[10:31:15 AM] Monitoring...
```

The stack is now running and monitoring the network!

### Production Build

```bash
npm run build
npm start
```

---

## 🎓 Next Steps

### Learn the Components

1. **Read the Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)
2. **Understand the AI Agent**: See `src/ai-agent.ts`
3. **Review Lifecycle Tracking**: See `src/lifecycle.ts`

### Run Advanced Tests

```bash
# Comprehensive test suite
npx tsx scripts/test-comprehensive.ts

# AI agent stress test with fault injection
npx tsx scripts/test-ai-stress.ts

# Fault injection demo
npx tsx scripts/test-fault-injection.ts
```

### Customize for Your Use Case

**Example: Build a custom transaction**

```typescript
// src/custom-tx.ts
import { TxBuilder } from './tx-builder.js';
import { Connection, Keypair } from '@solana/web3.js';
import fs from 'fs';

const connection = new Connection('https://api.devnet.solana.com');
const builder = new TxBuilder(connection);

// Load keypair
const keyData = JSON.parse(fs.readFileSync('keypairs/devnet.json'));
const keypair = Keypair.fromSecretKey(new Uint8Array(keyData));

// Create custom transaction
const tx = await builder.createTransferTx(
  keypair.publicKey,
  new PublicKey('RECIPIENT_ADDRESS'),
  0.001, // SOL amount
  keypair
);

// Submit via Jito bundle
// ... (see src/jito-manager.ts for bundle submission)
```

---

## 🚨 Common Issues & Solutions

### Issue 1: "Cannot find module '@solana/web3.js'"

**Cause**: Dependencies not installed

**Solution**:
```bash
npm install
```

### Issue 2: "Insufficient funds for fee"

**Cause**: Keypair balance is too low

**Solution**:
```bash
# Devnet: Get free airdrop
solana airdrop 15 --url devnet <YOUR_PUBLIC_KEY>

# Mainnet: Send real SOL to your address
```

### Issue 3: "Blockhash expired"

**Cause**: Network congestion or slow submission

**Solution**:
- This is normal! The AI agent will automatically retry
- Wait for the retry to complete
- Check `lifecycle_log.json` for agent reasoning

### Issue 4: "Permission denied" (macOS/Linux)

**Cause**: File permissions on keypair

**Solution**:
```bash
chmod 600 keypairs/*.json
```

### Issue 5: Native module errors (Windows)

**Cause**: Native dependencies failed to compile

**Solution**:
```bash
# Clean reinstall
rmdir /s /q node_modules
del package-lock.json
npm install --include=optional

# Or use Git Bash instead of PowerShell
```

---

## 📚 Resources

### Documentation
- [Architecture](./ARCHITECTURE.md) - System design
- [README](./README.md) - Quick reference
- [Project Summary](./PROJECT_SUMMARY.md) - Test results

### External Links
- [Solana Docs](https://solana.com/docs)
- [Jito Docs](https://docs.jito.wtf/)
- [Yellowstone gRPC](https://docs.triton.one/project-yellowstone/)
- [SolInfra](https://solinfra.dev) - Infrastructure provider

### Community
- [Solana Discord](https://discord.com/invite/solanacollective)
- [Jito Discord](https://discord.gg/jito-labs)
- [GitHub Issues](https://github.com/Cloud99p/solana-tx-stack/issues)

---

## ✅ Checklist

Before moving to mainnet, ensure you've completed:

- [ ] Node.js v20+ installed
- [ ] Repository cloned
- [ ] Dependencies installed (`npm install`)
- [ ] `.env` configured
- [ ] Keypair generated
- [ ] Keypair backed up securely
- [ ] Devnet test successful
- [ ] Explorer verification complete
- [ ] Read ARCHITECTURE.md
- [ ] Understood AI agent behavior

---

## 🎯 Mainnet Deployment

When you're ready for mainnet:

1. **Generate a NEW mainnet keypair** (never reuse devnet!)
   ```bash
   node scripts/generate-keypair.js
   # Save as keypairs/mainnet.json
   ```

2. **Fund with real SOL** (0.02 SOL recommended)

3. **Update `.env`**:
   ```env
   SOLANA_NETWORK=mainnet-beta
   RPC_URL=https://rpc.solinfra.dev
   YELLOWSTONE_ENDPOINT=https://grpc.solinfra.dev:443
   JITO_BLOCK_ENGINE_URL=https://mainnet.block-engine.jito.wtf
   AUTH_KEYPAIR_PATH=./keypairs/mainnet.json
   MIN_TIP_LAMPORTS=10000
   ```

4. **Test with small amounts first**

5. **Monitor lifecycle logs**: `lifecycle_log.json`

---

**Welcome to the Solana Transaction Stack!** 🚀

If you get stuck, open an issue on GitHub or check the troubleshooting section above.

*Last Updated: June 18, 2026*
