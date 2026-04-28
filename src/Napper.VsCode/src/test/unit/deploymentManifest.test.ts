// Verifies deployment-toolkit.json has a resolved product version — not an unresolved template.
// Implements [DTK-NAPPER-MANIFEST]
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const _MANIFEST_PATH = path.join(__dirname, '../../../deployment-toolkit.json');
const _PKG_PATH = path.join(__dirname, '../../../package.json');

suite('deployment-toolkit.json', () => {
  test('product.version is a resolved semver, not an unresolved template placeholder', () => {
    const manifest = JSON.parse(fs.readFileSync(_MANIFEST_PATH, 'utf8')) as {
      product: { version: string };
    };
    assert.doesNotMatch(
      manifest.product.version,
      /\$\{[^}]+\}/,
      `product.version must not contain template placeholders, got: ${manifest.product.version}`,
    );
  });

  test('product.version matches package.json version', () => {
    const manifest = JSON.parse(fs.readFileSync(_MANIFEST_PATH, 'utf8')) as {
      product: { version: string };
    };
    const pkg = JSON.parse(fs.readFileSync(_PKG_PATH, 'utf8')) as { version: string };
    assert.strictEqual(manifest.product.version, pkg.version);
  });
});
