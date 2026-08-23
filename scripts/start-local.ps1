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
  try { return [int]((& node -p "process.versions.node.split('.')[0]").Trim()) } catch { return 0 }
}

function Get-Npm {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
  if (-not $npm) { throw 'npm nao foi encontrado.' }
  return $npm
}

function Ensure-Node {
  $major = Get-NodeMajor
  if ($major -ge 22) {
    Write-Host "Node.js encontrado: v$(& node -p 'process.versions.node')" -ForegroundColor DarkGray
    return
  }

  Write-Step 'Node.js 22+ nao encontrado. Tentando instalar Node LTS automaticamente...'
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'Node.js 22+ e necessario e o winget nao esta disponivel. Instale Node.js LTS e execute novamente.'
  }

  if ($major -gt 0) {
    & winget upgrade --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
  } else {
    & winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
  }

  Refresh-ProcessPath
  if ((Get-NodeMajor) -lt 22) {
    throw 'Node foi instalado, mas esta janela ainda nao encontrou Node.js 22+. Feche e abra o launcher novamente.'
  }
}

function Ensure-Dependencies {
  $marker = Join-Path $ProjectRoot '.local-deps.ready'
  $nodeModules = Join-Path $ProjectRoot 'node_modules'
  $packageJson = Join-Path $ProjectRoot 'package.json'
  $packageLock = Join-Path $ProjectRoot 'package-lock.json'
  $needsInstall = -not (Test-Path $nodeModules) -or -not (Test-Path $marker)

  if (-not $needsInstall) {
    $markerTime = (Get-Item $marker).LastWriteTimeUtc
    if ((Get-Item $packageJson).LastWriteTimeUtc -gt $markerTime) { $needsInstall = $true }
    if ((Test-Path $packageLock) -and (Get-Item $packageLock).LastWriteTimeUtc -gt $markerTime) { $needsInstall = $true }
  }

  if (-not $needsInstall) {
    Write-Host 'Dependencias ja instaladas.' -ForegroundColor DarkGray
    return
  }

  Write-Step 'Instalando/atualizando dependencias do projeto...'
  $npm = Get-Npm
  & $npm.Source install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install falhou com codigo $LASTEXITCODE." }
  Set-Content -Path $marker -Value "dependencies ready - $([DateTime]::UtcNow.ToString('o'))" -Encoding ASCII
}

function Ensure-ProductionBuild {
  $marker = Join-Path $ProjectRoot '.local-build.ready'
  $distIndex = Join-Path $ProjectRoot 'dist\index.html'
  $needsBuild = -not (Test-Path $distIndex) -or -not (Test-Path $marker)

  if (-not $needsBuild) {
    $markerTime = (Get-Item $marker).LastWriteTimeUtc
    $paths = @(
      (Join-Path $ProjectRoot 'src'),
      (Join-Path $ProjectRoot 'build'),
      (Join-Path $ProjectRoot 'package.json'),
      (Join-Path $ProjectRoot 'vite.config.ts'),
      (Join-Path $ProjectRoot 'tsconfig.json'),
      (Join-Path $ProjectRoot 'index.html')
    )
    foreach ($path in $paths) {
      if (-not (Test-Path $path)) { continue }
      $item = Get-Item $path
      if ($item.PSIsContainer) {
        $newer = Get-ChildItem $path -Recurse -File | Where-Object { $_.LastWriteTimeUtc -gt $markerTime } | Select-Object -First 1
        if ($newer) { $needsBuild = $true; break }
      } elseif ($item.LastWriteTimeUtc -gt $markerTime) {
        $needsBuild = $true; break
      }
    }
  }

  if (-not $needsBuild) {
    Write-Host 'Build local de producao ja esta atualizado.' -ForegroundColor DarkGray
    return
  }

  Write-Step 'Preparando build local de producao...'
  $npm = Get-Npm
  & $npm.Source run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build falhou com codigo $LASTEXITCODE." }
  Set-Content -Path $marker -Value "build ready - $([DateTime]::UtcNow.ToString('o'))" -Encoding ASCII
  Write-Host 'Build local pronto.' -ForegroundColor Green
}

function Test-AscensionServer {
  try {
    $response = Invoke-WebRequest -Uri $BaseUrl -UseBasicParsing -TimeoutSec 1
    return $response.StatusCode -ge 200 -and ($response.Content -match 'Ascension|/assets/')
  } catch { return $false }
}

function Start-LocalServer {
  if (Test-AscensionServer) {
    Write-Host "Servidor local ja esta ativo na porta $Port." -ForegroundColor DarkGray
    return
  }

  Write-Step "Iniciando versao de producao local na porta $Port..."
  $npm = Get-Npm
  $serverCommand = "title Ascension Local Server && `"$($npm.Source)`" run preview:local"
  Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', $serverCommand) -WorkingDirectory $ProjectRoot | Out-Null

  for ($attempt = 0; $attempt -lt 80; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (Test-AscensionServer) { return }
  }
  throw "O servidor nao respondeu em http://127.0.0.1:$Port. Veja a janela 'Ascension Local Server'."
}

try {
  Write-Host 'ASCENSION - AMBIENTE LOCAL' -ForegroundColor White
  Write-Host "Modo: $Mode" -ForegroundColor DarkGray
  Ensure-Node
  Ensure-Dependencies
  Ensure-ProductionBuild
  Start-LocalServer
  Write-Step "Abrindo $Mode no navegador..."
  Start-Process $TargetUrl
  Write-Host "URL: $TargetUrl" -ForegroundColor Green
  Write-Host 'Esta versao usa o build de producao local para medir desempenho com mais fidelidade.' -ForegroundColor DarkGray
  Write-Host "Para desligar, feche a janela 'Ascension Local Server'." -ForegroundColor DarkGray
  exit 0
} catch {
  Write-Host ""
  Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
