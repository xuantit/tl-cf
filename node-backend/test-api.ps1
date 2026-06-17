# Script test API - Setup user, login, và tạo account
# Chạy: .\test-api.ps1

$baseUrl = "http://localhost:9000"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Setup và Test API" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Bước 1: Kiểm tra server
Write-Host "[1/4] Kiểm tra server..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET
    Write-Host "✓ Server đang chạy" -ForegroundColor Green
} catch {
    Write-Host "✗ Server không chạy! Hãy chạy: npm run dev" -ForegroundColor Red
    exit 1
}

# Bước 2: Setup user (nếu chưa có)
Write-Host "`n[2/4] Setup user đầu tiên..." -ForegroundColor Yellow
$setupBody = @{
    email = "admin@example.com"
    password = "SecurePass123!"
} | ConvertTo-Json

try {
    $setupResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/setup" `
        -Method POST `
        -ContentType "application/json" `
        -Body $setupBody
    
    Write-Host "✓ User created: $($setupResponse.email)" -ForegroundColor Green
} catch {
    $errorMsg = $_.Exception.Message
    if ($errorMsg -like "*already completed*") {
        Write-Host "✓ User đã tồn tại, bỏ qua setup" -ForegroundColor Yellow
    } else {
        Write-Host "✗ Error: $errorMsg" -ForegroundColor Red
        exit 1
    }
}

# Bước 3: Login
Write-Host "`n[3/4] Login để lấy token..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@example.com"
    password = "SecurePass123!"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody
    
    $token = $loginResponse.token
    Write-Host "✓ Login thành công!" -ForegroundColor Green
    Write-Host "`nToken (lưu lại):" -ForegroundColor Cyan
    Write-Host $token -ForegroundColor White
} catch {
    Write-Host "✗ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Bước 4: Test tạo account (nếu có thông tin)
Write-Host "`n[4/4] Test tạo Cloudflare account..." -ForegroundColor Yellow
Write-Host "Bạn có muốn tạo Cloudflare account ngay bây giờ? (y/n)" -ForegroundColor Cyan
$answer = Read-Host

if ($answer -eq "y" -or $answer -eq "Y") {
    $cfEmail = Read-Host "Cloudflare Email"
    $cfApiKey = Read-Host "Cloudflare Global API Key" -AsSecureString
    $plainApiKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($cfApiKey)
    )
    $label = Read-Host "Label (tên account)" 
    
    if ([string]::IsNullOrEmpty($label)) {
        $label = "My Account"
    }
    
    $accountBody = @{
        label = $label
        email = $cfEmail
        globalApiKey = $plainApiKey
    } | ConvertTo-Json
    
    $headers = @{
        Authorization = "Bearer $token"
    }
    
    try {
        $accountResponse = Invoke-RestMethod -Uri "$baseUrl/api/cf/accounts" `
            -Method POST `
            -ContentType "application/json" `
            -Headers $headers `
            -Body $accountBody
        
        Write-Host "✓ Account created!" -ForegroundColor Green
        Write-Host "  ID: $($accountResponse.id)" -ForegroundColor Gray
        Write-Host "  Label: $($accountResponse.label)" -ForegroundColor Gray
        Write-Host "  Email: $($accountResponse.email)" -ForegroundColor Gray
    } catch {
        Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response: $responseBody" -ForegroundColor Red
        }
    }
} else {
    Write-Host "Bỏ qua. Bạn có thể tạo account sau bằng:" -ForegroundColor Yellow
    Write-Host "  .\create-account.ps1" -ForegroundColor White
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Hoàn thành!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan
Write-Host "Token để dùng cho các API calls:" -ForegroundColor Yellow
Write-Host $token -ForegroundColor White
