// Specs: vscode-explorer
import * as assert from 'assert';
import {
  appendStepToPlaylist,
  createFileNode,
  createFolderNode,
  createPlaylistNode,
  createPlaylistSectionNode,
  parsePlaylistStepPaths,
  updatePlaylistName,
} from '../../explorerProvider';
import { type RunResult, RunState, ok, err } from '../../types';
import {
  CONTEXT_FOLDER,
  CONTEXT_PLAYLIST,
  CONTEXT_PLAYLIST_SECTION,
  CONTEXT_REQUEST_FILE,
  CONTEXT_SCRIPT_FILE,
  NAP_NAME_KEY_PREFIX,
  NAP_NAME_KEY_SUFFIX,
  PLAYLIST_SECTION_LABEL,
  SECTION_STEPS,
} from '../../constants';

const FAKE_NAP_PATH = '/workspace/test.nap',
  FAKE_NAPLIST_PATH = '/workspace/smoke.naplist',
  FAKE_FOLDER_PATH = '/workspace/petstore',
  GET_CONTENT = '[request]\nmethod = GET\nurl = https://example.com\n',
  POST_CONTENT = '[request]\nmethod = POST\nurl = https://example.com\n',
  SHORTHAND_GET_CONTENT = 'GET https://example.com\n',
  SHORTHAND_DELETE_CONTENT = 'DELETE https://example.com/1\n',
  NO_METHOD_CONTENT = '[request]\nurl = https://example.com\n',
  makePassedResult = (file: string): RunResult => ({
    file,
    passed: true,
    statusCode: 200,
    duration: 42,
    assertions: [{ target: 'status', passed: true, expected: '200', actual: '200' }],
  }),
  makeFailedResult = (file: string): RunResult => ({
    file,
    passed: false,
    statusCode: 404,
    duration: 31,
    assertions: [{ target: 'status', passed: false, expected: '200', actual: '404' }],
  }),
  makeErrorResult = (file: string): RunResult => ({
    file,
    passed: false,
    error: 'Connection refused',
    assertions: [],
  });

