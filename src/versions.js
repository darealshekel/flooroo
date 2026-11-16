// Java world data versions, not protocol or resource-pack versions.
// Sources: Mojang client version.json and PrismarineJS protocolVersions.json.
export const VERSIONS = [
  ['1.12.2', 1343], ['1.13.2', 1631], ['1.14.4', 1976], ['1.15.2', 2230],
  ['1.16.5', 2586], ['1.17.1', 2730], ['1.18.2', 2975], ['1.19.4', 3337],
  ['1.20.1', 3465], ['1.20.4', 3700], ['1.20.6', 3839], ['1.21', 3953],
  ['1.21.4', 4189], ['1.21.5', 4325], ['1.21.8', 4440], ['1.21.11', 4671],
  ['26.1', 4786], ['26.2', 4903], ['26.3', 5023],
].map(([id, dataVersion]) => ({ id, dataVersion, legacy: id === '1.12.2' }));
export const getVersion = id => VERSIONS.find(v => v.id === id) || VERSIONS.find(v => v.id === '1.21');
export function atLeast(version, minimum) {
  const a = version.split('.').map(Number), b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return true;
}
