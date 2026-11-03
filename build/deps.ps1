<#
  LoliBox — вспомогательный скрипт установщика (build/deps.ps1).

  Вызывается NSIS-установщиком (build/lolibox.nsh). Скрипт проверяет наличие
  внешних компонентов (yt-dlp, ffmpeg) и при необходимости скачивает их в
  каталог %LOCALAPPDATA%\LoliBox\bin.

  Состояние передаётся в NSIS через каталог маленьких ASCII-файлов
  (по одному значению в каждом файле, UTF-8 без BOM) — так установщику не
  приходится разбирать вывод консоли и не важна кодировка:

    <id>.state   — "found" | "missing"      — найден ли компонент
    <id>.path    — путь к найденному файлу   (может отсутствовать)
    <id>.pct     — "0".."100"               — прогресс загрузки, %
    <id>.result  — "ok" | "error"            — итог установки компонента
    <id>.msg     — короткое ASCII-сообщение
    started      — "1"                      — скрипт запустился
    finished     — "1"                      — работа завершена

  Режимы:
    status  — только проверка наличия (быстро).
    install — проверка + докачка отсутствующих (с записью прогресса).

  Ключ -Force: искать компоненты только в $BinDir (нашем управляемом
  каталоге) и скачивать их, даже если они есть в системе. Нужен для
  восстановления «сломанной» установки и для проверки сценария загрузки.
#>
param(
  [string]$Mode = 'status',
  [string]$BinDir = '',
  [string]$StatusDir = '',
  [switch]$Force
)

# Отладочный/тестовый переключатель: LOLIBOX_DEPS_FORCE=1 заставляет
# искать компоненты только в $BinDir и скачивать их заново. Нужен,
# чтобы проверить сценарий «в системе ничего нет» без удаления
# реально установленных yt-dlp/ffmpeg.
if ($env:LOLIBOX_DEPS_FORCE -eq '1') {
  $Force = $true
}

$ErrorActionPreference = 'Stop'
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11
} catch {
}

if (-not $BinDir) {
  $BinDir = Join-Path $env:LOCALAPPDATA 'LoliBox\bin'
}
if (-not $StatusDir) {
  $StatusDir = Join-Path $env:TEMP 'lolibox-deps'
}

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-State {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$Value = ''
  )
  if ($null -eq $Value) { $Value = '' }
  # оставляем только печатаемые ASCII-символы, чтобы NSIS прочитал без проблем
  $safe = [regex]::Replace($Value, '[^\x20-\x7E]', '?')
  $path = Join-Path $StatusDir $Name
  [System.IO.File]::WriteAllText($path, $safe, $Utf8NoBom)
}

function Clear-State {
  param([string]$Name)
  $path = Join-Path $StatusDir $Name
  try { [System.IO.File]::Delete($path) } catch { }
}

$Components = @(
  @{
    Id = 'yt-dlp'
    Exe = 'yt-dlp.exe'
    Zip = $false
    Wants = @('yt-dlp.exe')
    Sources = @(
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    )
  },
  @{
    Id = 'ffmpeg'
    Exe = 'ffmpeg.exe'
    Zip = $true
    Wants = @('ffmpeg.exe', 'ffprobe.exe')
    Sources = @(
      'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
      'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'
    )
  }
)

function Get-SystemDirs {
  $home = $env:USERPROFILE
  if (-not $home) { $home = $env:HOMEDRIVE + $env:HOMEPATH }
  $local = $env:LOCALAPPDATA
  $roaming = $env:APPDATA
  $dirs = @(
    (Join-Path $local 'Microsoft\WinGet\Links'),
    (Join-Path $local 'Microsoft\WinGet\Packages'),
    (Join-Path $home 'scoop\shims'),
    (Join-Path $home 'scoop\apps\ffmpeg\current\bin'),
    (Join-Path $home 'scoop\apps\yt-dlp\current'),
    (Join-Path $home 'scoop\apps\yt-dlp\current\bin'),
    'C:\ProgramData\chocolatey\bin',
    (Join-Path $roaming 'npm'),
    (Join-Path $local 'Programs'),
    'C:\ffmpeg\bin'
  )

  $extra = @()
  # Пакеты WinGet лежат в подпапках Packages\<пакет>.<версия>\ — ищем внутри
  try {
    $packages = Join-Path $local 'Microsoft\WinGet\Packages'
    foreach ($entry in (Get-ChildItem -LiteralPath $packages -Directory -ErrorAction SilentlyContinue)) {
      if ($entry.Name -match 'yt-?dlp|ffmpeg') {
        $extra += $entry.FullName
        $extra += (Join-Path $entry.FullName 'bin')
      }
    }
  } catch {
  }

  # Python-пакеты (pip install --user): ...\Python3xx\Scripts
  try {
    foreach ($entry in (Get-ChildItem -LiteralPath (Join-Path $local 'Programs') -Directory -ErrorAction SilentlyContinue)) {
      if ($entry.Name -match '^Python') {
        $extra += (Join-Path $entry.FullName 'Scripts')
      }
    }
  } catch {
  }

  return ($dirs + $extra)
}

