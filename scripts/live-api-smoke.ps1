# Live API smoke tests (PowerShell) — Revyu Render
$ErrorActionPreference = "Continue"
$Base = "https://revyu-backend.onrender.com/api/v1"
$results = @()

function Test-Endpoint {
  param($Name, $Method, $Path, $Body, $Token)
  $headers = @{ "Content-Type" = "application/json" }
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }
  try {
    $params = @{
      Uri = "$Base$Path"
      Method = $Method
      Headers = $headers
      TimeoutSec = 90
    }
    if ($Body) {
      $params.Body = ($Body | ConvertTo-Json -Depth 8)
    }
    $res = Invoke-RestMethod @params
    $msg = "OK"
    if ($Path -eq "/home" -and $res.data.stats.totalBrands -eq 0) {
      $msg = "OK but DB empty - run seed"
    }
    $script:results += [pscustomobject]@{ Name = $Name; Status = "PASS"; Detail = $msg }
    return $res
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    $detail = if ($code) { "HTTP $code" } else { $_.Exception.Message }
    $script:results += [pscustomobject]@{ Name = $Name; Status = "FAIL"; Detail = $detail }
    return $null
  }
}

Write-Host "Testing $Base (cold start may take up to 60s)..."
Write-Host ""

$homeRes = Test-Endpoint "GET /home" "GET" "/home"
Test-Endpoint "GET /brands" "GET" "/brands"
Test-Endpoint "GET /brands/filters" "GET" "/brands/filters"

$suffix = Get-Random
$reg = Test-Endpoint "POST /auth/register" "POST" "/auth/register" @{
  email = "smoke.$suffix@revyu.ng"
  password = "testpass123"
  displayName = "Smoke Tester"
  username = "smoke$suffix"
}

$token = $null
if ($reg -and $reg.data.accessToken) {
  $token = $reg.data.accessToken
} else {
  $login = Test-Endpoint "POST /auth/login (seed demo)" "POST" "/auth/login" @{
    email = "chinedu.okafor@gmail.com"
    password = "demo1234"
  }
  if ($login) { $token = $login.data.accessToken }
}

if ($token) {
  Test-Endpoint "GET /users/me" "GET" "/users/me" $null $token
  Test-Endpoint "GET /users/me/dashboard" "GET" "/users/me/dashboard" $null $token
}

$admin = Test-Endpoint "POST /auth/login (admin)" "POST" "/auth/login" @{
  email = "admin@revyu.ng"
  password = "admin123"
}
if ($admin -and $admin.data.accessToken) {
  Test-Endpoint "GET /admin/dashboard" "GET" "/admin/dashboard" $null $admin.data.accessToken
}

Write-Host ""
Write-Host "=== RESULTS ==="
$results | Format-Table -AutoSize
$fail = @($results | Where-Object { $_.Status -eq "FAIL" }).Count
Write-Host "Failed: $fail / $($results.Count)"
if ($homeRes -and $homeRes.data.stats.totalBrands -eq 0) {
  Write-Host ""
  Write-Host "SEED REQUIRED - from apps/api run:"
  Write-Host '  $env:DATABASE_URL="<your Neon URI>"'
  Write-Host "  npx prisma db seed"
}
