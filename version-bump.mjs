import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const targetVersion = process.env.npm_package_version;

if (!targetVersion) {
	throw new Error('npm_package_version is missing — run this through `npm version`.');
}

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync('manifest.json', `${JSON.stringify(manifest, null, '\t')}\n`);

const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
versions[targetVersion] = minAppVersion;
writeFileSync('versions.json', `${JSON.stringify(versions, null, '\t')}\n`);

console.log(`Bumped to ${targetVersion} (minAppVersion ${minAppVersion}).`);
