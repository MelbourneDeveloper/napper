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

suite("Response Panel", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(3000);
  });

  suiteTeardown(async () => {
    await closeAllEditors();
  });

  test("response panel opens after running a request", async function () {
    this.timeout(30000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("get-httpbin.nap");
    await executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      () => findTabByLabel(RESPONSE_PANEL_TITLE) !== undefined,
      10000
    );

    const responseTab = findTabByLabel(RESPONSE_PANEL_TITLE);
    assert.ok(
      responseTab,
      `Tab '${RESPONSE_PANEL_TITLE}' must exist after running a request`
    );

    const playlistTab = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.strictEqual(
      playlistTab,
      undefined,
      `Tab '${PLAYLIST_PANEL_TITLE}' must NOT exist after running a single .nap file`
    );
  });

  test("openResponse command reopens panel after closing all editors", async function () {
    this.timeout(30000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("get-users.nap");
    await executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      () => findTabByLabel(RESPONSE_PANEL_TITLE) !== undefined,
      10000
    );

    assert.ok(
      findTabByLabel(RESPONSE_PANEL_TITLE),
      "Response panel must exist after run"
    );

    await closeAllEditors();
    await sleep(500);

    assert.strictEqual(
      findTabByLabel(RESPONSE_PANEL_TITLE),
      undefined,
      "Response panel must be gone after closing all editors"
    );

    await executeCommand(CMD_OPEN_RESPONSE);

    await waitForCondition(
      () => findTabByLabel(RESPONSE_PANEL_TITLE) !== undefined,
      5000
    );

    assert.ok(
      findTabByLabel(RESPONSE_PANEL_TITLE),
      `Tab '${RESPONSE_PANEL_TITLE}' must reopen via openResponse command`
    );
  });

  test("response panel appears in a separate tab group from the editor", async function () {
    this.timeout(30000);
    await closeAllEditors();
    await sleep(500);

    await openDocument("get-httpbin.nap");
    const groupsBefore = vscode.window.tabGroups.all.length;

    await executeCommand(CMD_RUN_FILE, vscode.window.activeTextEditor?.document.uri);

    await waitForCondition(
      () => findTabByLabel(RESPONSE_PANEL_TITLE) !== undefined,
      10000
    );

    const groupsAfter = vscode.window.tabGroups.all.length;
    assert.ok(
      groupsAfter > groupsBefore,
      `Response panel must open in a new tab group (before: ${groupsBefore}, after: ${groupsAfter})`
    );
  });

  test("running multiple requests reuses the same response panel", async function () {
    this.timeout(45000);
    await closeAllEditors();
    await sleep(500);

    const doc1 = await openDocument("get-httpbin.nap");
    await executeCommand(CMD_RUN_FILE, doc1.uri);

    await waitForCondition(
      () => findTabByLabel(RESPONSE_PANEL_TITLE) !== undefined,
      10000
    );

    assert.ok(
      findTabByLabel(RESPONSE_PANEL_TITLE),
      "Response panel must exist after first run"
    );

    const responseTabs1 = vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .filter((t) => t.label.includes(RESPONSE_PANEL_TITLE));
    assert.strictEqual(
      responseTabs1.length,
      1,
      "Only one response panel tab should exist after first run"
    );

    const doc2 = await openDocument("get-users.nap");
    await executeCommand(CMD_RUN_FILE, doc2.uri);

    await waitForCondition(
      () => findTabByLabel(RESPONSE_PANEL_TITLE) !== undefined,
      10000
    );

    const responseTabs2 = vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .filter((t) => t.label.includes(RESPONSE_PANEL_TITLE));
    assert.strictEqual(
      responseTabs2.length,
      1,
      "Still only one response panel tab should exist after second run — panel is reused, not duplicated"
    );
  });
});
