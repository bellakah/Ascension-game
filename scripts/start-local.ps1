param(
  [ValidateSet('game', 'editor')]
  [string]$Mode = 'game'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Port = 5173
$BaseUrl = "http://127.0.0.1:$Port/Ascension-game/"
$TargetUrl = if ($Mode -eq 'editor') { "${BaseUrl}?editor=map" } else { $BaseUrl }

Set-Location $ProjectRoot

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Refresh-ProcessPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Get-NodeMajor {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { return 0 }
  try {
    return [int]((& node -p "process.versions.node.split('.')[0]").Trim())
  } catch {
    return 0
  }
}

function Ensure-Node {
  $major = Get-NodeMajor
  if ($major -ge 22) {
    Write-Host "Node.js encontrado: v$(& node -p 'process.versions.node')" -ForegroundColor DarkGray
    return
  }

  Write-Step 'Node.js 22+ nao encontrado. Tentando instalar Node LTS automaticamente...'
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw 'Node.js 22+ e necessario e o winget nao esta disponivel. Instale Node.js LTS e execute este arquivo novamente.'
  }

  if ($major -gt 0) {
    & winget upgrade --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
  } else {
    & winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
  }

  Refresh-ProcessPath
  $major = Get-NodeMajor
  if ($major -lt 22) {
    throw 'A instalacao do Node terminou, mas esta janela ainda nao encontrou Node.js 22+. Feche e abra o launcher novamente.'
  }

  Write-Host "Node.js instalado: v$(& node -p 'process.versions.node')" -ForegroundColor Green
}

function Ensure-Dependencies {
  $marker = Join-Path $ProjectRoot '.local-deps.ready'
  $nodeModules = Join-Path $ProjectRoot 'node_modules'
  $packageJson = Join-Path $ProjectRoot 'package.json'
  $packageLock = Join-Path $ProjectRoot 'package-lock.json'
  $needsInstall = -not (Test-Path $nodeModules) -or -not (Test-Path $marker)

  if (-not $needsInstall -and (Test-Path $marker)) {
    $markerTime = (Get-Item $marker).LastWriteTimeUtc
    if ((Get-Item $packageJson).LastWriteTimeUtc -gt $markerTime) { $needsInstall = $true }
    if ((Test-Path $packageLock) -and (Get-Item $packageLock).LastWriteTimeUtc -gt $markerTime) { $needsInstall = $true }
  }

  if (-not $needsInstall) {
    Write-Host 'Dependencias ja instaladas.' -ForegroundColor DarkGray
    return
  }

  Write-Step 'Instalando/atualizando dependencias do projeto...'
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
  if (-not $npm) { throw 'npm nao foi encontrado apos instalar o Node.js.' }

  & $npm.Source install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install falhou com codigo $LASTEXITCODE." }

  Set-Content -Path $marker -Value "dependencies ready - $([DateTime]::UtcNow.ToString('o'))" -Encoding ASCII
  Write-Host 'Dependencias prontas.' -ForegroundColor Green
}

function Test-AscensionServer {
  try {
    $response = Invoke-WebRequest -Uri $BaseUrl -UseBasicParsing -TimeoutSec 1
    return $response.StatusCode -ge 200 -and ($response.Content -match '@vite/client|Ascension')
  } catch {
    return $false
  }
}

function Start-LocalServer {
  if (Test-AscensionServer) {
    Write-Host "Servidor local ja esta ativo na porta $Port." -ForegroundColor DarkGray
    return
  }

  Write-Step "Iniciando servidor local na porta $Port..."
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
  if (-not $npm) { throw 'npm nao foi encontrado.' }

  $serverCommand = "title Ascension Local Server && `"$($npm.Source)`" run dev:local"
  Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', $serverCommand) -WorkingDirectory $ProjectRoot | Out-Null

  $ready = $false
  for ($attempt = 0; $attempt -lt 80; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (Test-AscensionServer) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    throw "O servidor nao respondeu em http://127.0.0.1:$Port. Veja a janela 'Ascension Local Server' para o erro."
  }
}

try {
  Write-Host 'ASCENSION - AMBIENTE LOCAL' -ForegroundColor White
  Write-Host "Modo: $Mode" -ForegroundColor DarkGray
  Ensure-Node
  Ensure-Dependencies
  Start-LocalServer

  Write-Step "Abrindo $Mode no navegador..."
  Start-Process $TargetUrl
  Write-Host "URL: $TargetUrl" -ForegroundColor Green
  Write-Host "Para desligar, feche a janela 'Ascension Local Server'." -ForegroundColor DarkGray
  exit 0
} catch {
  Write-Host ""
  Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
