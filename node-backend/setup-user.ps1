# Script setup user đầu tiên và login
# Chạy: .\setup-user.ps1

$baseUrl = "http://localhost:9000"

Write-Host "`n=== Setup User Đầu Tiên ===" -ForegroundColor Cyan

# Bước 1: Setup user
$setupBody = @{
    email = "admin@example.com"
    password = "SecurePass123!"
} | ConvertTo-Json

try {
    Write-Host "Đang tạo user..." -ForegroundColor Yellow
    $setupResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/setup" `
        -Method POST `
        -ContentType "application/json" `
        -Body $setupBody
    
    Write-Host "✓ User created: $($setupResponse.email)" -ForegroundColor Green
    Write-Host "  ID: $($setupResponse.id)" -ForegroundColor Gray
    Write-Host "  Role: $($setupResponse.role)" -ForegroundColor Gray
    
    # Bước 2: Login
    Write-Host "`n=== Login ===" -ForegroundColor Cyan
    $loginBody = @{
        email = "admin@example.com"
        password = "SecurePass123!"
    } | ConvertTo-Json
    
    Write-Host "Đang login..." -ForegroundColor Yellow
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody
    
    $token = $loginResponse.token
    Write-Host "✓ Login thành công!" -ForegroundColor Green
    Write-Host "`nToken (lưu lại để dùng):" -ForegroundColor Yellow
    Write-Host $token -ForegroundColor White
    
    Write-Host "`n=== Hướng dẫn tiếp theo ===" -ForegroundColor Cyan
    Write-Host "1. Copy token ở trên" -ForegroundColor White
    Write-Host "2. Dùng token này để gọi các API khác" -ForegroundColor White
    Write-Host "3. Ví dụ tạo Cloudflare account:" -ForegroundColor White
    Write-Host "   POST http://localhost:9000/api/cf/accounts" -ForegroundColor Gray
    Write-Host "   Header: Authorization: Bearer $token" -ForegroundColor Gray
    
} catch {
    Write-Host "`n✗ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Red
    }
    Write-Host "`nKiểm tra:" -ForegroundColor Yellow
    Write-Host "- Server đang chạy? (http://localhost:9000/health)" -ForegroundColor White
    Write-Host "- User đã tồn tại? Thử login thay vì setup" -ForegroundColor White
}
