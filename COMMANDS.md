# Command Reference - Solana Transaction Stack

> Quick reference for all commands. Choose the right command for the right task.

---

## 💡 Quick Decision Guide

| You Want To... | Use This Command |
|----------------|------------------|
| Run dashboard | `npm run dashboard` |
| Run dev/test scripts | `npx tsx scripts/<script>.js` |
| Start dev server | `npm run dev` |
| Build for production | `npm run build` |
| Run tests | `npx tsx scripts/test-bundle.js` |

---

## 📋 Command Types Explained

### 1. `npm run <script>` - Predefined Scripts

**When**: The script is defined in `package.json` under `scripts`

**Examples**:
```bash
# Dashboard (predefined in package.json)
npm run dashboard
npm run dashboard:open

# Development server
npm run dev

# Production build
npm run build

# Clean build artifacts
npm run clean
```

**Why**: These are registered commands that can handle complex setups, dependencies, or multiple steps.

---

### 2. `npx tsx <script.ts>` - Run TypeScript Files

**When**: Running TypeScript files (`.ts` extension)

**Examples**:
```bash
# Generate keypair
npx tsx scripts/generate-keypair.js

# Run single bundle test
npx tsx scripts/test-bundle.js

# AI stress test
npx tsx scripts/test-ai-stress.ts

# Generate intelligence report
npx tsx scripts/generate-report.js

# Run comprehensive tests
npx tsx scripts/test-comprehensive.ts
```

**Why**: This project uses ES modules and TypeScript. `tsx` automatically:
- Compiles TypeScript to JavaScript
- Handles ES module imports/exports
- Runs without build step

**Note**: Even though files have `.js` extension, they're TypeScript files!

---

### 3. `node <script.js>` - Direct Node Execution

**When**: Running plain JavaScript files (NOT recommended for this project)

**Examples** (NOT RECOMMENDED):
```bash
# ❌ Don't do this - use tsx instead
node scripts/dashboard-server.js
```

**Why NOT to use**: This project uses ES modules which require special handling. `tsx` handles it automatically.

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
# Build for production
npm run build

# Run compiled version
npm start
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
npx tsx scripts/<script>.js
# NOT: node scripts/<script>.js
```

### TypeScript Errors

```bash
# Check TypeScript compilation
npx tsc --noEmit

# Or just run with tsx (handles compilation automatically)
npx tsx scripts/<script>.js
```

---

## 📊 Dashboard Commands

| Command | What It Does |
|---------|--------------|
| `npm run dashboard` | Start dashboard server at localhost:3000 |
| `npm run dashboard:open` | Start server + open browser automatically |

**Then in another terminal:**
```bash
# Run tests while dashboard monitors
npx tsx scripts/test-bundle.js
```

---

## 🧪 Testing Commands

| Command | Purpose |
|---------|---------|
| `npx tsx scripts/test-bundle.js` | Single bundle test |
| `npx tsx scripts/test-ai-stress.ts` | AI failure recovery test |
| `npx tsx scripts/test-comprehensive.ts` | Full test suite |

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

---

## 🎯 Quick Reference Card

**Copy-paste this for quick reference:**

```bash
# === SETUP ===
npm install
npx tsx scripts/generate-keypair.js

# === RUN ===
npm run dashboard:open          # Dashboard
npx tsx scripts/test-bundle.js  # Test bundle
npx tsx scripts/test-ai-stress.ts  # Stress test

# === BUILD ===
npm run build
npm start

# === REPORT ===
npx tsx scripts/generate-report.js
```

---

## 🌐 Platform-Specific Notes

### Windows PowerShell

```powershell
# Run multiple tests
1..10 | ForEach-Object { npx tsx scripts/test-bundle.js; Start-Sleep -Seconds 3 }

# Or use Git Bash (recommended)
for i in {1..10}; do npx tsx scripts/test-bundle.js; sleep 3; done
```

### macOS/Linux

```bash
# Run multiple tests
for i in {1..10}; do npx tsx scripts/test-bundle.js; sleep 3; done
```

---

## 📚 Additional Resources

- **README.md**: Full project documentation
- **ONBOARDING.md**: Step-by-step setup guide
- **ARCHITECTURE.md**: Technical architecture details
- **LICENSING.md**: License information and commercial use

---

*Last Updated: June 18, 2026*
