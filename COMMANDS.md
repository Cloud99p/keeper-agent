# Command Reference - Solana Transaction Stack

> Complete reference for all commands and scripts. Choose the right command for the right task.

---

## 💡 Quick Decision Guide

| You Want To... | Use This Command |
|----------------|------------------|
| Run dashboard | `npm run dashboard` |
| Run dev/test scripts | `npx tsx scripts/<script>` |
| Start dev server | `npm run dev` |
| Build for production | `npm run build` |
| Run tests | `npx tsx scripts/test-bundle.js` |
| Generate keypair | `npx tsx scripts/generate-keypair.js` |
| Check keypair | `npx tsx scripts/check-keypair.ts` |
| Send transactions | `npx tsx scripts/send-10-tx.ts` |
| Submit Jito bundles | `npx tsx scripts/submit-10-mainnet.ts` |
| Generate reports | `npx tsx scripts/generate-report.js` |

---

## 📋 NPM Scripts (package.json)

These are registered in `package.json` and can be run with `npm run <script>`.

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (`tsx src/index.ts`) |
| `npm run build` | Compile TypeScript to JavaScript (`tsc`) |
| `npm run start` | Run compiled production build (`node dist/index.js`) |
| `npm run clean` | Remove build artifacts (`rm -rf dist`) |
| `npm run lint` | Run ESLint on source files |
| `npm run test` | Run tests with Vitest |
| `npm run dashboard` | Start dashboard server at localhost:3000 |
| `npm run dashboard:open` | Start dashboard and open browser |
| `npm run sync` | Sync lifecycle log (`node scripts/sync-lifecycle.js`) |
| `npm run dashboard:full` | Run dashboard + sync concurrently |

---

## 📜 Script Commands (scripts/)

All scripts in the `scripts/` folder. Run with `npx tsx scripts/<filename>`.

### 🔑 Key Management

| Script | Command | Description |
|--------|---------|-------------|
| `generate-keypair.js` | `npx tsx scripts/generate-keypair.js` | Generate new Solana keypair, save to `.keypair/` |
| `generate-keypair.ts` | `npx tsx scripts/generate-keypair.ts` | TypeScript version of keypair generation |
| `check-keypair.ts` | `npx tsx scripts/check-keypair.ts` | Verify keypair exists and is valid |

### 📊 Dashboard & Monitoring

| Script | Command | Description |
|--------|---------|-------------|
| `dashboard-server.js` | `npx tsx scripts/dashboard-server.js` | Start web dashboard for monitoring |
| `sync-lifecycle.js` | `npx tsx scripts/sync-lifecycle.js` | Sync transaction lifecycle logs |
| `export-lifecycle.ts` | `npx tsx scripts/export-lifecycle.ts` | Export lifecycle data to file |
| `fix-lifecycle-format.ts` | `npx tsx scripts/fix-lifecycle-format.ts` | Fix lifecycle log formatting issues |
| `convert-to-dashboard.ts` | `npx tsx scripts/convert-to-dashboard.ts` | Convert data for dashboard format |

### 🧪 Testing Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `test-bundle.js` | `npx tsx scripts/test-bundle.js` | Single Jito bundle test |
| `test-comprehensive.ts` | `npx tsx scripts/test-comprehensive.ts` | Full comprehensive test suite |
| `test-ai-stress.ts` | `npx tsx scripts/test-ai-stress.ts` | AI failure recovery stress test |
| `test-ai-stress-large.ts` | `npx tsx scripts/test-ai-stress-large.ts` | Large-scale AI stress test |
| `test-fault-injection.ts` | `npx tsx scripts/test-fault-injection.ts` | Fault injection testing |
| `medium-complexity-test.ts` | `npx tsx scripts/medium-complexity-test.ts` | Medium complexity scenario tests |
| `full-capability-test.ts` | `npx tsx scripts/full-capability-test.ts` | Full capability validation |

### 📡 Transaction Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `send-10-tx.ts` | `npx tsx scripts/send-10-tx.ts` | Send 10 transactions to Solana |
| `send-mainnet-tx.ts` | `npx tsx scripts/send-mainnet-tx.ts` | Send transaction to mainnet |
| `submit-10-mainnet.ts` | `npx tsx scripts/submit-10-mainnet.ts` | Submit 10 bundles to mainnet Jito |

### 📈 Reporting & Analysis

| Script | Command | Description |
|--------|---------|-------------|
| `generate-report.js` | `npx tsx scripts/generate-report.js` | Generate intelligence report (INTELLIGENCE_REPORT.md) |
| `log-ai-decisions.ts` | `npx tsx scripts/log-ai-decisions.ts` | Log AI decision-making process |

### 🪟 Platform Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `setup-windows.ps1` | `powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1` | Windows setup script |

---

## 🚀 Common Workflows

### Quick Start (First Time)

```bash
# 1. Clone repo
git clone https://github.com/Cloud99p/solana-tx-stack.git
cd solana-tx-stack

# 2. Install dependencies
npm install

# 3. Configure
cp .env.example .env
# Edit .env with your RPC credentials

# 4. Generate keypair
npx tsx scripts/generate-keypair.js

# 5. Fund keypair (devnet airdrop)
solana airdrop 2 <YOUR_ADDRESS> --url devnet

# 6. Test
npx tsx scripts/test-bundle.js
```

### Daily Development

