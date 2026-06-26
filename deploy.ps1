$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " DEPLOY - Abastecimento Vipe" -ForegroundColor Cyan
Write-Host "============================================"

# ── 1. Git ────────────────────────────────────
Write-Host "`n[1/4] Git status:" -ForegroundColor Yellow
git status --short

Write-Host "`n[2/4] Commit + push..." -ForegroundColor Yellow
git add -A
$changed = git status --porcelain
if ($changed) {
    git commit -m "feat: form abastecimento - wakelock, rascunho autosave, PopScope, timeout API; sync queue ordenacao por dependencia"
    git push origin main
    Write-Host "Git push OK -> Vercel vai buildar automaticamente." -ForegroundColor Green
} else {
    Write-Host "Nada novo para commitar." -ForegroundColor DarkGray
}

# ── 2. Flutter pub get ────────────────────────
Write-Host "`n[3/4] flutter pub get (APK_shorebird_teste)..." -ForegroundColor Yellow
Set-Location "$root\APK_shorebird_teste"
flutter pub get
Write-Host "Flutter pub get OK." -ForegroundColor Green

# ── 3. Shorebird patch ────────────────────────
Write-Host "`n[4/4] shorebird patch android..." -ForegroundColor Yellow
shorebird patch android
Write-Host "`nShorebird patch publicado!" -ForegroundColor Green

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host " DEPLOY CONCLUIDO!" -ForegroundColor Green
Write-Host "============================================"
Read-Host "Pressione Enter para fechar"
