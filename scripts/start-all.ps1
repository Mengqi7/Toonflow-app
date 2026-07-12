# ToonFlow One-Click Startup Script
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   ToonFlow Startup" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "ERROR: Node.js not found. Please install Node.js 18+." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Node.js $($node.Version)" -ForegroundColor Green

# Paths
$backendDir = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $backendDir "frontend"

Write-Host ""
Write-Host "[Dirs]" -ForegroundColor Yellow
Write-Host "   Backend:  $backendDir" -ForegroundColor Gray
Write-Host "   Frontend: $frontendDir" -ForegroundColor Gray
Write-Host ""

# Install deps if needed
function Install-Deps($dir, $label) {
    if (-not (Test-Path "$dir/node_modules")) {
        Write-Host "[Deps] Installing $label dependencies..." -ForegroundColor Yellow
        Push-Location $dir
        yarn install --frozen-lockfile 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { npm install 2>&1 | Out-Null }
        Pop-Location
        Write-Host "[OK] $label deps installed" -ForegroundColor Green
    } else {
        Write-Host "[OK] $label dependencies already installed" -ForegroundColor Gray
    }
}

Install-Deps $backendDir "Backend"
if (Test-Path $frontendDir) {
    Install-Deps $frontendDir "Frontend"
} else {
    Write-Host "[WARN] Frontend not found: $frontendDir" -ForegroundColor Yellow
}

# Kill existing processes by port or by command line
function Stop-ExistingService($port, $label) {
    Write-Host ""
    Write-Host "[Kill] Checking $label (port $port)..." -ForegroundColor Yellow

    # Method 1: Kill by port using Get-NetTCPConnection
    $tcpConn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($tcpConn) {
        $pidToKill = $tcpConn.OwningProcess
        try {
            $proc = Get-Process -Id $pidToKill -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "   Found $label process: PID=$pidToKill, Name=$($proc.ProcessName)" -ForegroundColor DarkYellow
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 500
                # Verify it's dead
                $stillAlive = Get-Process -Id $pidToKill -ErrorAction SilentlyContinue
                if (-not $stillAlive) {
                    Write-Host "   [OK] Killed $label process (PID $pidToKill)" -ForegroundColor Green
                } else {
                    Write-Host "   [WARN] Failed to kill PID $pidToKill, trying taskkill..." -ForegroundColor Red
                    taskkill /F /PID $pidToKill 2>$null | Out-Null
                }
            }
        } catch {
            Write-Host "   [INFO] Process already exited" -ForegroundColor Gray
        }
    }

    # Method 2: Also kill by command line pattern (nodemon / tsx / vite)
    $patterns = @()
    if ($label -eq "Backend") {
        $patterns = @("nodemon", "tsx", "node.*app.ts", "node.*app.js")
    } else {
        $patterns = @("vite", "node.*vite")
    }

    foreach ($pattern in $patterns) {
        $procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match $pattern } | Select-Object ProcessId, Name, CommandLine
        foreach ($p in $procs) {
            # Make sure we don't kill ourselves or unrelated processes
            if ($p.ProcessId -eq $PID) { continue }
            try {
                Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
                Write-Host "   [OK] Killed $label related process: $($p.Name) (PID $($p.ProcessId))" -ForegroundColor Green
            } catch {
                # ignore
            }
        }
    }

    # Final check
    Start-Sleep -Milliseconds 300
    $tcpCheck = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $tcpCheck) {
        Write-Host "   [OK] Port $port is now FREE" -ForegroundColor DarkGreen
    } else {
        Write-Host "   [WARN] Port $port still in use by PID $($tcpCheck.OwningProcess)" -ForegroundColor Red
    }
}

# Stop existing services before starting new ones
Stop-ExistingService 10588 "Backend"
Stop-ExistingService 50188 "Frontend"

# Check ports
Write-Host ""
Write-Host "[Ports]" -ForegroundColor Yellow
$tcpBack = Get-NetTCPConnection -State Listen -LocalPort 10588 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($tcpBack) { Write-Host "   10588 (backend) : USED (PID $($tcpBack.OwningProcess))" -ForegroundColor DarkYellow } else { Write-Host "   10588 (backend) : FREE" -ForegroundColor DarkGreen }

$tcpFront = Get-NetTCPConnection -State Listen -LocalPort 50188 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($tcpFront) { Write-Host "   50188 (frontend): USED (PID $($tcpFront.OwningProcess))" -ForegroundColor DarkYellow } else { Write-Host "   50188 (frontend): FREE" -ForegroundColor DarkGreen }

# Start backend
Write-Host ""
Write-Host "[1/2] Starting backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendDir'; Write-Host '[Backend]' -ForegroundColor Green; npx nodemon --exec tsx src/app.ts"

# Start frontend if exists
if (Test-Path $frontendDir) {
    Write-Host "[2/2] Starting frontend..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendDir'; Write-Host '[Frontend]' -ForegroundColor Green; yarn dev"
}

# Done
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Startup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
if (Test-Path $frontendDir) {
    Write-Host "Backend API: http://127.0.0.1:10588" -ForegroundColor White
    Write-Host "Frontend   : http://127.0.0.1:50188" -ForegroundColor White
} else {
    Write-Host "Backend API: http://127.0.0.1:10588" -ForegroundColor White
}
Write-Host ""
Write-Host "Each service runs in a new window." -ForegroundColor Gray
Write-Host "Close the window or Ctrl+C to stop." -ForegroundColor Gray
