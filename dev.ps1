# Starts baza-RMB locally on Windows:
#   database (Docker) -> case service (PHP, 8081) -> admin portal (PHP, 8082) -> AI service + website mock (8000)
# Usage (from the baza-rmb folder):   .\dev.ps1
# Stop with Ctrl+C (also stops the PHP services).

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path .env)) { throw ".env not found. Copy .env.example to .env and fill it in." }

# Load .env into this process (child processes inherit it)
Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2].Trim(), "Process")
    }
}
$env:SERVE_TEST_PAGE = "true"

Write-Host "1/4 Starting the database (Docker)..." -ForegroundColor Cyan
docker compose up -d db | Out-Null
for ($i = 0; $i -lt 30; $i++) {
    docker compose exec -T db pg_isready -U $env:POSTGRES_USER -d $env:POSTGRES_DB *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 2
}

$env:DB_DSN = "pgsql:host=127.0.0.1;port=$($env:DB_PORT);dbname=$($env:POSTGRES_DB)"
$env:DB_USER = $env:POSTGRES_USER
$env:DB_PASSWORD = $env:POSTGRES_PASSWORD
$env:AI_ADMIN_URL = "http://127.0.0.1:8000/api/v1/admin"

Write-Host "2/4 Starting the case service (PHP) on http://127.0.0.1:8081 ..." -ForegroundColor Cyan
$php = Start-Process php -ArgumentList '-d', 'extension=pdo_pgsql', '-S', '127.0.0.1:8081', 'case-service/public/index.php' `
    -PassThru -NoNewWindow -RedirectStandardError "$env:TEMP\baza-php.log"

Write-Host "3/4 Starting the admin portal (PHP) on http://127.0.0.1:8082 ..." -ForegroundColor Cyan
$portal = Start-Process php -ArgumentList '-d', 'extension=pdo_pgsql', '-d', 'extension=curl', '-d', 'upload_max_filesize=50M', '-d', 'post_max_size=52M', `
    '-S', '127.0.0.1:8082', '-t', 'admin-portal/public', 'admin-portal/public/index.php' -PassThru -NoNewWindow -RedirectStandardError "$env:TEMP\baza-portal.log"

Write-Host "4/4 Starting the AI service (loads the embedding model, ~20 s)..." -ForegroundColor Cyan
Write-Host "    Website + chat widget : http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "    Admin dashboard       : http://127.0.0.1:8082   (first login: PORTAL_ADMIN_EMAIL / PORTAL_ADMIN_PASSWORD in .env)" -ForegroundColor Green
Write-Host "    Developer test page   : http://127.0.0.1:8000/test.html   API docs: http://127.0.0.1:8000/docs" -ForegroundColor Green
Push-Location ai-service
try {
    & .\.venv\Scripts\python.exe -X utf8 -m app.serve --port 8000
}
finally {
    Pop-Location
    Stop-Process -Id $php.Id -ErrorAction SilentlyContinue
    Stop-Process -Id $portal.Id -ErrorAction SilentlyContinue
    Write-Host "Stopped." -ForegroundColor Yellow
}