function Find-Component {
  param($Component)

  $exe = $Component.Exe

  # 1) Наш собственный каталог
  $managed = Join-Path $BinDir $exe
  if (Test-Path -LiteralPath $managed -PathType Leaf) { return $managed }

  # При -Force нас интересует только управляемый каталог.
  if ($Force) { return $null }

  # 2) Переменная PATH
  try {
    $cmd = Get-Command $exe -CommandType Application -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($cmd -and $cmd.Source) { return $cmd.Source }
  } catch {
  }

  # 3) Типовые каталоги менеджеров пакетов
  foreach ($dir in (Get-SystemDirs)) {
    if (-not $dir) { continue }
    $candidate = Join-Path $dir $exe
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
  }

  return $null
}

function Download-File {
  param($Url, $Destination, $Id)

  $request = [System.Net.WebRequest]::Create($Url)
  $request.UserAgent = 'LoliBox/1.0 (+https://github.com/yt-dlp/yt-dlp)'
  $request.Timeout = 60000
  $request.ReadWriteTimeout = 300000
  $response = $request.GetResponse()
  $total = [int64] $response.ContentLength
  $input = $response.GetResponseStream()
  $output = [System.IO.File]::Create($Destination)
  try {
    $buffer = New-Object byte[] 262144
    $received = 0
    $lastPercent = -1
    while (($read = $input.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $output.Write($buffer, 0, $read)
      $received += $read
      if ($total -gt 0) {
        $percent = [int]($received * 100 / $total)
        if ($percent -ne $lastPercent) {
          $lastPercent = $percent
          Write-State "$($Id).pct" "$percent"
        }
      }
    }
  } finally {
    $output.Close()
    $input.Close()
    $response.Close()
  }
}

function Expand-Archive-Entries {
  param($Archive, $Wants)

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($Archive)
  $found = @()
  try {
    foreach ($entry in $zip.Entries) {
      if ($entry.Name -eq '') { continue }
      foreach ($want in $Wants) {
        if ($entry.Name.ToLower() -eq $want.ToLower()) {
          $target = Join-Path $BinDir $entry.Name
          [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
          $found += $entry.Name
          break
        }
      }
    }
  } finally {
    $zip.Dispose()
  }
  return $found
}

function Install-Component {
  param($Component)

  $id = $Component.Id
  $lastError = ''

  foreach ($source in $Component.Sources) {
    $tmp = Join-Path $env:TEMP ("lolibox-{0}-{1}.tmp" -f $id, [guid]::NewGuid().ToString('N'))
    try {
      Write-State "$id.pct" "0"
      Download-File -Url $source -Destination $tmp -Id $id

      if (-not (Test-Path -LiteralPath $BinDir)) {
        New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
      }

      if ($Component.Zip) {
        Write-State "$id.pct" "95"
        $files = Expand-Archive-Entries -Archive $tmp -Wants $Component.Wants
        $primary = $Component.Wants[0]
        if (-not ($files | Where-Object { $_.ToLower() -eq $primary.ToLower() })) {
          throw ("archive has no file {0}" -f $primary)
        }
      } else {
        $target = Join-Path $BinDir $Component.Exe
        Copy-Item -LiteralPath $tmp -Destination $target -Force
      }

      Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
      Write-State "$id.pct" "100"
      Write-State "$id.result" "ok"
      Write-State "$id.msg" ("installed to {0}" -f $BinDir)
      return $true
    } catch {
      $lastError = $_.Exception.Message
      Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
  }

  Write-State "$id.result" "error"
  Write-State "$id.msg" $lastError
  return $false
}

# ---------------- Основной сценарий ----------------

try {
  if (-not (Test-Path -LiteralPath $StatusDir)) {
    New-Item -ItemType Directory -Path $StatusDir -Force | Out-Null
  }

  # убираем состояние от предыдущих запусков
  Clear-State 'started'
  Clear-State 'finished'
  foreach ($component in $Components) {
    Clear-State "$($component.Id).state"
    Clear-State "$($component.Id).path"
    Clear-State "$($component.Id).pct"
    Clear-State "$($component.Id).result"
    Clear-State "$($component.Id).msg"
  }

  # сигнал установщику: скрипт запустился и работает
  Write-State 'started' '1'

  foreach ($component in $Components) {
    $existing = Find-Component -Component $component
    if ($existing) {
      Write-State "$($component.Id).state" "found"
      Write-State "$($component.Id).path" $existing
    } else {
      Write-State "$($component.Id).state" "missing"
    }
  }

  if ($Mode -eq 'install') {
    foreach ($component in $Components) {
      $existing = Find-Component -Component $component
      if ($existing) {
        Write-State "$($component.Id).result" "ok"
        continue
      }
      Install-Component -Component $component | Out-Null
    }
  }
} catch {
  Write-State 'error' $_.Exception.Message
} finally {
  Write-State 'finished' "1"
}
