#Requires -Version 5.1
<#
.SYNOPSIS
  Package slim V2-5.9 CI artifacts (Setup EXE + SHA + smoke + evidence + gate).
  Never includes win-unpacked, source tarballs, node_modules, or comparison folders.
#>
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [ValidateSet('all', 'setup', 'smoke', 'evidence', 'gate')]
  [string]$Mode = 'all'
)

$ErrorActionPreference = 'Stop'
Set-Location $RepoRoot

$outRoot = Join-Path $RepoRoot 'ci-artifacts'
function Ensure-Dir([string]$p) {
  New-Item -ItemType Directory -Force -Path $p | Out-Null
  return $p
}

function Write-Sha256File([string]$FilePath, [string]$OutPath) {
  $sha = (Get-FileHash -Algorithm SHA256 -Path $FilePath).Hash.ToLowerInvariant()
  @(
    "file=$(Split-Path -Leaf $FilePath)"
    "sha256=$sha"
    "sizeBytes=$((Get-Item $FilePath).Length)"
    "at=$((Get-Date).ToString('o'))"
    "commit=$((git rev-parse HEAD).Trim())"
    "runId=$($env:GITHUB_RUN_ID)"
  ) | Set-Content -Path $OutPath -Encoding UTF8
  return $sha
}

$setupDir = Ensure-Dir (Join-Path $outRoot 'setup-exe')
$smokeDir = Ensure-Dir (Join-Path $outRoot 'windows-smoke')
$evidenceDir = Ensure-Dir (Join-Path $outRoot 'release-evidence')
$gateDir = Ensure-Dir (Join-Path $outRoot 'release-gate')
$logsDir = Ensure-Dir (Join-Path $outRoot 'runtime-logs')

$setup = Get-ChildItem (Join-Path $RepoRoot 'dist') -Filter 'HijamaManagement-Setup-*.exe' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1

$manifest = [ordered]@{
  at = (Get-Date).ToString('o')
  commit = (git rev-parse HEAD).Trim()
  runId = $env:GITHUB_RUN_ID
  setupPresent = [bool]$setup
  setupSizeBytes = $(if ($setup) { $setup.Length } else { 0 })
  setupSha256 = $null
  packaged = @()
  excluded = @(
    'dist/win-unpacked/**',
    'source-release-*.tar.gz',
    'node_modules/**',
    'docs/comparison/**',
    'duplicate archives'
  )
}

if ($Mode -in @('all', 'setup')) {
  if (-not $setup) { throw 'Setup EXE missing - cannot package setup-exe' }
  if ($setup.Length -lt 50MB) { throw "Setup EXE too small ($($setup.Length)) - invalid" }
  Copy-Item -Force $setup.FullName (Join-Path $setupDir $setup.Name)
  $manifest.setupSha256 = Write-Sha256File $setup.FullName (Join-Path $setupDir 'SHA-256.txt')
  $manifest.packaged += 'setup-exe'
}

if ($Mode -in @('all', 'smoke')) {
  $srcEvidence = Join-Path $RepoRoot 'docs\integration-v2-5-9\evidence'
  $ae = Join-Path $srcEvidence 'ae-scenarios'
  foreach ($name in @(
      'windows-installed.json',
      'windows-build.json',
      'windows-host.json',
      'gha-step1-build.json',
      'ae-scenarios\smoke-launch.json',
      'ae-scenarios\clean-profile.json',
      'ae-scenarios\install-smoke-status.json',
      'ae-scenarios\install-prove.log',
      'ae-scenarios\electron-stderr.log',
      'ae-scenarios\OPERATOR-CHECKLIST.md'
    )) {
    $p = Join-Path $srcEvidence ($name -replace '/', '\')
    if (Test-Path $p) {
      $dest = Join-Path $smokeDir (Split-Path -Leaf $p)
      Copy-Item -Force $p $dest
    }
  }
  # Compress smoke folder contents into one zip for upload size control
  $smokeZip = Join-Path $smokeDir 'windows-smoke.zip'
  if (Test-Path $smokeZip) { Remove-Item $smokeZip -Force }
  $toZip = Get-ChildItem $smokeDir -File | Where-Object { $_.Name -ne 'windows-smoke.zip' }
  if ($toZip) {
    Compress-Archive -Path $toZip.FullName -DestinationPath $smokeZip -Force
    $toZip | Remove-Item -Force
  }
  $manifest.packaged += 'windows-smoke'
}

if ($Mode -in @('all', 'evidence')) {
  $src = Join-Path $RepoRoot 'docs\integration-v2-5-9'
  $stage = Ensure-Dir (Join-Path $env:TEMP ("v259-evidence-" + [guid]::NewGuid().ToString('N')))
  # Copy only lightweight evidence + key protocol docs (no full doc tree bloat)
  $copyNames = @(
    'LIVE-WINDOWS-CLOSURE-PROTOCOL.md',
    'WINDOWS-AE-RUNTIME.md',
    'REQUIREMENTS-TRACEABILITY.md',
    'FINAL-RELEASE-READINESS.md',
    'MULTI-DEVICE-WINDOWS-UAT.md',
    'ARTIFACTS-STABILIZATION-REPORT.md',
    'evidence'
  )
  foreach ($n in $copyNames) {
    $p = Join-Path $src $n
    if (Test-Path $p) {
      $dest = Join-Path $stage $n
      if ((Get-Item $p).PSIsContainer) {
        Copy-Item -Recurse -Force $p $dest
      } else {
        Copy-Item -Force $p $dest
      }
    }
  }
  # Strip tarballs / large binaries from staged evidence
  Get-ChildItem $stage -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'source-release-*.tar.gz' -or $_.Length -gt 20MB } |
    Remove-Item -Force -ErrorAction SilentlyContinue
  $evZip = Join-Path $evidenceDir 'release-evidence.zip'
  if (Test-Path $evZip) { Remove-Item $evZip -Force }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $evZip -Force
  Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
  $manifest.packaged += 'release-evidence'
}

if ($Mode -in @('all', 'gate')) {
  $gateJson = Join-Path $gateDir 'release-gate-report.json'
  $gate = [ordered]@{
    at = (Get-Date).ToString('o')
    commit = $manifest.commit
    runId = $env:GITHUB_RUN_ID
    runUrl = $(if ($env:GITHUB_SERVER_URL -and $env:GITHUB_REPOSITORY -and $env:GITHUB_RUN_ID) {
        "$($env:GITHUB_SERVER_URL)/$($env:GITHUB_REPOSITORY)/actions/runs/$($env:GITHUB_RUN_ID)"
      } else { $null })
    setupSha256 = $manifest.setupSha256
    readyForRelease = 'NO'
    readyForMain = 'NO'
    note = 'Gate report packaged from CI; exit code recorded by workflow step'
  }
  $gate | ConvertTo-Json -Depth 6 | Set-Content $gateJson -Encoding UTF8
  $manifest.packaged += 'release-gate'
}

$manifest | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $outRoot 'package-manifest.json') -Encoding UTF8
Write-Host ("PACKAGED mode={0} items={1} setupSha={2}" -f $Mode, ($manifest.packaged -join ','), $manifest.setupSha256)
