# Script tạo Cloudflare account
# Chạy: .\create-account.ps1
# Hoặc: .\create-account.ps1 -Token "your-token-here"

param(
    [string]$Token = "",
    [string]$Email = "",
    [string]$ApiKey = "",
    [string]$Label = ""
)

$baseUrl = "http://localhost:9000"

# Nếu không có token, yêu cầu login
if ([string]::IsNullOrEmpty($Token)) {
    Write-Host "=== Login để lấy Token ===" -ForegroundColor Cyan
    $userEmail = Read-Host "Email (tool login)"
    $password = Read-Host "Password" -AsSecureString
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    )
    
    $loginBody = @{
        email = $userEmail
        password = $plainPassword
    } | ConvertTo-Json
    
    try {
        $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" `
            -Method POST `
            -ContentType "application/json" `
            -Body $loginBody
        $Token = $loginResponse.token
        Write-Host "✓ Login thành công!" -ForegroundColor Green
    } catch {
        Write-Host "✗ Login failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# Nhập thông tin Cloudflare account
if ([string]::IsNullOrEmpty($Email)) {
    $Email = Read-Host "Cloudflare Email"
}
if ([string]::IsNullOrEmpty($ApiKey)) {
    $ApiKey = Read-Host "Cloudflare Global API Key" -AsSecureString
    $ApiKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ApiKey)
    )
}
if ([string]::IsNullOrEmpty($Label)) {
    $Label = Read-Host "Label (tên account)" 
}

Write-Host "`n=== Tạo Cloudflare Account ===" -ForegroundColor Cyan

$accountBody = @{
    label = $Label
    email = $Email
    globalApiKey = $ApiKey
} | ConvertTo-Json

$headers = @{
    Authorization = "Bearer $Token"
}

try {
    Write-Host "Đang tạo account..." -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri "$baseUrl/api/cf/accounts" `
        -Method POST `
        -ContentType "application/json" `
        -Headers $headers `
        -Body $accountBody
    
    Write-Host "✓ Account created!" -ForegroundColor Green
    Write-Host "  ID: $($response.id)" -ForegroundColor Gray
    Write-Host "  Label: $($response.label)" -ForegroundColor Gray
    Write-Host "  Email: $($response.email)" -ForegroundColor Gray
    
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Red
    }
}
