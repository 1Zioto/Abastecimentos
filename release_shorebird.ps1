$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " NOVA RELEASE - Shorebird Abastecimento Vipe" -ForegroundColor Cyan
Write-Host "============================================"

# ── 1. Git ────────────────────────────────────
Write-Host "`n[1/4] Git status:" -ForegroundColor Yellow
git status --short

Write-Host "`n[2/4] Commit + push..." -ForegroundColor Yellow
git add -A
$changed = git status --porcelain
if ($changed) {
    git commit -m "feat: sync order proprietario->motorista->veiculo->abastecimento; form resilience wakelock+rascunho+PopScope; v2.0.19"
    git push origin main
    Write-Host "Git push OK -> Vercel vai buildar automaticamente." -ForegroundColor Green
} else {
    Write-Host "Nada novo para commitar." -ForegroundColor DarkGray
}

# ── 3. Flutter pub get ────────────────────────
Write-Host "`n[3/4] flutter pub get (APK_shorebird_teste)..." -ForegroundColor Yellow
Set-Location "$root\APK_shorebird_teste"
flutter pub get
Write-Host "Flutter pub get OK." -ForegroundColor Green

# ── 4. Shorebird release ──────────────────────
Write-Host "`n[4/4] shorebird release android..." -ForegroundColor Yellow
Write-Host "Isso vai compilar e publicar a versao 2.0.19+5905 como nova release base." -ForegroundColor DarkGray
shorebird release android
Write-Host "`nShorebird release publicada!" -ForegroundColor Green

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host " RELEASE CONCLUIDA!" -ForegroundColor Green
Write-Host " - Git push OK (Vercel vai buildar em breve)" -ForegroundColor Green
Write-Host " - Shorebird release 2.0.19+5905 publicada" -ForegroundColor Green
Write-Host "============================================"
Read-Host "Pressione Enter para fechar"
