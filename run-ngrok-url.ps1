$ErrorActionPreference = "Stop"

$ngrokExe = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "ngrok.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if (-not $ngrokExe) {
    Write-Host "[?¤ë¥˜] ngrok???¤ì¹˜?˜ì? ?Šì•˜?µë‹ˆ??" -ForegroundColor Red
    exit 1
}

# ê¸°ì¡´ ngrok ?„ë¡œ?¸ìŠ¤ ì¢…ë£Œ
$pngrok = Get-Process -Name "ngrok" -ErrorAction SilentlyContinue
if ($pngrok) { Stop-Process -Id $pngrok.Id -Force }
Start-Sleep -Seconds 1

# Ngrok ?œì‘ (?¬íŠ¸ 3000 ?˜ë‚˜ë§??°ë™, ë°±ì—”?œëŠ” Next.js API Proxyê°€ ì²˜ë¦¬)
Start-Process -FilePath $ngrokExe -ArgumentList "http 3000 --log=stdout" -WindowStyle Minimized
Write-Host "?Œ ?¸ë? ?‘ì† ì£¼ì†Œë¥?ë°œê¸‰ë°›ëŠ” ì¤‘ì…?ˆë‹¤..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

try {
    $tunnels = (Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels").tunnels
    $frontendTunnel = $tunnels | Where-Object { $_.config.addr -like "*3000*" } | Select-Object -First 1

    if ($frontendTunnel) {
        $frontendUrl = $frontendTunnel.public_url

        Write-Host ""
        Write-Host "===================================================" -ForegroundColor Green
        Write-Host "  ???œë²„ ë°??¸ë? ?‘ì† ì¤€ë¹??„ë£Œ!" -ForegroundColor Green
        Write-Host "===================================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "  ?€?¥ë“¤?ê²Œ ?„ë˜ ì£¼ì†Œë¥?ë³µì‚¬?´ì„œ ?„ë‹¬?˜ì„¸??" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  ?‘‰ $frontendUrl ?‘ˆ" -ForegroundColor White -BackgroundColor DarkBlue
        Write-Host ""
        Write-Host "  (??ì£¼ì˜: ??ê²€?€??ì°½ì´??ìµœì†Œ?”ëœ ?°ë???ì°½ë“¤?? -ForegroundColor Gray
        Write-Host "      ëª¨ë‘ ?„ë©´ ê²½ë§¤?¥ì´ ?«í™?ˆë‹¤. ì¼œë‘?¸ìš”!)" -ForegroundColor Gray
        Write-Host "===================================================" -ForegroundColor Green
        Write-Host ""
        
        # ?¸ìŠ¤??ë³¸ì¸???”ë©´ ?„ìš°ê¸?        Start-Process "$frontendUrl/admin?new=true"
    } else {
        Write-Host "[?¤ë¥˜] ?¸í„°??ì£¼ì†Œë¥?ë°œê¸‰ë°›ì? ëª»í–ˆ?µë‹ˆ??" -ForegroundColor Red
    }
} catch {
    Write-Host "[?¤ë¥˜] URL ?•ì¸ ?¤íŒ¨. ì§ì ‘ ngrok ?”ë©´???•ì¸?˜ì„¸??" -ForegroundColor Red
}

Write-Host '
[µğ¹ö±ë Á¤º¸] ½ºÅ©¸³Æ® ½ÇÇàÀÌ ³¡³µ½À´Ï´Ù. Ã¢À» ´İÀ¸·Á¸é ¾Æ¹« Å°³ª ´©¸£¼¼¿ä...' -ForegroundColor Magenta
pause
