import * as assert from "assert";
import * as vscode from "vscode";
import {
  activateExtension,
  sleep,
  openDocument,
  closeAllEditors,
  executeCommand,
  waitForCondition,
} from "../helpers/helpers";
import {
  CMD_RUN_FILE,
  CMD_OPEN_RESPONSE,
  RESPONSE_PANEL_TITLE,
  PLAYLIST_PANEL_TITLE,
} from "../../constants";

const findTabByLabel = (label: string): vscode.Tab | undefined =>
  vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .find((tab) => tab.label.includes(label));

suite("Run File — Real API Calls", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(3000);
  });

  suiteTeardown(async () => {
    await closeAllEditors();
  });

  test("run shorthand GET against httpbin.org opens response panel", async function () {
    this.timeout(30000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("get-httpbin.nap");
    assert.strictEqual(doc.languageId, "nap", "Should have nap language mode");

    await executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      async () => findTabByLabel(RESPONSE_PANEL_TITLE) !== undefined,
      10000
    );

    const responseTab = findTabByLabel(RESPONSE_PANEL_TITLE);
    assert.ok(
      responseTab,
      `Tab '${RESPONSE_PANEL_TITLE}' must exist after running GET request`
    );

    const playlistTab = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.strictEqual(
      playlistTab,
      undefined,
      `Tab '${PLAYLIST_PANEL_TITLE}' must NOT exist after running a single .nap file`
    );
  });

  test("run POST against jsonplaceholder opens response panel", async function () {
    this.timeout(30000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("post-jsonplaceholder.nap");
    assert.strictEqual(doc.languageId, "nap", "Should have nap language mode");

    await executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      async () => findTabByLabel(RESPONSE_PANEL_TITLE) !== undefined,
      10000
    );

    const responseTab = findTabByLabel(RESPONSE_PANEL_TITLE);
    assert.ok(
      responseTab,
      `Tab '${RESPONSE_PANEL_TITLE}' must exist after running POST request`
    );

    const playlistTab = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.strictEqual(
      playlistTab,
      undefined,
      `Tab '${PLAYLIST_PANEL_TITLE}' must NOT exist after running a single POST .nap file`
    );
  });

  test("run GET against jsonplaceholder /users opens response panel", async function () {
    this.timeout(30000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("get-users.nap");
    assert.strictEqual(doc.languageId, "nap", "Should have nap language mode");

    await executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      async () => findTabByLabel(RESPONSE_PANEL_TITLE) !== undefined,
      10000
    );

    const responseTab = findTabByLabel(RESPONSE_PANEL_TITLE);
    assert.ok(
      responseTab,
      `Tab '${RESPONSE_PANEL_TITLE}' must exist after running /users GET`
    );

    const playlistTab = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.strictEqual(
      playlistTab,
      undefined,
      `Tab '${PLAYLIST_PANEL_TITLE}' must NOT exist after running a single GET .nap file`
    );
  });

  test("run petstore list-pets with [request] section opens response panel", async function () {
    this.timeout(30000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("petstore/list-pets.nap");
    assert.strictEqual(doc.languageId, "nap", "Should have nap language mode");

    await executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      async () => findTabByLabel(RESPONSE_PANEL_TITLE) !== undefined,
      10000
    );

    const responseTab = findTabByLabel(RESPONSE_PANEL_TITLE);
    assert.ok(
      responseTab,
      `Tab '${RESPONSE_PANEL_TITLE}' must exist after running petstore request`
    );

    const playlistTab = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.strictEqual(
      playlistTab,
      undefined,
      `Tab '${PLAYLIST_PANEL_TITLE}' must NOT exist after running a single petstore .nap file`
    );
  });

  test("running via URI opens same response panel as via document", async function () {
    this.timeout(30000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("get-httpbin.nap");
    await executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      async () => findTabByLabel(RESPONSE_PANEL_TITLE) !== undefined,
      10000
    );

    const responseTab = findTabByLabel(RESPONSE_PANEL_TITLE);
    assert.ok(
      responseTab,
      `Tab '${RESPONSE_PANEL_TITLE}' must exist when running via URI`
    );

    const playlistTab = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.strictEqual(
      playlistTab,
      undefined,
      `Tab '${PLAYLIST_PANEL_TITLE}' must NOT exist when running via URI`
    );

    const responseTabs = vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .filter((t) => t.label.includes(RESPONSE_PANEL_TITLE));
    assert.strictEqual(
      responseTabs.length,
      1,
      "Only one response panel tab should exist — panel must be reused, not duplicated"
    );
  });

  test("open response command shows panel when result exists", async function () {
    this.timeout(30000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("get-httpbin.nap");
    await executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      async () => findTabByLabel(RESPONSE_PANEL_TITLE) !== undefined,
      10000
    );

    await closeAllEditors();
    await sleep(500);

    assert.strictEqual(
      findTabByLabel(RESPONSE_PANEL_TITLE),
      undefined,
      "Response panel should be gone after closing all editors"
    );

    await executeCommand(CMD_OPEN_RESPONSE);

    await waitForCondition(
      async () => findTabByLabel(RESPONSE_PANEL_TITLE) !== undefined,
      5000
    );

    const reopenedTab = findTabByLabel(RESPONSE_PANEL_TITLE);
    assert.ok(
      reopenedTab,
      `Tab '${RESPONSE_PANEL_TITLE}' must reappear via openResponse command`
    );

    const playlistTab = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.strictEqual(
      playlistTab,
      undefined,
      `Tab '${PLAYLIST_PANEL_TITLE}' must NOT exist after reopening response for a .nap file`
    );

    const reopenedTabs = vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .filter((t) => t.label.includes(RESPONSE_PANEL_TITLE));
    assert.strictEqual(
      reopenedTabs.length,
      1,
      "Only one response panel tab should exist after reopen"
    );
  });
});
