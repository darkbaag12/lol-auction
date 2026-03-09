$ngrokExe = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "ngrok.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName

if (-not $ngrokExe) {
    Write-Host "ngrok을 찾을 수 없습니다. 설치를 확인하세요." -ForegroundColor Red
    exit 1
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " 경매 서버 ngrok 터널 시작 중..." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Start backends (8080) and frontend (3000) ngrok tunnels simultaneously
Start-Process -FilePath $ngrokExe -ArgumentList "http 8080 --log=stdout" -WindowStyle Minimized
Start-Sleep -Seconds 2
Start-Process -FilePath $ngrokExe -ArgumentList "http 3000 --log=stdout" -WindowStyle Minimized

Write-Host "ngrok 터널 시작 중... 잠시 기다려주세요." -ForegroundColor Yellow
Start-Sleep -Seconds 4

# Query ngrok local API to get tunnel URLs
try {
    $tunnels = (Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels").tunnels
    $backendTunnel = $tunnels | Where-Object { $_.config.addr -like "*8080*" } | Select-Object -First 1
    $frontendTunnel = $tunnels | Where-Object { $_.config.addr -like "*3000*" } | Select-Object -First 1

    if ($backendTunnel -and $frontendTunnel) {
        $backendUrl = $backendTunnel.public_url
        $frontendUrl = $frontendTunnel.public_url

        Write-Host ""
        Write-Host "============================================" -ForegroundColor Green
        Write-Host " 터널 생성 완료!" -ForegroundColor Green
        Write-Host "============================================" -ForegroundColor Green
        Write-Host " 프론트엔드(팀장 공유용): $frontendUrl" -ForegroundColor White
        Write-Host " 백엔드 API: $backendUrl" -ForegroundColor Gray
        Write-Host "============================================" -ForegroundColor Green
        Write-Host ""

        # Write backend URL to frontend .env.local so the app uses ngrok for API calls
        $envContent = "NEXT_PUBLIC_API_URL=$backendUrl/api"
        $envPath = "c:\gyeongmae program\frontend\.env.local"
        Set-Content -Path $envPath -Value $envContent
        Write-Host ".env.local 업데이트 완료: NEXT_PUBLIC_API_URL=$backendUrl/api" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "팀장들에게 아래 주소를 공유하세요:" -ForegroundColor Cyan
        Write-Host "  $frontendUrl" -ForegroundColor White -BackgroundColor DarkGreen
        Write-Host ""
        Write-Host "프론트엔드 서버(Next.js)를 재시작해야 합니다." -ForegroundColor Yellow
        Write-Host "기존 3000 포트 프로세스를 종료하고 재시작합니다..." -ForegroundColor Yellow

        # Kill existing Next.js dev server on port 3000 and restart
        $p3000 = (Get-NetTCPConnection -LocalPort 3000 -ErrorAction Ignore).OwningProcess
        if ($p3000) { Stop-Process -Id $p3000 -Force -ErrorAction Ignore }

        Start-Sleep -Seconds 1
        Start-Process cmd -WorkingDirectory "c:\gyeongmae program\frontend" -ArgumentList "/k npm run dev"

        Write-Host "프론트엔드가 재시작되었습니다!" -ForegroundColor Green
        Write-Host ""
        Write-Host "※ ngrok 무료 플랜은 터미널 창을 닫으면 URL이 바뀝니다." -ForegroundColor DarkYellow
    } else {
        Write-Host "터널 정보를 가져오지 못했습니다. 잠시 후 http://localhost:4040 에서 직접 확인하세요." -ForegroundColor Red
    }
} catch {
    Write-Host "ngrok API 조회 실패: $_" -ForegroundColor Red
    Write-Host "http://localhost:4040 에서 터널 주소를 직접 확인하세요." -ForegroundColor Yellow
}

Write-Host "스크립트 종료. 이 창을 닫지 마세요 (ngrok이 실행 중입니다)." -ForegroundColor Gray
pause
