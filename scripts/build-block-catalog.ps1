param(
  [string]$JarPath = "$PSScriptRoot/../.cache/minecraft-26.3.jar",
  [string]$MinecraftDirectory = "$env:APPDATA/PrismLauncher/libraries/com/mojang/minecraft",
  [switch]$DownloadMappings
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Split-Path $PSScriptRoot
$cache = Join-Path $root '.cache'
$source = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data'
$versions = @('1.13.2', '1.14.4', '1.15.2', '1.16.5', '1.17.1', '1.18.2', '1.19.4', '1.20.1', '1.20.4', '1.20.6', '1.21', '1.21.4', '1.21.5', '1.21.8', '1.21.11', '26.1')
if ($DownloadMappings) {
  $paths = Invoke-RestMethod "$source/dataPaths.json"
  Invoke-WebRequest "$source/pc/common/legacy.json" -OutFile (Join-Path $cache 'legacy-blocks.json')
  foreach ($version in $versions) {
    $path = $paths.pc.$version.blocks
    if (!$path) { throw "No block registry for $version" }
    Invoke-WebRequest "$source/$path/blocks.json" -OutFile (Join-Path $cache "blocks-$version.json")
  }
}
$legacy = (Get-Content (Join-Path $cache 'legacy-blocks.json') -Raw | ConvertFrom-Json -AsHashtable).blocks
$registries = [ordered]@{}
foreach ($version in $versions) {
  $registry = Get-Content (Join-Path $cache "blocks-$version.json") -Raw | ConvertFrom-Json
  $registries[$version] = [Collections.Generic.HashSet[string]]::new([string[]]$registry.name)
}
foreach ($version in @('26.2', '26.3')) {
  $archive = [IO.Compression.ZipFile]::OpenRead((Join-Path $MinecraftDirectory "$version/minecraft-$version-client.jar"))
  try {
    $registries[$version] = [Collections.Generic.HashSet[string]]::new([string[]]@($archive.Entries | Where-Object FullName -match '^assets/minecraft/blockstates/[^/]+\.json$' | ForEach-Object { [IO.Path]::GetFileNameWithoutExtension($_.Name) }))
  } finally { $archive.Dispose() }
}
$zip = [IO.Compression.ZipFile]::OpenRead($JarPath)
$models = @{}
function Read-Asset($path) {
  $entry = $zip.GetEntry($path)
  if (!$entry) { return $null }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { return $reader.ReadToEnd() | ConvertFrom-Json -AsHashtable } finally { $reader.Dispose() }
}
function Read-Model($name) {
  $name = $name -replace '^minecraft:', ''
  if ($models.ContainsKey($name)) { return $models[$name] }
  $raw = Read-Asset "assets/minecraft/models/$name.json"
  if (!$raw) { return $null }
  $parent = if ($raw.parent) { Read-Model $raw.parent } else { $null }
  $textures = @{}
  if ($parent) { foreach ($key in $parent.textures.Keys) { $textures[$key] = $parent.textures[$key] } }
  if ($raw.textures) { foreach ($key in $raw.textures.Keys) { $textures[$key] = $raw.textures[$key] } }
  $model = @{ textures = $textures; elements = $(if ($raw.ContainsKey('elements')) { $raw.elements } else { $parent.elements }) }
  $models[$name] = $model
  return $model
}
function Resolve-Texture($texture, $model) {
  if ($texture -is [System.Collections.IDictionary]) { $texture = $texture.sprite }
  if ($texture -isnot [string]) { return $null }
  for ($i = 0; $i -lt 16 -and $texture -and $texture.StartsWith('#'); $i++) {
    $texture = $model.textures[$texture.Substring(1)]
    if ($texture -is [System.Collections.IDictionary]) { $texture = $texture.sprite }
    if ($texture -isnot [string]) { return $null }
  }
  if (!$texture -or $texture.StartsWith('#')) { return $null }
  return $texture -replace '^minecraft:block/', '' -replace '^block/', ''
}
function Properties($state) {
  $result = [ordered]@{}
  if ($state -match '\[(.*)\]') { $state = $Matches[1] }
  foreach ($part in $state.Split(',')) { if ($part -match '^([^=]+)=(.+)$') { $result[$Matches[1]] = $Matches[2] } }
  return $result
}
try {
  $language = Read-Asset 'assets/minecraft/lang/en_us.json'
  $records = [Collections.Generic.List[object]]::new()
  $defaults = @{ facing = 'north'; axis = 'y'; half = 'bottom'; shape = 'straight'; type = 'bottom'; lit = 'false'; waterlogged = 'false'; powered = 'false'; snowy = 'false'; open = 'false'; triggered = 'false'; stage = '0'; age = '0' }
  foreach ($entry in ($zip.Entries | Where-Object FullName -match '^assets/minecraft/blockstates/[^/]+\.json$' | Sort-Object Name)) {
    $id = [IO.Path]::GetFileNameWithoutExtension($entry.Name)
    if ($id -match '^(barrier|bedrock|command_block|chain_command_block|repeating_command_block|structure_block|jigsaw|spawner|trial_spawner|vault|test_block|test_instance_block|infested_.*|frosted_ice|petrified_oak_slab|.*_coral_block)$') { continue }
    $state = Read-Asset $entry.FullName
    if (!$state.variants) { continue }
    $variant = $state.variants.GetEnumerator() | Sort-Object @{ Expression = {
      $score = 0
      $p = Properties $_.Key
      foreach ($key in $p.Keys) { if ($defaults.ContainsKey($key) -and $p[$key] -eq $defaults[$key]) { $score++ } }
      -$score
    } }, Key | Select-Object -First 1
    $choice = @($variant.Value)[0]
    $model = Read-Model $choice.model
    if (!$model -or !$model.elements) { continue }
    $shape = if ($id.EndsWith('_slab')) { 'slab' } elseif ($id.EndsWith('_stairs')) { 'stairs' } else { 'cube' }
    $element = @($model.elements)[0]
    if ($shape -eq 'cube' -and (@($model.elements).Count -ne 1 -or ($element.from -join ',') -ne '0,0,0' -or ($element.to -join ',') -ne '16,16,16' -or $element.rotation -or $element.faces.Count -ne 6)) { continue }
    # Tinted leaves/grass need biome colors and are not represented by raw texture pixels.
    if (@($model.elements | ForEach-Object { $_.faces.Values } | Where-Object { $_.ContainsKey('tintindex') }).Count) { continue }
    $faces = @{}
    foreach ($face in @('east', 'west', 'up', 'down', 'south', 'north')) { $faces[$face] = Resolve-Texture $element.faces[$face].texture $model }
    if (@($faces.Values | Where-Object { !$_ -or !$zip.GetEntry("assets/minecraft/textures/block/$_.png") }).Count) { continue }
    $properties = Properties $variant.Key
    if ($shape -in @('slab', 'stairs')) { $properties.waterlogged = 'false' }
    $legacyPair = $null
    foreach ($pair in $legacy.GetEnumerator()) {
      # The mapping uses 1.13's stone_slab name; it became smooth_stone_slab in 1.14.
      $oldName = ($pair.Value -split '\[')[0] -replace '^minecraft:stone_slab$', 'minecraft:smooth_stone_slab'
      if ($oldName -ne "minecraft:$id") { continue }
      $oldProperties = Properties $pair.Value
      $matches = $true
      foreach ($key in $oldProperties.Keys) {
        # Legacy stairs derive corner shape from neighbors, not metadata.
        if ($shape -eq 'stairs' -and $key -eq 'shape') { continue }
        if ($properties.Contains($key) -and $properties[$key] -ne $oldProperties[$key]) { $matches = $false; break }
      }
      if ($matches) { $legacyPair = @($pair.Key.Split(':') | ForEach-Object { [int]$_ }); break }
    }
    $since = if ($legacyPair) { '1.12.2' } else { @($registries.Keys | Where-Object { $registries[$_].Contains($id) })[0] }
    # Registry entries behind experimental feature flags are not generally available.
    if ($id -match '^(cherry_|bamboo_|stripped_bamboo)') { $since = '1.20.1' }
    if ($id -match '^(polished_tuff|tuff_(bricks|brick|stairs|slab)|chiseled_tuff)' -or $id -match 'copper_(bulb|grate)' -or $id -match 'chiseled_copper') { $since = '1.21' }
    if ($id -eq 'stone_slab') { $since = '1.14.4' }
    if (!$since) { throw "Unknown introduction version: $id" }
    $record = [ordered]@{ id = $id; name = $language["block.minecraft.$id"]; since = $since; shape = $shape; texture = "/textures/$($faces.up).png" }
    if (!$record.name) { continue }
    if ($properties.Count) { $record.properties = $properties }
    if ($legacyPair) { $record.legacy = $legacyPair }
    $record.faces = @($faces.east, $faces.west, $faces.up, $faces.down, $faces.south, $faces.north | ForEach-Object { "/textures/$_.png" })
    $records.Add($record)
  }
  # Generated data is checked in; this script is not needed at runtime.
  $records | ConvertTo-Json -Depth 12 | Set-Content (Join-Path $root 'src/vanilla-blocks.json') -Encoding utf8NoBOM
  Write-Output "Generated $($records.Count) floor block definitions from Minecraft 26.3."
} finally { $zip.Dispose() }
