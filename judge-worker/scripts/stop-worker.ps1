$procs = Get-CimInstance Win32_Process -Filter "name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object {
    $_.CommandLine -match 'judge-worker[\\/]src[\\/]worker\.ts' -or
    $_.CommandLine -match 'judge-worker[\\/]dist[\\/]worker\.js' -or
    $_.CommandLine -match 'judge-worker[\\/][^\s]*tsx[^\s]*\s+watch[^\s]*\s+src[\\/]worker\.ts'
  }
if (-not $procs) {
  Write-Host "[stop-worker] 未发现运行中的 judge-worker"
  exit 0
}
foreach ($p in $procs) {
  Write-Host "[stop-worker] 结束 PID $($p.ProcessId)"
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 800
