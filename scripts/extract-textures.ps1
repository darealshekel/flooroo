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
$names = $catalog | ForEach-Object { @($_.texture) + @($_.faces) } | Where-Object { $_ } | ForEach-Object { [IO.Path]::GetFileNameWithoutExtension($_) } | Sort-Object -Unique
$archive = [System.IO.Compression.ZipFile]::OpenRead($JarPath)
try {
  foreach ($block in $catalog) {
    if (!$archive.GetEntry("assets/minecraft/blockstates/$($block.id).json")) { throw "Missing block state: $($block.id)" }
  }
  foreach ($name in $names) {
    $entry = $archive.GetEntry("assets/minecraft/textures/block/$name.png")
    if (!$entry) { throw "Missing texture: $name" }
    $target = Join-Path $destination "$name.png"
    if (!(Test-Path -LiteralPath $target)) { [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false) }
  }
} finally { $archive.Dispose() }
$colors = [ordered]@{}
foreach ($block in $catalog) {
  $bitmap = [Drawing.Bitmap]::new((Join-Path $destination ([IO.Path]::GetFileName($block.texture))))
  try {
    $r = 0; $g = 0; $b = 0; $count = 0
    for ($y = 0; $y -lt $bitmap.Width; $y++) { for ($x = 0; $x -lt $bitmap.Width; $x++) {
      $pixel = $bitmap.GetPixel($x, $y)
      if ($pixel.A -gt 0) { $r += $pixel.R; $g += $pixel.G; $b += $pixel.B; $count++ }
    } }
    $colors[$block.id] = '#{0:x2}{1:x2}{2:x2}' -f [int]($r / $count), [int]($g / $count), [int]($b / $count)
  } finally { $bitmap.Dispose() }
}
$colors | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot '../src/texture-colors.json') -Encoding utf8NoBOM
Write-Output "Extracted $($names.Count) vanilla block textures for local preview."
