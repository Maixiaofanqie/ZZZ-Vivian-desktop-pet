#requires -Version 5.1
<#
.SYNOPSIS
  薇薇安桌宠 24h 浸泡采样脚本。

.DESCRIPTION
  按固定间隔采样打包版「Vivian Desk Pet」进程树，输出 CSV 与摘要。
  不修改被测应用，不新增运行时采样代码；CSV 默认写入 release/soak/（构建产物，不提交）。

.PARAMETER IntervalSeconds
  采样间隔（秒），1–3600；24h 浸泡推荐 60。

.PARAMETER DurationHours
  浸泡时长（小时），0–48；24h 验收用 24。短时冒烟可用 0.01。

.PARAMETER OutputPath
  CSV 输出路径，必须以 .csv 结尾；父目录不存在时会创建。
  不传时默认 release/soak/soak-YYYYMMDD-HHmmss.csv。

.PARAMETER ProcessName
  进程名（不含 .exe），默认 Vivian Desk Pet。

.PARAMETER Force
  输出文件已存在时覆盖；默认报错。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/soak-test.ps1 -IntervalSeconds 60 -DurationHours 24

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/soak-test.ps1 -IntervalSeconds 2 -DurationHours 0.002 -OutputPath release/soak/smoke.csv -Force
#>
[CmdletBinding()]
param(
  [int]$IntervalSeconds = 60,
  [double]$DurationHours = 24,
  [string]$OutputPath = '',
  [string]$ProcessName = 'Vivian Desk Pet',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$inv = [Globalization.CultureInfo]::InvariantCulture

function Fail([string]$message, [int]$code = 2) {
  Write-Error $message -ErrorAction Continue
  exit $code
}

function Format-Number([double]$value, [string]$format = 'F1') {
  return $value.ToString($format, $inv)
}

# ---------- 参数校验 ----------
if ($IntervalSeconds -lt 1 -or $IntervalSeconds -gt 3600) {
  Fail "IntervalSeconds 必须在 1–3600 之间（24h 浸泡推荐 60）。当前值：$IntervalSeconds"
}
if ([double]::IsNaN($DurationHours) -or [double]::IsInfinity($DurationHours) -or $DurationHours -le 0 -or $DurationHours -gt 48) {
  Fail "DurationHours 必须在 0–48 之间（24h 验收用 24）。当前值：$DurationHours"
}
if ([string]::IsNullOrWhiteSpace($ProcessName)) {
  Fail 'ProcessName 不能为空。'
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $OutputPath = Join-Path (Join-Path (Get-Location) 'release/soak') "soak-$stamp.csv"
}
if (-not $OutputPath.EndsWith('.csv', [StringComparison]::OrdinalIgnoreCase)) {
  Fail "OutputPath 必须以 .csv 结尾。当前值：$OutputPath"
}
$outFull = [IO.Path]::GetFullPath($OutputPath)
$parent = Split-Path -Parent $outFull
if ([string]::IsNullOrWhiteSpace($parent)) { $parent = (Get-Location).Path }
if (-not (Test-Path -LiteralPath $parent)) {
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
}
if (Test-Path -LiteralPath $outFull) {
  if (-not $Force) {
    Fail "输出文件已存在：$outFull。换一个路径，或加 -Force 覆盖。"
  }
  Remove-Item -LiteralPath $outFull -Force
}

$utf8Bom = New-Object System.Text.UTF8Encoding($true)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$header = 'Timestamp,ElapsedSeconds,Alive,ProcessCount,MainPid,TotalWorkingSetMB,TotalPrivateWorkingSetMB,MainWorkingSetMB,MainPrivateWorkingSetMB,TotalCpuPercent,MainHandleCount,TotalHandleCount'
[IO.File]::WriteAllText($outFull, $header + "`r`n", $utf8Bom)

function Get-Snapshot {
  $procs = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
  if ($procs.Count -eq 0) {
    return [pscustomobject]@{
      Alive = $false
      ProcessCount = 0
      MainPid = ''
      TotalWorkingSetMB = 0.0
      TotalPrivateWorkingSetMB = 0.0
      MainWorkingSetMB = 0.0
      MainPrivateWorkingSetMB = 0.0
      TotalCpuSeconds = 0.0
      MainHandleCount = 0
      TotalHandleCount = 0
    }
  }

  $pidSet = @{}
  foreach ($p in $procs) { $pidSet[[int]$p.Id] = $true }

  $parentMap = @{}
  try {
    $cim = @(Get-CimInstance Win32_Process -Filter "Name = '$ProcessName.exe'" -ErrorAction Stop)
    foreach ($c in $cim) { $parentMap[[int]$c.ProcessId] = [int]$c.ParentProcessId }
  } catch {
    # 取不到父进程时退回「工作集最大的进程」作为主进程
  }

  $roots = @()
  foreach ($p in $procs) {
    $ppid = $parentMap[[int]$p.Id]
    if (-not $ppid -or -not $pidSet.ContainsKey([int]$ppid)) { $roots += $p }
  }
  if ($roots.Count -eq 0) {
    $roots = @($procs | Sort-Object WorkingSet64 -Descending | Select-Object -First 1)
  }
  $root = $roots | Sort-Object WorkingSet64 -Descending | Select-Object -First 1

  # 私有工作集（任务管理器「内存」口径）；取不到时退回 PrivateMemorySize64
  $privateWsById = @{}
  try {
    $perf = @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -ErrorAction Stop |
      Where-Object { $pidSet.ContainsKey([int]$_.IDProcess) })
    foreach ($row in $perf) {
      $privateWsById[[int]$row.IDProcess] = [double]$row.WorkingSetPrivate
    }
  } catch {
    # 性能计数器不可用时用私有提交量近似
  }
  $totalPrivateWs = 0.0
  foreach ($p in $procs) {
    if ($privateWsById.ContainsKey([int]$p.Id)) {
      $totalPrivateWs += $privateWsById[[int]$p.Id]
    } else {
      $totalPrivateWs += [double]$p.PrivateMemorySize64
    }
  }
  $mainPrivateWs = if ($privateWsById.ContainsKey([int]$root.Id)) {
    $privateWsById[[int]$root.Id]
  } else {
    [double]$root.PrivateMemorySize64
  }

  $totalWs = ($procs | Measure-Object WorkingSet64 -Sum).Sum
  $totalCpu = ($procs | Measure-Object CPU -Sum).Sum
  $totalHandles = ($procs | Measure-Object HandleCount -Sum).Sum

  return [pscustomobject]@{
    Alive = $true
    ProcessCount = $procs.Count
    MainPid = $root.Id
    TotalWorkingSetMB = [double]$totalWs / 1MB
    TotalPrivateWorkingSetMB = [double]$totalPrivateWs / 1MB
    MainWorkingSetMB = [double]$root.WorkingSet64 / 1MB
    MainPrivateWorkingSetMB = [double]$mainPrivateWs / 1MB
    TotalCpuSeconds = [double]$totalCpu
    MainHandleCount = [int]$root.HandleCount
    TotalHandleCount = [int]$totalHandles
  }
}

