import fs from 'node:fs/promises';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: audit-sbom.mjs input.cdx.json output.json');
const sbom = JSON.parse(await fs.readFile(input, 'utf8'));
if (sbom.bomFormat !== 'CycloneDX' || !Array.isArray(sbom.components) || sbom.components.length > 200) throw new Error('invalid-sbom');
const findings = [];
let checked = 0;
for (const component of sbom.components) {
  if (component.name === 'ultron-qwen-headless') continue; // Local fork is reviewed separately, not falsely marked clean.
  // CUDA wheels are local builds of the same public Torch source version.
  // Keep the exact installed version in evidence, query the public base version.
  const queriedVersion = ['torch', 'torchaudio'].includes(component.name)
    ? component.version.split('+')[0] : component.version;
  const response = await fetch('https://api.osv.dev/v1/query', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ package: { name: component.name, ecosystem: 'PyPI' }, version: queriedVersion }),
  });
  if (!response.ok) throw new Error(`osv-http-${response.status}`);
  const data = await response.json();
  checked++;
  for (const item of data.vulns || []) findings.push({ component: component.name, version: component.version, queriedVersion,
    id: item.id, aliases: item.aliases || [], summary: item.summary,
    severity: item.database_specific?.severity || 'UNKNOWN', severityVectors: item.severity || [],
    references: item.references || [] });
  console.log(JSON.stringify({ checked, total: sbom.components.length - 1, findings: findings.length }));
}
await fs.writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), source: 'OSV', checkedComponents: checked,
  localForkReviewedSeparately: true, completeness: 'installed-Python-packages-only; no native-binary or OS advisory scan', findings }, null, 2), { flag: 'wx' });
