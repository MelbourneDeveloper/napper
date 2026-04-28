// Verifies DEFAULT_CLI_PATH constant matches napper.cliPath default in package.json.
// Implements [VSCODE-CLI-ACQUIRE]: empty default forces Shipwright-resolved path to be used.
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_CLI_PATH } from '../../constants';

const _PKG_PATH = path.join(__dirname, '../../../package.json');

suite('CLI config', () => {
  test('DEFAULT_CLI_PATH matches napper.cliPath default in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(_PKG_PATH, 'utf8')) as {
      contributes: { configuration: { properties: { 'napper.cliPath': { default: string } } } };
    };
    const pkgDefault = pkg.contributes.configuration.properties['napper.cliPath'].default;
    assert.strictEqual(
      DEFAULT_CLI_PATH,
      pkgDefault,
      `DEFAULT_CLI_PATH ('${DEFAULT_CLI_PATH}') must match napper.cliPath default ('${pkgDefault}') — mismatch causes getCliPath() to return empty string instead of the Shipwright-resolved path`,
    );
  });
});
