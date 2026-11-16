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
$registryData = @{}
foreach ($version in $versions) {
  $registry = Get-Content (Join-Path $cache "blocks-$version.json") -Raw | ConvertFrom-Json
  $registries[$version] = [Collections.Generic.HashSet[string]]::new([string[]]$registry.name)
  $registryData[$version] = @{}
  foreach ($definition in $registry) { $registryData[$version][$definition.name] = $definition }
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
function Matches-State($condition, $properties) {
  if (!$condition) { return $true }
  foreach ($key in $condition.Keys) {
    if ($key -eq 'OR') { if (!@($condition[$key] | Where-Object { Matches-State $_ $properties }).Count) { return $false } }
    elseif ($key -eq 'AND') { foreach ($part in $condition[$key]) { if (!(Matches-State $part $properties)) { return $false } } }
    elseif ([string]$properties[$key] -notin ([string]$condition[$key]).Split('|')) { return $false }
  }
  return $true
}
function Add-Conditions($condition, $properties) {
  if (!$condition) { return }
  foreach ($key in $condition.Keys) {
    if ($key -in @('OR', 'AND')) { foreach ($part in $condition[$key]) { Add-Conditions $part $properties } }
    elseif (!$properties.Contains($key)) {
      $properties[$key] = if ($defaults.ContainsKey($key)) { $defaults[$key] } elseif ($key -eq 'up') { 'true' } elseif ($key -in @('north','south','east','west')) { 'none' } else { 'false' }
    }
  }
}
function Texture-Path($value, $model, $id, $tinted = $false) {
  $name = Resolve-Texture $value $model
  if (!$name) { return $null }
  $name = $name -replace '^minecraft:', ''
  $relative = if ($name -match '^(item|entity)/') { $name } else { "block/$name" }
  if (!$zip.GetEntry("assets/minecraft/textures/$relative.png")) { return $null }
  if ($tinted) {
    $color = if ($id -match 'spruce') { '619961' } elseif ($id -match 'birch') { '80a755' } elseif ($id -match 'redstone') { '800000' } elseif ($id -match 'stem') { '00cc00' } elseif ($id -match 'leaves|vine') { '77ab2f' } else { '7cbd6b' }
    return "/textures/tinted/$color/$relative.png"
  }
  return "/textures/$name.png"
}
try {
  $language = Read-Asset 'assets/minecraft/lang/en_us.json'
  $records = [Collections.Generic.List[object]]::new()
  $existing = @(Get-Content (Join-Path $root 'src/vanilla-blocks.json') -Raw | ConvertFrom-Json -AsHashtable)
  $preserved = @($existing | Where-Object { !$_.ContainsKey('versions') })
  $existingIds = [Collections.Generic.HashSet[string]]::new([string[]]$preserved.id)
  foreach ($record in $preserved) { $records.Add($record) }
  $aliases = @{ short_grass = 'grass'; dirt_path = 'grass_path'; iron_chain = 'chain'; oak_sign = 'sign'; oak_wall_sign = 'wall_sign' }
  $skulls = @{ skeleton = 0; wither_skeleton = 1; zombie = 2; player = 3; creeper = 4; dragon = 5 }
  $defaults = @{ facing = 'north'; axis = 'y'; half = 'bottom'; shape = 'straight'; type = 'single'; part = 'foot'; lit = 'false'; waterlogged = 'false'; powered = 'false'; snowy = 'false'; open = 'false'; triggered = 'false'; stage = '0'; age = '0'; rotation = '0'; layers = '1'; level = '0'; persistent = 'true'; distance = '7' }
  foreach ($entry in ($zip.Entries | Where-Object FullName -match '^assets/minecraft/blockstates/[^/]+\.json$' | Sort-Object Name)) {
    $id = [IO.Path]::GetFileNameWithoutExtension($entry.Name)
    if ($existingIds.Contains($id) -or $id -in @('air','cave_air','void_air','moving_piston','piston_head')) { continue }
    $state = Read-Asset $entry.FullName
    $properties = [ordered]@{}
    $choices = @()
    if ($state.variants) {
      $variant = $state.variants.GetEnumerator() | Sort-Object @{ Expression = {
      $score = 0
      $p = Properties $_.Key
      foreach ($key in $p.Keys) { if ($defaults.ContainsKey($key) -and $p[$key] -eq $defaults[$key]) { $score++ } }
      -$score
    } }, Key | Select-Object -First 1
      $properties = Properties $variant.Key
      $choices = @(@($variant.Value)[0])
    } elseif ($state.multipart) {
      foreach ($part in $state.multipart) { Add-Conditions $part.when $properties }
      foreach ($part in $state.multipart) { if (Matches-State $part.when $properties) { $choices += @($part.apply)[0] } }
    }
    $latest = $registryData['26.1'][$id]
    if (!$latest -and $aliases[$id]) { $latest = $registryData['26.1'][$aliases[$id]] }
    foreach ($property in $latest.states) {
      $values = if ($property.type -eq 'bool') { @('true','false') } elseif ($property.values) { @($property.values | ForEach-Object { [string]$_ }) } else { @(0..($property.num_values - 1) | ForEach-Object { [string]$_ }) }
      if ($properties[$property.name] -notin $values) {
        $properties[$property.name] = if ($defaults[$property.name] -in $values) { $defaults[$property.name] } elseif ('false' -in $values) { 'false' } else { $values[0] }
      }
    }
    if ($state.multipart) {
      $choices = @()
      foreach ($part in $state.multipart) { if (Matches-State $part.when $properties) { $choices += @($part.apply)[0] } }
    }
    $modelsForBlock = @(); $texture = $null
    foreach ($choice in $choices) {
      $model = Read-Model $choice.model
      if (!$model) { continue }
      $elements = @()
      foreach ($element in $model.elements) {
        $faces = [ordered]@{}
        foreach ($side in @('east','west','up','down','south','north')) {
          $face = $element.faces[$side]
          if (!$face) { continue }
          $path = Texture-Path $face.texture $model $id ($face.ContainsKey('tintindex'))
          if (!$path) { continue }
          $faces[$side] = @{ texture = $path }
          if ($face.uv) { $faces[$side].uv = $face.uv }
          if ($face.rotation) { $faces[$side].rotation = $face.rotation }
          if (!$texture -or $side -eq 'up') { $texture = $path }
        }
        if ($faces.Count) {
          $part = @{ from = $element.from; to = $element.to; faces = $faces }
          if ($element.rotation) { $part.rotation = $element.rotation }
          $elements += $part
        }
      }
      if ($elements.Count) { $modelsForBlock += @{ x = [int]$choice.x; y = [int]$choice.y; elements = $elements } }
      if (!$texture) { $texture = Texture-Path $model.textures.particle $model $id }
    }
    if (!$texture) {
      $item = Read-Model "item/$id"
      $texture = Texture-Path $item.textures.layer0 $item $id
    }
    if (!$texture) {
      $fallback = if ($id -eq 'water') { 'water_still' } elseif ($id -eq 'lava') { 'lava_still' } elseif ($id -match 'portal') { 'obsidian' } else { 'barrier' }
      $texture = if ($fallback -eq 'barrier') { '/textures/item/barrier.png' } else { "/textures/$fallback.png" }
    }
    $shape = 'model'
    $legacyPair = $null; $legacyScore = -1
    $skullType = $null
    if ($id -match '^(.+?)(_wall)?_(head|skull)$' -and $skulls.ContainsKey($Matches[1])) { $skullType = $skulls[$Matches[1]] }
    foreach ($pair in $legacy.GetEnumerator()) {
      # The mapping uses 1.13's stone_slab name; it became smooth_stone_slab in 1.14.
      $oldName = ($pair.Value -split '\[')[0] -replace '^minecraft:stone_slab$', 'minecraft:smooth_stone_slab'
      if ($aliases[$id] -and $oldName -eq "minecraft:$($aliases[$id])") { $oldName = "minecraft:$id" }
      if ($id -match '_bed$' -and $oldName -eq 'minecraft:red_bed') { $oldName = "minecraft:$id" }
      if ($id -match '_banner$' -and $oldName -eq 'minecraft:white_banner' -and $id -notmatch '_wall_banner$') { $oldName = "minecraft:$id" }
      if ($id -match '_wall_banner$' -and $oldName -eq 'minecraft:white_wall_banner') { $oldName = "minecraft:$id" }
      if ($null -ne $skullType) {
        $base = if ($id -match '_wall_') { 'minecraft:skeleton_wall_skull' } else { 'minecraft:skeleton_skull' }
        if ($oldName -eq $base) { $oldName = "minecraft:$id" }
      }
      if ($oldName -ne "minecraft:$id") { continue }
      $oldProperties = Properties $pair.Value
      $score = 0
      foreach ($key in $oldProperties.Keys) {
        if ($id -match '_leaves$' -and $key -eq 'distance') { continue }
        if ($id -match '_wall$' -and $key -eq 'up') { continue }
        if ($id -match '_door$' -and $key -in @('hinge','powered')) { continue }
        # Legacy stairs derive corner shape from neighbors, not metadata.
        if ($shape -eq 'stairs' -and $key -eq 'shape') { continue }
        $value = $properties[$key]
        if ($oldProperties[$key] -eq 'false' -and $value -eq 'none') { $value = 'false' }
        if ($properties.Contains($key) -and $value -eq $oldProperties[$key]) { $score += $(if ($key -in @('facing','half','part','axis','type')) { 4 } else { 1 }) }
      }
      if ($score -gt $legacyScore) { $legacyScore = $score; $legacyPair = @($pair.Key.Split(':') | ForEach-Object { [int]$_ }) }
    }
    $available = @($registries.Keys | Where-Object { $registries[$_].Contains($id) -or ($aliases[$id] -and $registries[$_].Contains($aliases[$id])) })
    $since = if ($legacyPair) { '1.12.2' } else { $available[0] }
    # Registry entries behind experimental feature flags are not generally available.
    if ($id -ne 'bamboo_sapling' -and $id -match '^(cherry_|bamboo_|stripped_bamboo|stripped_cherry)') { $since = '1.20.1' }
    if ($id -match '^(polished_tuff|tuff_(bricks|brick|stairs|slab)|chiseled_tuff)' -or $id -match 'copper_(bulb|grate)' -or $id -match 'chiseled_copper') { $since = '1.21' }
    if ($id -eq 'stone_slab') { $since = '1.14.4' }
    if (!$since) { throw "Unknown introduction version: $id" }
    if ($id -match '^(pale_oak|resin|creaking_heart)') { $since = '1.21.4' }
    if ($id -match 'copper_(door|trapdoor)') { $since = '1.21' }
    if ($id -match '^(pink_petals|torchflower|pitcher_|chiseled_bookshelf|decorated_pot|suspicious_|sniffer_egg)' -or $id -match '_hanging_sign$') { $since = '1.20.1' }
    if ($id -match '^piglin_.*head$') { $since = '1.20.1' }
    $record = [ordered]@{ id = $id; name = $language["block.minecraft.$id"]; since = $since; shape = $shape; texture = $texture }
    if (!$record.name) { $record.name = (Get-Culture).TextInfo.ToTitleCase($id.Replace('_',' ')) }
    if ($properties.Count) { $record.properties = $properties }
    if ($legacyPair) { $record.legacy = $legacyPair }
    if ($legacyPair -and $null -ne $skullType) { $record.legacyEntity = @{ id = 'minecraft:skull'; SkullType = $skullType; Rot = 0 } }
    if ($legacyPair -and $id -match '^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_(bed|banner|wall_banner)$') {
      $dyes = @('white','orange','magenta','light_blue','yellow','lime','pink','gray','light_gray','cyan','purple','blue','brown','green','red','black')
      $color = [array]::IndexOf($dyes, $Matches[1])
      $record.legacyEntity = if ($Matches[2] -eq 'bed') { @{ id = 'minecraft:bed'; color = $color } } else { @{ id = 'minecraft:banner'; Base = 15 - $color } }
    }
    if ($aliases[$id]) { $record.aliases = @($aliases[$id]) }
    if ($modelsForBlock.Count) { $record.models = $modelsForBlock } else { $record.shape = 'cube'; $record.approximate = $true }
    $record.versions = @($(if ($legacyPair) { '1.12.2' }); $available)
    $exports = [ordered]@{}
    foreach ($version in $versions) {
      $name = if ($registryData[$version].ContainsKey($id)) { $id } else { $aliases[$id] }
      if (!$name -or !$registryData[$version].ContainsKey($name)) { continue }
      $mapped = [ordered]@{}
      foreach ($p in $registryData[$version][$name].states) {
        $values = if ($p.type -eq 'bool') { @('true','false') } elseif ($p.values) { @($p.values | ForEach-Object { [string]$_ }) } else { @(0..($p.num_values - 1) | ForEach-Object { [string]$_ }) }
        $value = [string]$properties[$p.name]
        $mapped[$p.name] = if ($value -in $values) { $value } elseif ($defaults[$p.name] -in $values) { $defaults[$p.name] } elseif ('false' -in $values) { 'false' } else { $values[0] }
      }
      $changed = $mapped.Count -ne $properties.Count -or @($mapped.Keys | Where-Object { $mapped[$_] -ne $properties[$_] }).Count -gt 0
      if ($name -ne $id -or $changed) { $exports[$version] = @{ id = $name; properties = $mapped } }
    }
    if ($exports.Count) { $record.exports = $exports }
    $records.Add($record)
  }
  # Generated data is checked in; this script is not needed at runtime.
  $byId = @{}; foreach ($record in $records) { $byId[$record.id] = $record }
  $ordered = @($existing | ForEach-Object { if ($byId.ContainsKey($_.id)) { $byId[$_.id]; $byId.Remove($_.id) } })
  $ordered += @($byId.Values | Sort-Object id)
  $ordered | ConvertTo-Json -Depth 30 | Set-Content (Join-Path $root 'src/vanilla-blocks.json') -Encoding utf8NoBOM
  Write-Output "Generated $($records.Count) floor block definitions from Minecraft 26.3."
} finally { $zip.Dispose() }