suite('explorerProvider — createFileNode', () => {
  test('idle state when no results exist', () => {
    const emptyResults = new Map<string, RunResult>(),
      node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, emptyResults);

    assert.strictEqual(node.runState, RunState.Idle, 'should be Idle with no results');
    assert.strictEqual(node.isDirectory, false);
    assert.strictEqual(node.contextValue, CONTEXT_REQUEST_FILE);
  });

  test('passed state with green icon when result.passed is true', () => {
    const results = new Map<string, RunResult>();
    results.set(FAKE_NAP_PATH, makePassedResult(FAKE_NAP_PATH));
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, results);

    assert.strictEqual(
      node.runState,
      RunState.Passed,
      'should be Passed when result.passed is true',
    );
  });

  test('failed state with red icon when result.passed is false', () => {
    const results = new Map<string, RunResult>();
    results.set(FAKE_NAP_PATH, makeFailedResult(FAKE_NAP_PATH));
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, results);

    assert.strictEqual(
      node.runState,
      RunState.Failed,
      'should be Failed when result.passed is false',
    );
  });

  test('error state when result has error string', () => {
    const results = new Map<string, RunResult>();
    results.set(FAKE_NAP_PATH, makeErrorResult(FAKE_NAP_PATH));
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, results);

    assert.strictEqual(node.runState, RunState.Error, 'should be Error when result.error is set');
  });

  test('result for different file does not affect this node', () => {
    const otherPath = '/workspace/other.nap',
      results = new Map<string, RunResult>();
    results.set(otherPath, makePassedResult(otherPath));
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, results);

    assert.strictEqual(
      node.runState,
      RunState.Idle,
      'should be Idle when result is for different file',
    );
  });

  test('extracts GET method from key-value format', () => {
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, new Map());
    assert.strictEqual(node.httpMethod, 'GET');
  });

  test('extracts POST method from key-value format', () => {
    const node = createFileNode(FAKE_NAP_PATH, POST_CONTENT, new Map());
    assert.strictEqual(node.httpMethod, 'POST');
  });

  test('extracts GET method from shorthand format', () => {
    const node = createFileNode(FAKE_NAP_PATH, SHORTHAND_GET_CONTENT, new Map());
    assert.strictEqual(node.httpMethod, 'GET');
  });

  test('extracts DELETE method from shorthand format', () => {
    const node = createFileNode(FAKE_NAP_PATH, SHORTHAND_DELETE_CONTENT, new Map());
    assert.strictEqual(node.httpMethod, 'DELETE');
  });

  test('no method extracted when content has no method line', () => {
    const node = createFileNode(FAKE_NAP_PATH, NO_METHOD_CONTENT, new Map());
    assert.strictEqual(node.httpMethod, undefined);
  });

  test('naplist files get playlist context value', () => {
    const node = createFileNode(FAKE_NAPLIST_PATH, '[meta]\nname = smoke\n', new Map());
    assert.strictEqual(node.contextValue, CONTEXT_PLAYLIST);
  });

  test('naplist files do not extract http method', () => {
    const node = createFileNode(FAKE_NAPLIST_PATH, 'GET https://example.com\n', new Map());
    assert.strictEqual(node.httpMethod, undefined);
  });

  test('label is filename without extension', () => {
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, new Map());
    assert.strictEqual(node.label, 'test');
  });

  test('passed result stays passed even with multiple assertions', () => {
    const results = new Map<string, RunResult>();
    results.set(FAKE_NAP_PATH, {
      file: FAKE_NAP_PATH,
      passed: true,
      statusCode: 200,
      duration: 50,
      assertions: [
        { target: 'status', passed: true, expected: '200', actual: '200' },
        { target: 'body.id', passed: true, expected: 'exists', actual: '1' },
        { target: 'body.title', passed: true, expected: 'Test', actual: 'Test' },
      ],
    });
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, results);

    assert.strictEqual(node.runState, RunState.Passed);
  });

  test('failed result even when some assertions pass', () => {
    const results = new Map<string, RunResult>();
    results.set(FAKE_NAP_PATH, {
      file: FAKE_NAP_PATH,
      passed: false,
      statusCode: 200,
      duration: 50,
      assertions: [
        { target: 'status', passed: true, expected: '200', actual: '200' },
        { target: 'body.name', passed: false, expected: 'Alice', actual: 'Bob' },
      ],
    });
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, results);

    assert.strictEqual(node.runState, RunState.Failed, 'should be Failed when passed is false');
  });

  test('error takes priority over passed field', () => {
    const results = new Map<string, RunResult>();
    results.set(FAKE_NAP_PATH, {
      file: FAKE_NAP_PATH,
      passed: false,
      error: 'timeout',
      assertions: [],
    });
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, results);

    assert.strictEqual(
      node.runState,
      RunState.Error,
      'error field should produce Error state, not Failed',
    );
  });
});

suite('explorerProvider — createFolderNode', () => {
  test('folder node is always idle', () => {
    const child = createFileNode(FAKE_NAP_PATH, GET_CONTENT, new Map()),
      folder = createFolderNode(FAKE_FOLDER_PATH, [child]);

    assert.strictEqual(folder.runState, RunState.Idle);
    assert.strictEqual(folder.isDirectory, true);
    assert.strictEqual(folder.contextValue, CONTEXT_FOLDER);
  });

  test('folder label is directory basename', () => {
    const folder = createFolderNode(FAKE_FOLDER_PATH, []);
    assert.strictEqual(folder.label, 'petstore');
  });

  test('folder children are preserved', () => {
    const child1 = createFileNode(FAKE_NAP_PATH, GET_CONTENT, new Map()),
      child2 = createFileNode('/workspace/other.nap', POST_CONTENT, new Map()),
      folder = createFolderNode(FAKE_FOLDER_PATH, [child1, child2]);

    assert.strictEqual(folder.children?.length, 2);
  });
});

