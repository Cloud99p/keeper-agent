# Windows Setup Script for Solana TX Stack
# Run in PowerShell as regular user (not Admin)

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Solana TX Stack - Windows Setup" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js version
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green

if ($nodeVersion -notmatch "v2[0-9]") {
    Write-Host "  WARNING: Node.js 20+ recommended. Current: $nodeVersion" -ForegroundColor Red
    Write-Host "  Download from: https://nodejs.org/" -ForegroundColor Yellow
}

# Check npm
Write-Host "[2/5] Checking npm..." -ForegroundColor Yellow
$npmVersion = npm --version
Write-Host "  npm: $npmVersion" -ForegroundColor Green

# Install dependencies
Write-Host "[3/5] Installing dependencies..." -ForegroundColor Yellow
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: npm install failed" -ForegroundColor Red
    exit 1
}

Write-Host "  Dependencies installed successfully" -ForegroundColor Green

# Create .env if not exists
Write-Host "[4/5] Setting up environment..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "  Created .env from .env.example" -ForegroundColor Green
    Write-Host "  IMPORTANT: Edit .env and configure your settings!" -ForegroundColor Red
} else {
    Write-Host "  .env already exists" -ForegroundColor Green
}

# Create keypair directory
Write-Host "[5/5] Setting up keypair directory..." -ForegroundColor Yellow
if (-not (Test-Path "keypairs")) {
    New-Item -ItemType Directory -Path "keypairs" | Out-Null
    Write-Host "  Created keypairs/ directory" -ForegroundColor Green
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Edit .env with your configuration" -ForegroundColor White
Write-Host "  2. Create or import your keypair" -ForegroundColor White
Write-Host "  3. Run: npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "Documentation: README.md" -ForegroundColor Cyan
Write-Host ""
