import * as assert from "assert";
import { createFileNode, createFolderNode } from "../../explorerProvider";
import { RunState, type RunResult } from "../../types";
import {
  CONTEXT_REQUEST_FILE,
  CONTEXT_PLAYLIST,
  CONTEXT_FOLDER,
} from "../../constants";

const FAKE_NAP_PATH = "/workspace/test.nap";
const FAKE_NAPLIST_PATH = "/workspace/smoke.naplist";
const FAKE_FOLDER_PATH = "/workspace/petstore";

const GET_CONTENT = "[request]\nmethod = GET\nurl = https://example.com\n";
const POST_CONTENT = "[request]\nmethod = POST\nurl = https://example.com\n";
const SHORTHAND_GET_CONTENT = "GET https://example.com\n";
const SHORTHAND_DELETE_CONTENT = "DELETE https://example.com/1\n";
const NO_METHOD_CONTENT = "[request]\nurl = https://example.com\n";

const makePassedResult = (file: string): RunResult => ({
  file,
  passed: true,
  statusCode: 200,
  duration: 42,
  assertions: [{ target: "status", passed: true, expected: "200", actual: "200" }],
});

const makeFailedResult = (file: string): RunResult => ({
  file,
  passed: false,
  statusCode: 404,
  duration: 31,
  assertions: [{ target: "status", passed: false, expected: "200", actual: "404" }],
});

const makeErrorResult = (file: string): RunResult => ({
  file,
  passed: false,
  error: "Connection refused",
  assertions: [],
});

suite("explorerProvider — createFileNode", () => {
  test("idle state when no results exist", () => {
    const emptyResults = new Map<string, RunResult>();
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, emptyResults);

    assert.strictEqual(node.runState, RunState.Idle, "should be Idle with no results");
    assert.strictEqual(node.isDirectory, false);
    assert.strictEqual(node.contextValue, CONTEXT_REQUEST_FILE);
  });

  test("passed state with green icon when result.passed is true", () => {
    const results = new Map<string, RunResult>();
    results.set(FAKE_NAP_PATH, makePassedResult(FAKE_NAP_PATH));
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, results);

    assert.strictEqual(node.runState, RunState.Passed, "should be Passed when result.passed is true");
  });

  test("failed state with red icon when result.passed is false", () => {
    const results = new Map<string, RunResult>();
    results.set(FAKE_NAP_PATH, makeFailedResult(FAKE_NAP_PATH));
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, results);

    assert.strictEqual(node.runState, RunState.Failed, "should be Failed when result.passed is false");
  });

  test("error state when result has error string", () => {
    const results = new Map<string, RunResult>();
    results.set(FAKE_NAP_PATH, makeErrorResult(FAKE_NAP_PATH));
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, results);

    assert.strictEqual(node.runState, RunState.Error, "should be Error when result.error is set");
  });

  test("result for different file does not affect this node", () => {
    const otherPath = "/workspace/other.nap";
    const results = new Map<string, RunResult>();
    results.set(otherPath, makePassedResult(otherPath));
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, results);

    assert.strictEqual(node.runState, RunState.Idle, "should be Idle when result is for different file");
  });

  test("extracts GET method from key-value format", () => {
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, new Map());
    assert.strictEqual(node.httpMethod, "GET");
  });

  test("extracts POST method from key-value format", () => {
    const node = createFileNode(FAKE_NAP_PATH, POST_CONTENT, new Map());
    assert.strictEqual(node.httpMethod, "POST");
  });

  test("extracts GET method from shorthand format", () => {
    const node = createFileNode(FAKE_NAP_PATH, SHORTHAND_GET_CONTENT, new Map());
    assert.strictEqual(node.httpMethod, "GET");
  });

  test("extracts DELETE method from shorthand format", () => {
    const node = createFileNode(FAKE_NAP_PATH, SHORTHAND_DELETE_CONTENT, new Map());
    assert.strictEqual(node.httpMethod, "DELETE");
  });

  test("no method extracted when content has no method line", () => {
    const node = createFileNode(FAKE_NAP_PATH, NO_METHOD_CONTENT, new Map());
    assert.strictEqual(node.httpMethod, undefined);
  });

  test("naplist files get playlist context value", () => {
    const node = createFileNode(FAKE_NAPLIST_PATH, "[meta]\nname = smoke\n", new Map());
    assert.strictEqual(node.contextValue, CONTEXT_PLAYLIST);
  });

  test("naplist files do not extract http method", () => {
    const node = createFileNode(FAKE_NAPLIST_PATH, "GET https://example.com\n", new Map());
    assert.strictEqual(node.httpMethod, undefined);
  });

  test("label is filename without extension", () => {
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, new Map());
    assert.strictEqual(node.label, "test");
  });

  test("passed result stays passed even with multiple assertions", () => {
    const results = new Map<string, RunResult>();
    results.set(FAKE_NAP_PATH, {
      file: FAKE_NAP_PATH,
      passed: true,
      statusCode: 200,
      duration: 50,
      assertions: [
        { target: "status", passed: true, expected: "200", actual: "200" },
        { target: "body.id", passed: true, expected: "exists", actual: "1" },
        { target: "body.title", passed: true, expected: "Test", actual: "Test" },
      ],
    });
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, results);

    assert.strictEqual(node.runState, RunState.Passed);
  });

  test("failed result even when some assertions pass", () => {
    const results = new Map<string, RunResult>();
    results.set(FAKE_NAP_PATH, {
      file: FAKE_NAP_PATH,
      passed: false,
      statusCode: 200,
      duration: 50,
      assertions: [
        { target: "status", passed: true, expected: "200", actual: "200" },
        { target: "body.name", passed: false, expected: "Alice", actual: "Bob" },
      ],
    });
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, results);

    assert.strictEqual(node.runState, RunState.Failed, "should be Failed when passed is false");
  });

  test("error takes priority over passed field", () => {
    const results = new Map<string, RunResult>();
    results.set(FAKE_NAP_PATH, {
      file: FAKE_NAP_PATH,
      passed: false,
      error: "timeout",
      assertions: [],
    });
    const node = createFileNode(FAKE_NAP_PATH, GET_CONTENT, results);

    assert.strictEqual(node.runState, RunState.Error, "error field should produce Error state, not Failed");
  });
});

suite("explorerProvider — createFolderNode", () => {
  test("folder node is always idle", () => {
    const child = createFileNode(FAKE_NAP_PATH, GET_CONTENT, new Map());
    const folder = createFolderNode(FAKE_FOLDER_PATH, [child]);

    assert.strictEqual(folder.runState, RunState.Idle);
    assert.strictEqual(folder.isDirectory, true);
    assert.strictEqual(folder.contextValue, CONTEXT_FOLDER);
  });

  test("folder label is directory basename", () => {
    const folder = createFolderNode(FAKE_FOLDER_PATH, []);
    assert.strictEqual(folder.label, "petstore");
  });

  test("folder children are preserved", () => {
    const child1 = createFileNode(FAKE_NAP_PATH, GET_CONTENT, new Map());
    const child2 = createFileNode("/workspace/other.nap", POST_CONTENT, new Map());
    const folder = createFolderNode(FAKE_FOLDER_PATH, [child1, child2]);

    assert.strictEqual(folder.children?.length, 2);
  });
});
