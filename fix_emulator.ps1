<#
Quick Fix Script for Stuck Android Emulator Connection
This script will help you reset and reconnect to your Android emulator
#>

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Android Emulator Connection Fix" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Kill existing Metro processes
Write-Host "[1/5] Killing existing Metro bundler processes..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*metro*" -or $_.CommandLine -like "*expo*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "✅ Metro processes killed" -ForegroundColor Green
Write-Host ""

# Step 2: Clear Expo cache
Write-Host "[2/5] Clearing Expo cache..." -ForegroundColor Yellow
cd frontend
if (Test-Path ".expo") {
    Remove-Item -Recurse -Force ".expo" -ErrorAction SilentlyContinue
    Write-Host "✅ Expo cache cleared" -ForegroundColor Green
}
else {
    Write-Host "⚠️ No .expo cache folder found" -ForegroundColor Yellow
}
Write-Host ""

# Step 3: Clear Metro cache
Write-Host "[3/5] Clearing Metro bundler cache..." -ForegroundColor Yellow
if (Test-Path "$env:TEMP/metro-*") {
    Remove-Item -Recurse -Force "$env:TEMP/metro-*" -ErrorAction SilentlyContinue
}
if (Test-Path "$env:TEMP/haste-map-*") {
    Remove-Item -Recurse -Force "$env:TEMP/haste-map-*" -ErrorAction SilentlyContinue
}
Write-Host "✅ Metro cache cleared" -ForegroundColor Green
Write-Host ""

# Step 4: Check if emulator is running
Write-Host "[4/5] Checking emulator status..." -ForegroundColor Yellow
$emulatorProcess = Get-Process -Name "qemu-system-x86_64" -ErrorAction SilentlyContinue
if ($emulatorProcess) {
    Write-Host "✅ Emulator is running" -ForegroundColor Green
}
else {
    Write-Host "⚠️ Emulator doesn't appear to be running" -ForegroundColor Yellow
    Write-Host "   Please start your Android emulator from Android Studio" -ForegroundColor Yellow
}
Write-Host ""

# Step 5: Instructions
Write-Host "[5/5] Next steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Make sure your Android emulator is open and running" -ForegroundColor White
Write-Host "2. Run these commands in order:" -ForegroundColor White
Write-Host ""
Write-Host "   cd frontend" -ForegroundColor Cyan
Write-Host "   npx expo start --clear --android" -ForegroundColor Cyan
Write-Host ""
Write-Host "   OR if that doesn't work:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   cd frontend" -ForegroundColor Cyan
Write-Host "   npx expo start --clear" -ForegroundColor Cyan
Write-Host "   (Then press 'a' to open on Android)" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. If still stuck, try:" -ForegroundColor White
Write-Host "   - Close and restart the emulator" -ForegroundColor Yellow
Write-Host "   - Press 'r' in Metro bundler to reload" -ForegroundColor Yellow
Write-Host "   - Press 'd' to open developer menu in emulator" -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

cd ..

