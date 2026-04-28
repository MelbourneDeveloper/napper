// Verifies that ensureExecutable restores the +x bit stripped by ZIP/VSIX extraction.
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { bundledBinaryPath, ensureExecutable } from '../../binaryUtils';

suite('binaryUtils', () => {
  test('ensureExecutable sets +x on a file that lacks it', () => {
    if (process.platform === 'win32') return;
    const tmp = path.join(os.tmpdir(), `napper-test-${Date.now()}`);
    fs.writeFileSync(tmp, '#!/bin/sh\n', { mode: 0o644 });
    try {
      const before = fs.statSync(tmp).mode & 0o111;
      assert.strictEqual(before, 0, 'file should start without execute bit');
      ensureExecutable(tmp);
      const after = fs.statSync(tmp).mode & 0o111;
      assert.notStrictEqual(after, 0, 'file should have execute bit after ensureExecutable');
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  test('ensureExecutable does nothing when file does not exist', () => {
    assert.doesNotThrow(() => ensureExecutable('/nonexistent/path/napper'));
  });

  test('bundledBinaryPath returns path inside extensionPath/bin/<platform>/napper', () => {
    const result = bundledBinaryPath('/fake/ext');
    assert.ok(result.startsWith('/fake/ext/bin/'), `expected path under bin/, got: ${result}`);
    assert.ok(result.endsWith('/napper'), `expected path ending in /napper, got: ${result}`);
    assert.ok(result.includes(process.platform), `expected platform in path, got: ${result}`);
  });
});
