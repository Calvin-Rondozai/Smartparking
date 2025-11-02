<#
SmartParking Dev Starter (Windows PowerShell)
What it does:
- Starts Django backend on http://localhost:8000 (in a new window)
- Serves admin_dashboard on http://localhost:5500 (current window, with login.html as default)

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
    if (-not (Test-Path (Join-Path $adminPath "login.html"))) {
        Write-Host "[Admin] login.html not found under $adminPath" -ForegroundColor Red
        return
    }

    Push-Location $adminPath
    try {
        # Create a small temporary Python script to serve login.html as default
        $pythonScript = @"
import http.server, socketserver, os

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Redirect root path to login.html
        if self.path == '/' or self.path == '':
            self.send_response(302)
            self.send_header('Location', '/login.html')
            self.end_headers()
            return
        
        # For directory requests, serve login.html as default
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            # Check for login.html first, then index.html
            for default in ["login.html", "index.html"]:
                index = os.path.join(path, default)
                if os.path.exists(index):
                    self.path = '/' + os.path.relpath(index, os.getcwd()).replace('\\', '/')
                    break
        
        # Serve the file using standard handling
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

PORT = 5500
print(f"[Admin] Serving admin_dashboard at http://localhost:{PORT}")
print(f"[Admin] Root path (/) redirects to login.html")
print(f"[Admin] login.html is the default entry point")
with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
    httpd.serve_forever()
"@

        $tempFile = [System.IO.Path]::GetTempFileName() + ".py"
        Set-Content -Path $tempFile -Value $pythonScript -Encoding UTF8
        python $tempFile
        Remove-Item $tempFile -Force
    }
    finally {
        Pop-Location
    }
}

Write-Host "================ SmartParking Dev Starter ================" -ForegroundColor Cyan
Write-Host "This will start:" -ForegroundColor Cyan
Write-Host " - Django backend on http://localhost:8000 (new window)" -ForegroundColor Cyan
Write-Host " - Admin dashboard on http://localhost:5500 (this window, login.html default)" -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan

Start-Backend

Write-Host "`nTip: If login page can't reach the backend, run this once in DevTools:" -ForegroundColor Yellow
Write-Host "localStorage.setItem('backendOrigin', 'http://localhost:8000');" -ForegroundColor Yellow

Start-AdminDashboard

Write-Host "`nExited admin dashboard server." -ForegroundColor DarkGray