```bash
# Start dashboard for monitoring
npm run dashboard:open

# Run bundle tests in another terminal
npx tsx scripts/test-bundle.js

# Run stress tests
npx tsx scripts/test-ai-stress.ts

# Generate report after testing
npx tsx scripts/generate-report.js
```

### Production Deployment

```bash
# Clean previous build
npm run clean

# Build for production
npm run build

# Run compiled version
npm start
```

### Full Testing Suite

```bash
# Run all tests in sequence
npx tsx scripts/test-bundle.js
npx tsx scripts/test-comprehensive.ts
npx tsx scripts/test-ai-stress.ts
npx tsx scripts/test-fault-injection.ts
npx tsx scripts/full-capability-test.ts

# Generate final report
npx tsx scripts/generate-report.js
```

### Mainnet Operations

```bash
# Check keypair before mainnet
npx tsx scripts/check-keypair.ts

# Send test transactions
npx tsx scripts/send-10-tx.ts

# Submit bundles to mainnet
npx tsx scripts/submit-10-mainnet.ts

# Monitor via dashboard
npm run dashboard
```

---

## 🔧 Troubleshooting Commands

### "Cannot find module" Error

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### "ES Module" Error

```bash
# Use tsx instead of node
npx tsx scripts/<script>
# NOT: node scripts/<script>
```

### TypeScript Errors

```bash
# Check TypeScript compilation
npx tsc --noEmit

# Or just run with tsx (handles compilation automatically)
npx tsx scripts/<script>
```

### Lifecycle Log Issues

```bash
# Fix format issues
npx tsx scripts/fix-lifecycle-format.ts

# Re-sync lifecycle
npx tsx scripts/sync-lifecycle.js

# Export for backup
npx tsx scripts/export-lifecycle.ts
```

### Dashboard Issues

```bash
# Kill existing dashboard
pkill -f dashboard-server

# Restart dashboard
npm run dashboard:open
```

---

## 📊 Dashboard Commands

| Command | What It Does |
|---------|--------------|
| `npm run dashboard` | Start dashboard server at localhost:3000 |
| `npm run dashboard:open` | Start server + open browser automatically |
| `npm run dashboard:full` | Run dashboard + lifecycle sync together |

**Then in another terminal:**
```bash
# Run tests while dashboard monitors
npx tsx scripts/test-bundle.js
```

---

## 🧪 Testing Commands Reference

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `npx tsx scripts/test-bundle.js` | Single bundle test | Quick validation |
| `npx tsx scripts/test-comprehensive.ts` | Full test suite | Before deployment |
| `npx tsx scripts/test-ai-stress.ts` | AI failure recovery | Stress testing |
| `npx tsx scripts/test-ai-stress-large.ts` | Large-scale stress | Load testing |
| `npx tsx scripts/test-fault-injection.ts` | Fault injection | Resilience testing |
| `npx tsx scripts/medium-complexity-test.ts` | Medium scenarios | Integration testing |
| `npx tsx scripts/full-capability-test.ts` | Full validation | Release testing |

**Run multiple tests:**
```bash
# Run 10 bundle tests
for i in {1..10}; do
  npx tsx scripts/test-bundle.js
  sleep 3
done
```

---

## 📝 Report Generation

```bash
# Generate intelligence report after testing
npx tsx scripts/generate-report.js

# Output: INTELLIGENCE_REPORT.md
```

**Report includes:**
- Test results summary
- Performance metrics
- AI decision analysis
- Recommendations

---

## 🎯 Quick Reference Card

**Copy-paste this for quick reference:**

```bash
# === SETUP ===
npm install
npx tsx scripts/generate-keypair.js
npx tsx scripts/check-keypair.ts

# === RUN ===
npm run dashboard:open          # Dashboard
npm run dev                     # Dev server
npx tsx scripts/test-bundle.js  # Test bundle

# === BUILD ===
npm run clean
npm run build
npm start

# === TEST ===
npx tsx scripts/test-comprehensive.ts
npx tsx scripts/test-ai-stress.ts
npx tsx scripts/full-capability-test.ts

# === MAINNET ===
npx tsx scripts/send-10-tx.ts
npx tsx scripts/submit-10-mainnet.ts

# === REPORT ===
npx tsx scripts/generate-report.js
npx tsx scripts/log-ai-decisions.ts
```

---

## 🌐 Platform-Specific Notes

### Windows PowerShell

```powershell
# Run multiple tests
1..10 | ForEach-Object { npx tsx scripts/test-bundle.js; Start-Sleep -Seconds 3 }

# Windows setup
powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1

# Or use Git Bash (recommended)
for i in {1..10}; do npx tsx scripts/test-bundle.js; sleep 3; done
```

### macOS/Linux

```bash
# Run multiple tests
for i in {1..10}; do
  npx tsx scripts/test-bundle.js
  sleep 3
done
```

---

## 📚 Additional Resources

| File | Description |
|------|-------------|
| `README.md` | Full project documentation |
| `ONBOARDING.md` | Step-by-step setup guide |
| `DEEPSEEK_INTEGRATION.md` | DeepSeek AI integration details |
| `PROJECT_SUMMARY.md` | Project overview and goals |
| `LICENSING.md` | License information and commercial use |
| `lifecycle_log.json` | Transaction lifecycle records |

---

## 🔐 Security Notes

- **Never commit** `.keypair/*.json` files to git
- **Always verify** keypair before mainnet operations
- **Use devnet** for testing: `solana airdrop 2 <ADDRESS> --url devnet`
- **Keep `.env`** secure with proper RPC credentials

---

*Last Updated: June 22, 2026*
