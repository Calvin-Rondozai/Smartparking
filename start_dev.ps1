<#
SmartParking Dev Starter (Windows PowerShell)
What it does:
- Starts Django backend on http://localhost:8000 (in a new window)
- Serves admin_dashboard on http://localhost:5500 (current window)

Usage:
- Right-click this file → Run with PowerShell, or run:
    powershell -ExecutionPolicy Bypass -File .\start_dev.ps1
#>

param()

function Start-Backend {
    Write-Host "[Backend] Starting Django at http://localhost:8000 ..." -ForegroundColor Green
    $backendPath = Join-Path $PSScriptRoot "backend"
    if (-not (Test-Path (Join-Path $backendPath "manage.py"))) {
        Write-Host "[Backend] manage.py not found under $backendPath" -ForegroundColor Red
        return
    }
    $command = "python manage.py runserver 0.0.0.0:8000"
    Start-Process -FilePath powershell -ArgumentList "-NoExit", "-Command", $command -WorkingDirectory $backendPath
}

function Start-AdminDashboard {
    Write-Host "[Admin] Serving admin_dashboard at http://localhost:5500 ..." -ForegroundColor Green
    $adminPath = Join-Path $PSScriptRoot "admin_dashboard"
    if (-not (Test-Path (Join-Path $adminPath "index.html"))) {
        Write-Host "[Admin] index.html not found under $adminPath" -ForegroundColor Red
        return
    }
    Push-Location $adminPath
    try {
        python -m http.server 5500
    } finally {
        Pop-Location
    }
}

Write-Host "================ SmartParking Dev Starter ================" -ForegroundColor Cyan
Write-Host "This will start:" -ForegroundColor Cyan
Write-Host " - Django backend on http://localhost:8000 (new window)" -ForegroundColor Cyan
Write-Host " - Admin dashboard on http://localhost:5500 (this window)" -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan

Start-Backend

Write-Host "`nTip: If login page can't reach the backend, run this once in DevTools:" -ForegroundColor Yellow
Write-Host "localStorage.setItem('backendOrigin', 'http://localhost:8000');" -ForegroundColor Yellow

Start-AdminDashboard

Write-Host "`nExited admin dashboard server." -ForegroundColor DarkGray
