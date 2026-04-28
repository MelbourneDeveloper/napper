// Verifies deployment-toolkit.json has resolved versions — not unresolved templates.
// Implements [DTK-NAPPER-MANIFEST], [DTK-NAPPER-VERSION-CONTRACT]
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const _MANIFEST_PATH = path.join(__dirname, '../../../deployment-toolkit.json');
const _PKG_PATH = path.join(__dirname, '../../../package.json');

interface Manifest {
  product: { version: string };
  components: Array<{ expectedVersion: string }>;
}

const _TEMPLATE_RE = /\$\{[^}]+\}/;

suite('deployment-toolkit.json', () => {
  test('product.version is a resolved semver, not an unresolved template placeholder', () => {
    const manifest = JSON.parse(fs.readFileSync(_MANIFEST_PATH, 'utf8')) as Manifest;
    assert.doesNotMatch(
      manifest.product.version,
      _TEMPLATE_RE,
      `product.version must not contain template placeholders, got: ${manifest.product.version}`,
    );
  });

  test('product.version matches package.json version', () => {
    const manifest = JSON.parse(fs.readFileSync(_MANIFEST_PATH, 'utf8')) as Manifest;
    const pkg = JSON.parse(fs.readFileSync(_PKG_PATH, 'utf8')) as { version: string };
    assert.strictEqual(manifest.product.version, pkg.version);
  });

  test('expectedVersion is a resolved semver, not an unresolved template placeholder', () => {
    const manifest = JSON.parse(fs.readFileSync(_MANIFEST_PATH, 'utf8')) as Manifest;
    for (const component of manifest.components) {
      assert.doesNotMatch(
        component.expectedVersion,
        _TEMPLATE_RE,
        `component expectedVersion must not contain template placeholders, got: ${component.expectedVersion}`,
      );
    }
  });

  test('expectedVersion matches product.version', () => {
    const manifest = JSON.parse(fs.readFileSync(_MANIFEST_PATH, 'utf8')) as Manifest;
    for (const component of manifest.components) {
      assert.strictEqual(
        component.expectedVersion,
        manifest.product.version,
        `component expectedVersion (${component.expectedVersion}) must match product.version (${manifest.product.version})`,
      );
    }
  });
});
