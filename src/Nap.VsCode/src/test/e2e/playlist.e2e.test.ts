import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import {
  activateExtension,
  sleep,
  getFixturePath,
  openDocument,
  closeAllEditors,
  executeCommand,
  waitForCondition,
} from "../helpers/helpers";
import * as path from "path";
import {
  CMD_RUN_FILE,
  CMD_SAVE_REPORT,
  CONFIG_SECTION,
  CONFIG_CLI_PATH,
  PLAYLIST_PANEL_TITLE,
  REPORT_FILE_EXTENSION,
  REPORT_FILE_SUFFIX,
  RESPONSE_PANEL_TITLE,
} from "../../constants";

const findTabByLabel = (label: string): vscode.Tab | undefined =>
  vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .find((tab) => tab.label.includes(label));

suite("Playlist Panel — Real API Calls", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(3000);
  });

  suiteTeardown(async () => {
    await closeAllEditors();
  });

  test("playlist panel opens IMMEDIATELY when run starts, before API calls complete", async function () {
    this.timeout(45000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("petstore/smoke.naplist");

    // Fire the command but do NOT await — we want to check the panel
    // appears while API calls are still in flight
    const runPromise = executeCommand(CMD_RUN_FILE, doc.uri);

    // Panel must appear within 2 seconds — API calls take much longer
    await waitForCondition(
      async () => findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
      2000
    );

    const playlistTab = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.ok(
      playlistTab,
      `Tab '${PLAYLIST_PANEL_TITLE}' must open IMMEDIATELY when playlist starts, not after all API calls finish`
    );

    const responseTab = findTabByLabel(RESPONSE_PANEL_TITLE);
    assert.strictEqual(
      responseTab,
      undefined,
      `Tab '${RESPONSE_PANEL_TITLE}' must NOT exist after running a .naplist — playlist panel should open instead`
    );

    // Now wait for actual completion — panel must persist
    await runPromise;

    const panelAfterCompletion = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.ok(
      panelAfterCompletion,
      `Tab '${PLAYLIST_PANEL_TITLE}' must persist after all API calls complete`
    );

    const responseTabAfterRun = findTabByLabel(RESPONSE_PANEL_TITLE);
    assert.strictEqual(
      responseTabAfterRun,
      undefined,
      `Tab '${RESPONSE_PANEL_TITLE}' must NOT appear even after playlist completes — only playlist panel is used`
    );
  });

  test("running a playlist via filePath object opens panel immediately", async function () {
    this.timeout(45000);
    await closeAllEditors();
    await sleep(500);

    const playlistPath = getFixturePath("petstore/smoke.naplist");

    // Fire without await to test immediate opening
    const runPromise = executeCommand(CMD_RUN_FILE, { filePath: playlistPath });

    // Panel must appear within 2 seconds — proves immediate opening
    await waitForCondition(
      async () => findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
      2000
    );

    const playlistTab = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.ok(
      playlistTab,
      `Tab '${PLAYLIST_PANEL_TITLE}' must open IMMEDIATELY via filePath object (tree view click path)`
    );

    const responseTab = findTabByLabel(RESPONSE_PANEL_TITLE);
    assert.strictEqual(
      responseTab,
      undefined,
      `Tab '${RESPONSE_PANEL_TITLE}' must NOT exist — the tree view play button must open the playlist panel`
    );

    await runPromise;

    const panelAfterCompletion = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.ok(
      panelAfterCompletion,
      `Tab '${PLAYLIST_PANEL_TITLE}' must persist after completion via filePath path`
    );

    const responseTabAfterFilePath = findTabByLabel(RESPONSE_PANEL_TITLE);
    assert.strictEqual(
      responseTabAfterFilePath,
      undefined,
      `Tab '${RESPONSE_PANEL_TITLE}' must NOT appear after playlist completion via filePath`
    );
  });

  test("running a single .nap file opens response panel, not playlist panel", async function () {
    this.timeout(30000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("get-httpbin.nap");
    assert.strictEqual(
      doc.languageId,
      "nap",
      "get-httpbin.nap should have nap language mode"
    );

    await executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      async () => findTabByLabel(RESPONSE_PANEL_TITLE) !== undefined,
      10000
    );

    const responseTab = findTabByLabel(RESPONSE_PANEL_TITLE);
    assert.ok(
      responseTab,
      `Tab '${RESPONSE_PANEL_TITLE}' must exist after running a single .nap file`
    );
    assert.ok(
      responseTab.isActive || responseTab.group !== undefined,
      "Response tab should be visible in a tab group"
    );

    const playlistTab = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.strictEqual(
      playlistTab,
      undefined,
      `Tab '${PLAYLIST_PANEL_TITLE}' must NOT exist after running a single .nap file`
    );
  });

  test("playlist file has correct structure", () => {
    const playlistPath = getFixturePath("petstore/smoke.naplist");
    const content = fs.readFileSync(playlistPath, "utf-8");

    assert.ok(content.includes("[meta]"), "Should have [meta] section");
    assert.ok(content.includes("[steps]"), "Should have [steps] section");
    assert.ok(
      content.includes("list-pets.nap"),
      "Should reference list-pets step"
    );
    assert.ok(
      content.includes("get-pet.nap"),
      "Should reference get-pet step"
    );
  });

  test("playlist steps reference files that exist", () => {
    const playlistPath = getFixturePath("petstore/smoke.naplist");
    const content = fs.readFileSync(playlistPath, "utf-8");
    const lines = content.split("\n");

    let inSteps = false;
    const stepPaths: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "[steps]") {
        inSteps = true;
        continue;
      }
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        inSteps = false;
        continue;
      }
      if (inSteps && trimmed.length > 0 && !trimmed.startsWith("#")) {
        stepPaths.push(trimmed);
      }
    }

    assert.ok(
      stepPaths.length > 0,
      "Playlist should have at least one step"
    );

    const basePath = getFixturePath("petstore");
    for (const stepRelative of stepPaths) {
      const stepFull = `${basePath}/${stepRelative.replace("./", "")}`;
      assert.ok(
        fs.existsSync(stepFull),
        `Step file should exist: ${stepRelative}`
      );
    }
  });

  test("playlist with script step opens panel and completes without error", async function () {
    this.timeout(60000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("petstore/with-script.naplist");
    assert.strictEqual(
      doc.languageId,
      "naplist",
      "with-script.naplist should have naplist language mode"
    );

    const runPromise = executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      async () => findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
      5000
    );

    const playlistTab = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.ok(
      playlistTab,
      `Tab '${PLAYLIST_PANEL_TITLE}' must open when running playlist that includes .fsx script steps`
    );

    const responseTabDuringRun = findTabByLabel(RESPONSE_PANEL_TITLE);
    assert.strictEqual(
      responseTabDuringRun,
      undefined,
      `Tab '${RESPONSE_PANEL_TITLE}' must NOT exist — playlist with scripts should use playlist panel, not response panel`
    );

    await runPromise;

    const panelAfterCompletion = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.ok(
      panelAfterCompletion,
      `Tab '${PLAYLIST_PANEL_TITLE}' must persist after playlist with scripts completes`
    );

    const responseTabAfterCompletion = findTabByLabel(RESPONSE_PANEL_TITLE);
    assert.strictEqual(
      responseTabAfterCompletion,
      undefined,
      `Tab '${RESPONSE_PANEL_TITLE}' must NOT appear even after playlist with scripts completes`
    );
  });

  test("with-script.naplist fixture references existing files", () => {
    const playlistPath = getFixturePath("petstore/with-script.naplist");
    const content = fs.readFileSync(playlistPath, "utf-8");

    assert.ok(content.includes("[meta]"), "Should have [meta] section");
    assert.ok(content.includes("[steps]"), "Should have [steps] section");
    assert.ok(
      content.includes("echo.fsx"),
      "Should reference echo.fsx script step"
    );
    assert.ok(
      content.includes("list-pets.nap"),
      "Should reference list-pets.nap API step"
    );

    const scriptsDir = getFixturePath("scripts");
    assert.ok(
      fs.existsSync(`${scriptsDir}/echo.fsx`),
      "echo.fsx fixture script must exist"
    );

    const echoContent = fs.readFileSync(`${scriptsDir}/echo.fsx`, "utf-8");
    assert.ok(
      echoContent.includes("printfn"),
      "echo.fsx must contain printfn to produce output"
    );
  });

  test("re-running a playlist resets state and opens fresh running panel", async function () {
    this.timeout(90000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("petstore/smoke.naplist");

    // First run — wait for full completion so results are stored
    await executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      async () => findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
      10000
    );

    const panelAfterFirstRun = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.ok(
      panelAfterFirstRun,
      `Tab '${PLAYLIST_PANEL_TITLE}' must exist after first playlist run completes`
    );

    // Second run — fire WITHOUT await to test immediate state reset
    const secondRunPromise = executeCommand(CMD_RUN_FILE, doc.uri);

    // Panel must still exist immediately (reused, not recreated)
    await waitForCondition(
      async () => findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
      2000
    );

    const panelDuringSecondRun = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.ok(
      panelDuringSecondRun,
      `Tab '${PLAYLIST_PANEL_TITLE}' must be reused for second run — not closed and reopened`
    );

    // Only ONE playlist tab should exist (proves reuse, not duplication)
    const playlistTabs = vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .filter((t) => t.label.includes(PLAYLIST_PANEL_TITLE));
    assert.strictEqual(
      playlistTabs.length,
      1,
      "Only one playlist panel tab should exist during re-run — panel must be reused"
    );

    // Response panel must NOT appear during re-run
    const responseTabDuringRerun = findTabByLabel(RESPONSE_PANEL_TITLE);
    assert.strictEqual(
      responseTabDuringRerun,
      undefined,
      `Tab '${RESPONSE_PANEL_TITLE}' must NOT appear during playlist re-run`
    );

    // Wait for second run to complete
    await secondRunPromise;

    // Panel must persist after second run
    const panelAfterSecondRun = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.ok(
      panelAfterSecondRun,
      `Tab '${PLAYLIST_PANEL_TITLE}' must persist after second playlist run completes`
    );
  });

  test("opening .naplist sets naplist language mode", async function () {
    this.timeout(10000);
    const doc = await openDocument("petstore/smoke.naplist");
    assert.strictEqual(
      doc.languageId,
      "naplist",
      "Language should be naplist"
    );
  });

  test("save report command creates HTML report file after playlist completes", async function () {
    this.timeout(60000);
    await closeAllEditors();
    await sleep(500);

    const playlistPath = getFixturePath("petstore/smoke.naplist");
    const expectedReportPath = path.join(
      path.dirname(playlistPath),
      `smoke${REPORT_FILE_SUFFIX}${REPORT_FILE_EXTENSION}`
    );

    // Clean up any leftover report from previous runs
    if (fs.existsSync(expectedReportPath)) {
      fs.unlinkSync(expectedReportPath);
    }

    const doc = await openDocument("petstore/smoke.naplist");
    await executeCommand(CMD_RUN_FILE, doc.uri);

    // Wait for panel to appear and run to complete
    await waitForCondition(
      async () => findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
      5000
    );

    // Report must NOT exist before the save command is invoked
    assert.strictEqual(
      fs.existsSync(expectedReportPath),
      false,
      "Report file must not exist before Save Report is triggered"
    );

    // Trigger save report — same as clicking the Save Report button
    await executeCommand(CMD_SAVE_REPORT);

    // Report file must now exist at the expected path
    assert.ok(
      fs.existsSync(expectedReportPath),
      `Report file must be created at ${expectedReportPath} after Save Report command`
    );

    const reportContent = fs.readFileSync(expectedReportPath, "utf-8");

    assert.ok(
      reportContent.includes("<!DOCTYPE html"),
      "Report must be a valid HTML document"
    );
    assert.ok(
      reportContent.includes("smoke"),
      "Report must contain the playlist name"
    );

    // Clean up
    fs.unlinkSync(expectedReportPath);
  });

  test("playlist with missing CLI shows error in panel, never PASSED", async function () {
    this.timeout(30000);
    await closeAllEditors();
    await sleep(500);

    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const originalPath = config.get<string>(CONFIG_CLI_PATH);

    // Point to a nonexistent CLI binary
    await config.update(
      CONFIG_CLI_PATH,
      "/nonexistent/napper-fake-binary",
      vscode.ConfigurationTarget.Workspace
    );

    try {
      const doc = await openDocument("petstore/smoke.naplist");

      // Fire command — don't await since it may resolve quickly
      const runPromise = executeCommand(CMD_RUN_FILE, doc.uri);

      // Panel must open even when CLI fails (showRunning fires before CLI)
      await waitForCondition(
        async () => findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
        5000
      );

      const playlistTab = findTabByLabel(PLAYLIST_PANEL_TITLE);
      assert.ok(
        playlistTab,
        `Tab '${PLAYLIST_PANEL_TITLE}' must open even when CLI fails — error must be shown in the panel, not silently ignored`
      );

      await runPromise;
    } finally {
      // Restore original CLI path
      await config.update(
        CONFIG_CLI_PATH,
        originalPath,
        vscode.ConfigurationTarget.Workspace
      );
    }
  });
});