suite('explorerProvider — script file context', () => {
  test('.fsx file gets script context value', () => {
    const node = createFileNode('/workspace/echo.fsx', '', new Map());
    assert.strictEqual(node.contextValue, CONTEXT_SCRIPT_FILE);
    assert.strictEqual(node.httpMethod, undefined, 'script files must not extract HTTP method');
  });

  test('.csx file gets script context value', () => {
    const node = createFileNode('/workspace/setup.csx', '', new Map());
    assert.strictEqual(node.contextValue, CONTEXT_SCRIPT_FILE);
    assert.strictEqual(node.httpMethod, undefined, 'script files must not extract HTTP method');
  });
});

suite('explorerProvider — parsePlaylistStepPaths', () => {
  test('extracts step paths from [steps] section', () => {
    const content = `[meta]\nname = "smoke"\n\n${SECTION_STEPS}\nget-users.nap\nget-pet.nap\n`;
    const steps = parsePlaylistStepPaths(content);

    assert.strictEqual(steps.length, 2, 'must extract exactly 2 step paths');
    assert.strictEqual(steps[0], 'get-users.nap');
    assert.strictEqual(steps[1], 'get-pet.nap');
  });

  test('skips blank lines and comments in steps section', () => {
    const content = `${SECTION_STEPS}\nstep1.nap\n\n# a comment\nstep2.nap\n`;
    const steps = parsePlaylistStepPaths(content);

    assert.strictEqual(steps.length, 2, 'blank lines and comments must be skipped');
    assert.strictEqual(steps[0], 'step1.nap');
    assert.strictEqual(steps[1], 'step2.nap');
  });

  test('returns empty array when no [steps] section exists', () => {
    const content = '[meta]\nname = "test"\n';
    const steps = parsePlaylistStepPaths(content);

    assert.strictEqual(steps.length, 0, 'must return empty when no [steps] section');
  });

  test('stops collecting at next section header', () => {
    const content = `${SECTION_STEPS}\nstep1.nap\n[scripts]\nscript.fsx\n`;
    const steps = parsePlaylistStepPaths(content);

    assert.strictEqual(steps.length, 1, 'must stop at next section header');
    assert.strictEqual(steps[0], 'step1.nap');
  });

  test('trims whitespace from step paths', () => {
    const content = `${SECTION_STEPS}\n  step1.nap  \n`;
    const steps = parsePlaylistStepPaths(content);

    assert.strictEqual(steps[0], 'step1.nap', 'step paths must be trimmed');
  });
});

suite('explorerProvider — createPlaylistNode', () => {
  test('creates node with playlist context and children', () => {
    const child = createFileNode(FAKE_NAP_PATH, GET_CONTENT, new Map()),
      node = createPlaylistNode(FAKE_NAPLIST_PATH, new Map(), [child]);

    assert.strictEqual(node.label, 'smoke', 'label must be filename without extension');
    assert.strictEqual(node.filePath, FAKE_NAPLIST_PATH);
    assert.strictEqual(node.isDirectory, false);
    assert.strictEqual(node.contextValue, CONTEXT_PLAYLIST);
    assert.strictEqual(node.runState, RunState.Idle, 'idle when no results');
    assert.strictEqual(node.children?.length, 1, 'must include step children');
  });

  test('reflects run state from results', () => {
    const results = new Map<string, RunResult>();
    results.set(FAKE_NAPLIST_PATH, makePassedResult(FAKE_NAPLIST_PATH));
    const node = createPlaylistNode(FAKE_NAPLIST_PATH, results, []);

    assert.strictEqual(node.runState, RunState.Passed, 'must reflect passed state');
  });
});