$startTime = Get-Date
$sw = [Diagnostics.Stopwatch]::StartNew()
$durationSeconds = $DurationHours * 3600.0

$sampleCount = 0
$aliveSamples = 0
$cpuSum = 0.0
$cpuCount = 0
$cpuMin = $null
$cpuMax = $null
$wsSum = 0.0
$wsMax = 0.0
$privateWsSum = 0.0
$privateWsMax = 0.0
$handleMin = $null
$handleMax = $null
$warmupWs = $null
$privateWarmupWs = $null
$lastSnapshot = $null
$prevCpuSeconds = $null
$prevElapsed = $null
$aliveAtEnd = $false

Write-Host "浸泡开始：$ProcessName，间隔 ${IntervalSeconds}s，时长 ${DurationHours}h"
Write-Host "输出：$outFull"

while ($true) {
  $now = Get-Date
  $elapsed = $sw.Elapsed.TotalSeconds
  $snap = Get-Snapshot
  $lastSnapshot = $snap
  $sampleCount++

  $cpuPercent = ''
  if ($snap.Alive) {
    $aliveSamples++
    if ($null -ne $prevCpuSeconds -and $null -ne $prevElapsed -and $elapsed -gt $prevElapsed) {
      $deltaCpu = [double]$snap.TotalCpuSeconds - [double]$prevCpuSeconds
      if ($deltaCpu -lt 0) { $deltaCpu = 0 } # 进程重启时 CPU 总时间会回退
      $cpuValue = $deltaCpu / (($elapsed - $prevElapsed) * [Environment]::ProcessorCount) * 100.0
      $cpuPercent = Format-Number $cpuValue
      $cpuSum += $cpuValue
      $cpuCount++
      if ($null -eq $cpuMin -or $cpuValue -lt $cpuMin) { $cpuMin = $cpuValue }
      if ($null -eq $cpuMax -or $cpuValue -gt $cpuMax) { $cpuMax = $cpuValue }
    }
    $wsSum += [double]$snap.TotalWorkingSetMB
    if ([double]$snap.TotalWorkingSetMB -gt $wsMax) { $wsMax = [double]$snap.TotalWorkingSetMB }
    $privateWsSum += [double]$snap.TotalPrivateWorkingSetMB
    if ([double]$snap.TotalPrivateWorkingSetMB -gt $privateWsMax) { $privateWsMax = [double]$snap.TotalPrivateWorkingSetMB }
    if ($null -eq $handleMin -or $snap.MainHandleCount -lt $handleMin) { $handleMin = $snap.MainHandleCount }
    if ($null -eq $handleMax -or $snap.MainHandleCount -gt $handleMax) { $handleMax = $snap.MainHandleCount }
    if ($elapsed -ge 7200 -and $null -eq $warmupWs) { $warmupWs = [double]$snap.TotalWorkingSetMB }
    if ($elapsed -ge 7200 -and $null -eq $privateWarmupWs) { $privateWarmupWs = [double]$snap.TotalPrivateWorkingSetMB }
  }

  $prevCpuSeconds = $snap.TotalCpuSeconds
  $prevElapsed = $elapsed

  $line = @(
    $now.ToString('o', $inv),
    (Format-Number $elapsed),
    $(if ($snap.Alive) { 1 } else { 0 }),
    $snap.ProcessCount,
    $snap.MainPid,
    (Format-Number $snap.TotalWorkingSetMB),
    (Format-Number $snap.TotalPrivateWorkingSetMB),
    (Format-Number $snap.MainWorkingSetMB),
    (Format-Number $snap.MainPrivateWorkingSetMB),
    $cpuPercent,
    $snap.MainHandleCount,
    $snap.TotalHandleCount
  ) -join ','
  [IO.File]::AppendAllText($outFull, $line + "`r`n", $utf8NoBom)

  $aliveAtEnd = $snap.Alive
  if ($elapsed -ge $durationSeconds) { break }

  $sleepSeconds = [math]::Min([double]$IntervalSeconds, $durationSeconds - $elapsed)
  if ($sleepSeconds -le 0) { break }
  Start-Sleep -Milliseconds ([int]($sleepSeconds * 1000))
}
$sw.Stop()
$endTime = Get-Date

