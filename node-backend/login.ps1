# Script login va lay token
# Chay: .\login.ps1

$baseUrl = "http://localhost:9000"

Write-Host ""
Write-Host "=== Login ===" -ForegroundColor Cyan

$email = Read-Host "Email"
$password = Read-Host "Password" -AsSecureString
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
)

$loginBody = @{
    email = $email
    password = $plainPassword
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody
    
    $token = $response.token
    Write-Host ""
    Write-Host "Login thanh cong!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Token (copy de dung):" -ForegroundColor Yellow
    Write-Host $token -ForegroundColor White
    
    Write-Host ""
    Write-Host "=== Cach dung token ===" -ForegroundColor Cyan
    Write-Host "Luu token vao bien:" -ForegroundColor White
    $tokenCmd = '$token = "' + $token + '"'
    Write-Host $tokenCmd -ForegroundColor Gray
    Write-Host ""
    Write-Host "Sau do dung trong headers:" -ForegroundColor White
    $headerCmd = '$headers = @{ Authorization = "Bearer $token" }'
    Write-Host $headerCmd -ForegroundColor Gray
    
} catch {
    Write-Host ""
    Write-Host "Login failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            $reader.Close()
            Write-Host "Response:" -ForegroundColor Red
            Write-Host $responseBody -ForegroundColor Red
        } catch {
            Write-Host "Could not read response body" -ForegroundColor Yellow
        }
    }
}