suite('explorerProvider — createPlaylistSectionNode', () => {
  test('creates section node with correct label and context', () => {
    const child = createFileNode(FAKE_NAP_PATH, GET_CONTENT, new Map()),
      section = createPlaylistSectionNode([child]);

    assert.strictEqual(section.label, PLAYLIST_SECTION_LABEL);
    assert.strictEqual(section.filePath, '');
    assert.strictEqual(section.isDirectory, false);
    assert.strictEqual(section.contextValue, CONTEXT_PLAYLIST_SECTION);
    assert.strictEqual(section.runState, RunState.Idle, 'section node is always idle');
    assert.strictEqual(section.children?.length, 1, 'must include children');
  });

  test('works with empty children array', () => {
    const section = createPlaylistSectionNode([]);

    assert.strictEqual(section.children?.length, 0);
    assert.strictEqual(section.label, PLAYLIST_SECTION_LABEL);
  });
});

suite('explorerProvider — appendStepToPlaylist', () => {
  test('adds [steps] section when none exists', () => {
    const content = '[meta]\nname = "test"\n',
      result = appendStepToPlaylist(content, 'new-step.nap');

    assert.ok(result.includes(SECTION_STEPS), 'must add [steps] header');
    assert.ok(result.includes('new-step.nap'), 'must add the step path');
    assert.ok(
      result.indexOf(SECTION_STEPS) < result.indexOf('new-step.nap'),
      '[steps] must appear before the step path',
    );
  });

  test('appends to existing [steps] section', () => {
    const content = `[meta]\nname = "test"\n\n${SECTION_STEPS}\nexisting.nap\n`,
      result = appendStepToPlaylist(content, 'new-step.nap');

    assert.ok(result.includes('existing.nap'), 'must keep existing steps');
    assert.ok(result.includes('new-step.nap'), 'must add new step');
  });

  test('inserts before next section when [steps] is followed by another section', () => {
    const content = `${SECTION_STEPS}\nexisting.nap\n[scripts]\nscript.fsx\n`,
      result = appendStepToPlaylist(content, 'new-step.nap');

    assert.ok(result.includes('new-step.nap'), 'must add new step');
    const newStepIdx = result.indexOf('new-step.nap'),
      scriptsIdx = result.indexOf('[scripts]');
    assert.ok(newStepIdx < scriptsIdx, 'new step must be inserted before the [scripts] section');
  });
});

suite('explorerProvider — updatePlaylistName', () => {
  test('replaces existing name line', () => {
    const content = `[meta]\n${NAP_NAME_KEY_PREFIX}old-name${NAP_NAME_KEY_SUFFIX}\n\n${SECTION_STEPS}\nstep.nap\n`,
      result = updatePlaylistName(content, 'new-name');

    assert.ok(
      result.includes(`${NAP_NAME_KEY_PREFIX}new-name${NAP_NAME_KEY_SUFFIX}`),
      'must contain the new name',
    );
    assert.ok(!result.includes('old-name'), 'old name must be replaced');
    assert.ok(result.includes('step.nap'), 'non-name lines must be preserved');
  });

  test('preserves content when no name line exists', () => {
    const content = `${SECTION_STEPS}\nstep.nap\n`,
      result = updatePlaylistName(content, 'new-name');

    assert.strictEqual(result, content, 'content must be unchanged when no name line');
  });
});

suite('types — ok and err Result constructors', () => {
  test('ok wraps value with ok: true', () => {
    const result = ok(42);

    assert.strictEqual(result.ok, true, 'ok result must have ok: true');
    assert.strictEqual(result.value, 42, 'ok result must carry the value');
  });

  test('ok works with string value', () => {
    const result = ok('hello');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.value, 'hello');
  });

  test('err wraps error with ok: false', () => {
    const result = err('something failed');

    assert.strictEqual(result.ok, false, 'err result must have ok: false');
    assert.strictEqual(result.error, 'something failed', 'err result must carry the error');
  });

  test('ok and err produce discriminated union', () => {
    const success = ok('data'),
      failure = err('oops');

    assert.strictEqual(success.ok, true);
    assert.strictEqual(failure.ok, false);
    assert.notStrictEqual(success.ok, failure.ok, 'ok and err must be distinguishable');
  });
});
