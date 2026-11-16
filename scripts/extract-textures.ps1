param(
  [string]$JarPath = "$PSScriptRoot/../.cache/minecraft-26.3.jar"
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Drawing
$destination = Join-Path $PSScriptRoot '../public/textures'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$catalog = & node --input-type=module -e "import {BLOCKS} from './src/catalog.js'; process.stdout.write(JSON.stringify(BLOCKS));" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Run this script from the Floor Studio directory.' }
$names = $catalog | ForEach-Object { @($_.texture) + @($_.faces) + @($_.models | ForEach-Object { $_.elements | ForEach-Object { $_.faces.psobject.Properties.Value.texture } }) } | Where-Object { $_ } | ForEach-Object { $_ -replace '^/textures/', '' } | Sort-Object -Unique
$archive = [System.IO.Compression.ZipFile]::OpenRead($JarPath)
try {
  foreach ($block in $catalog) {
    if (!$archive.GetEntry("assets/minecraft/blockstates/$($block.id).json")) { throw "Missing block state: $($block.id)" }
  }
  foreach ($name in $names) {
    $source = $name; $tint = $null
    if ($source -match '^tinted/([a-f0-9]{6})/(.+)$') { $tint = $Matches[1]; $source = $Matches[2] }
    if ($source -notmatch '^(block|item|entity)/') { $source = "block/$source" }
    $entry = $archive.GetEntry("assets/minecraft/textures/$source")
    if (!$entry) { throw "Missing texture: $name" }
    $target = Join-Path $destination $name
    New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
    if (!(Test-Path -LiteralPath $target)) {
      if (!$tint) { [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false) }
      else {
        $stream = $entry.Open(); $original = [Drawing.Bitmap]::new($stream)
        $bitmap = [Drawing.Bitmap]::new($original.Width, $original.Height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        try { $graphics.DrawImageUnscaled($original,0,0) } finally { $graphics.Dispose(); $original.Dispose() }
        try {
          $red = [Convert]::ToInt32($tint.Substring(0,2),16); $green = [Convert]::ToInt32($tint.Substring(2,2),16); $blue = [Convert]::ToInt32($tint.Substring(4,2),16)
          for ($y=0; $y -lt $bitmap.Height; $y++) { for ($x=0; $x -lt $bitmap.Width; $x++) {
            $p=$bitmap.GetPixel($x,$y)
            $bitmap.SetPixel($x,$y,[Drawing.Color]::FromArgb($p.A,[int]($p.R*$red/255),[int]($p.G*$green/255),[int]($p.B*$blue/255)))
          } }
          $bitmap.Save($target,[Drawing.Imaging.ImageFormat]::Png)
        } finally { $bitmap.Dispose(); $stream.Dispose() }
      }
    }
  }
} finally { $archive.Dispose() }
$colors = [ordered]@{}
foreach ($block in $catalog) {
  $bitmap = [Drawing.Bitmap]::new((Join-Path $destination ($block.texture -replace '^/textures/', '')))
  try {
    $r = 0; $g = 0; $b = 0; $count = 0
    for ($y = 0; $y -lt [Math]::Min($bitmap.Width,$bitmap.Height); $y++) { for ($x = 0; $x -lt $bitmap.Width; $x++) {
      $pixel = $bitmap.GetPixel($x, $y)
      if ($pixel.A -gt 0) { $r += $pixel.R; $g += $pixel.G; $b += $pixel.B; $count++ }
    } }
    $colors[$block.id] = if ($count) { '#{0:x2}{1:x2}{2:x2}' -f [int]($r / $count), [int]($g / $count), [int]($b / $count) } else { '#888888' }
  } finally { $bitmap.Dispose() }
}
$colors | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot '../src/texture-colors.json') -Encoding utf8NoBOM
Write-Output "Extracted $($names.Count) vanilla block textures for local preview."