$cpuAvg = if ($cpuCount -gt 0) { $cpuSum / $cpuCount } else { $null }
$wsAvg = if ($aliveSamples -gt 0) { $wsSum / $aliveSamples } else { $null }
$privateWsAvg = if ($aliveSamples -gt 0) { $privateWsSum / $aliveSamples } else { $null }
$warmupGrowth = if ($null -ne $warmupWs -and $null -ne $lastSnapshot) { [double]$lastSnapshot.TotalWorkingSetMB - [double]$warmupWs } else { $null }
$privateWarmupGrowth = if ($null -ne $privateWarmupWs -and $null -ne $lastSnapshot) { [double]$lastSnapshot.TotalPrivateWorkingSetMB - [double]$privateWarmupWs } else { $null }

$summaryLines = @(
  '薇薇安桌宠 · 浸泡摘要',
  "进程：$ProcessName",
  "开始：$($startTime.ToString('yyyy-MM-dd HH:mm:ss'))",
  "结束：$($endTime.ToString('yyyy-MM-dd HH:mm:ss'))",
  "实际时长：$((Format-Number $sw.Elapsed.TotalHours 'F2')) h（目标 ${DurationHours} h）",
  "采样间隔：${IntervalSeconds}s，样本数：$sampleCount，存活样本：$aliveSamples",
  "结束时存活：$aliveAtEnd",
  "CPU 平均/最低/最高：$(if ($null -ne $cpuAvg) { Format-Number $cpuAvg 'F2' } else { 'n/a' }) / $(if ($null -ne $cpuMin) { Format-Number $cpuMin 'F2' } else { 'n/a' }) / $(if ($null -ne $cpuMax) { Format-Number $cpuMax 'F2' } else { 'n/a' }) %",
  "全部进程工作集（含共享页）平均/最高：$(if ($null -ne $wsAvg) { Format-Number $wsAvg 'F2' } else { 'n/a' }) / $(Format-Number $wsMax 'F2') MB",
  "私有工作集（任务管理器口径，全部进程）平均/最高：$(if ($null -ne $privateWsAvg) { Format-Number $privateWsAvg 'F2' } else { 'n/a' }) / $(Format-Number $privateWsMax 'F2') MB（v1.0 标准 < 250MB）",
  "主进程私有工作集（最后样本）：$(if ($null -ne $lastSnapshot) { Format-Number $lastSnapshot.MainPrivateWorkingSetMB 'F1' } else { 'n/a' }) MB",
  "主进程句柄最低/最高：$(if ($null -ne $handleMin) { $handleMin } else { 'n/a' }) / $(if ($null -ne $handleMax) { $handleMax } else { 'n/a' })",
  "预热 2h 后私有工作集增长：$(if ($null -ne $privateWarmupGrowth) { Format-Number $privateWarmupGrowth 'F2' } else { 'n/a（时长不足 2h）' }) MB"
)
$summary = $summaryLines -join "`r`n"
[IO.File]::WriteAllText("$outFull.summary.txt", $summary + "`r`n", $utf8Bom)
Write-Host ''
Write-Host $summary
Write-Host ''
Write-Host "CSV：$outFull"
Write-Host "摘要：$outFull.summary.txt"

if ($aliveAtEnd -and $aliveSamples -gt 0) { exit 0 }
exit 1
