// Verifies TrimmerRoots.xml protects all LSP/serialization assemblies from PublishTrimmed stripping.
// Each assembly here instantiates types via Newtonsoft.Json reflection at runtime.
// A missing entry → trimmer removes constructors → crash on LSP initialize.
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const _TRIMMER_ROOTS_PATH = path.join(
  __dirname,
  '../../../../Napper.Cli/TrimmerRoots.xml',
);

const _REQUIRED_ASSEMBLIES = [
  'StreamJsonRpc',
  'Ionide.LanguageServerProtocol',
  'Newtonsoft.Json',
];

suite('TrimmerRoots.xml', () => {
  test('file exists', () => {
    assert.ok(
      fs.existsSync(_TRIMMER_ROOTS_PATH),
      `TrimmerRoots.xml not found at ${_TRIMMER_ROOTS_PATH}`,
    );
  });

  test('all LSP serialization assemblies are preserved with preserve="all"', () => {
    const xml = fs.readFileSync(_TRIMMER_ROOTS_PATH, 'utf8');
    const missing = _REQUIRED_ASSEMBLIES.filter(
      (asm) => !xml.includes(`fullname="${asm}"`) || !xml.includes('preserve="all"'),
    );
    assert.deepStrictEqual(
      missing,
      [],
      `TrimmerRoots.xml is missing preserve="all" entries for: ${missing.join(', ')}`,
    );
  });
});
