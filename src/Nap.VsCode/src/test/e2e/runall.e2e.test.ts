import * as assert from "assert";
import * as vscode from "vscode";
import {
  activateExtension,
  sleep,
  closeAllEditors,
  executeCommand,
  waitForCondition,
} from "../helpers/helpers";
import {
  CMD_RUN_ALL,
  RESPONSE_PANEL_TITLE,
  PLAYLIST_PANEL_TITLE,
} from "../../constants";

const findTabByLabel = (label: string): vscode.Tab | undefined =>
  vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .find((tab) => tab.label.includes(label));

suite("Run All — Real API Calls", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(3000);
  });

  suiteTeardown(async () => {
    await closeAllEditors();
  });

  test("runAll command is registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes(CMD_RUN_ALL),
      "runAll command should be registered"
    );
  });

  test("runAll opens a response or playlist panel after execution", async function () {
    this.timeout(60000);
    await closeAllEditors();
    await sleep(500);

    await executeCommand(CMD_RUN_ALL);

    await waitForCondition(
      () =>
        findTabByLabel(RESPONSE_PANEL_TITLE) !== undefined ||
        findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
      30000
    );

    const hasResponse = findTabByLabel(RESPONSE_PANEL_TITLE) !== undefined;
    const hasPlaylist = findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined;

    assert.ok(
      hasResponse || hasPlaylist,
      `Either '${RESPONSE_PANEL_TITLE}' or '${PLAYLIST_PANEL_TITLE}' tab must exist after runAll`
    );
  });
});
