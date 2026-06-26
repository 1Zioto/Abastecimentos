@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo  DEPLOY - Abastecimento Vipe
echo ============================================
echo.

:: ─── 1. Git status ───────────────────────────
echo [1/4] Verificando mudancas...
git status --short
echo.

:: ─── 2. Git commit + push ────────────────────
echo [2/4] Commitando e enviando para o repositorio...
git add -A
git commit -m "feat: form abastecimento - wakelock, rascunho autosave, PopScope, timeout API; sync queue ordenacao por dependencia"
if %ERRORLEVEL% NEQ 0 (
    echo Nada novo para commitar ou erro no commit.
) else (
    git push origin main
    if %ERRORLEVEL% NEQ 0 (
        echo ERRO no git push. Verifique sua conexao e permissoes.
        pause
        exit /b 1
    )
    echo Git push OK - Vercel iniciara o deploy automaticamente.
)
echo.

:: ─── 3. Flutter pub get (resolve wakelock_plus) ──
echo [3/4] Baixando dependencias Flutter (wakelock_plus)...
cd APK_shorebird_teste
call flutter pub get
if %ERRORLEVEL% NEQ 0 (
    echo ERRO no flutter pub get.
    pause
    exit /b 1
)
echo Flutter pub get OK.
echo.

:: ─── 4. Shorebird patch ──────────────────────
echo [4/4] Publicando patch OTA no Shorebird...
call shorebird patch android
if %ERRORLEVEL% NEQ 0 (
    echo ERRO no shorebird patch.
    pause
    exit /b 1
)
echo.
echo ============================================
echo  DEPLOY CONCLUIDO!
echo  - Git push OK (Vercel vai buildar em breve)
echo  - Shorebird patch publicado
echo ============================================
pause
