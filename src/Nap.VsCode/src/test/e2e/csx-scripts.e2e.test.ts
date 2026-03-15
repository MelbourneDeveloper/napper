import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  activateExtension,
  sleep,
  getFixturePath,
  openDocument,
  closeAllEditors,
  executeCommand,
  waitForCondition,
  extractStepLines,
} from "../helpers/helpers";
import {
  CMD_RUN_FILE,
  CMD_SAVE_REPORT,
  PLAYLIST_PANEL_TITLE,
  RESPONSE_PANEL_TITLE,
  REPORT_FILE_EXTENSION,
  REPORT_FILE_SUFFIX,
} from "../../constants";

const findTabByLabel = (label: string): vscode.Tab | undefined =>
  vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .find((tab) => tab.label.includes(label));

const countTabsByLabel = (label: string): number =>
  vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .filter((t) => t.label.includes(label)).length;

suite("CSX Script Edge Cases — Real Execution", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(3000);
  });

  suiteTeardown(async () => {
    await closeAllEditors();
  });

  // ── CSX-only playlist (no .nap requests at all) ──────────────────────

  test("csx-only playlist opens panel and completes successfully", async function () {
    this.timeout(60000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("petstore/csx-only.naplist");
    assert.strictEqual(
      doc.languageId,
      "naplist",
      "csx-only.naplist must have naplist language mode"
    );

    const runPromise = executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      () => findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
      5000
    );

    const playlistTab = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.ok(
      playlistTab,
      `Tab '${PLAYLIST_PANEL_TITLE}' must open for a playlist containing only .csx scripts`
    );

    const responseTab = findTabByLabel(RESPONSE_PANEL_TITLE);
    assert.strictEqual(
      responseTab,
      undefined,
      `Tab '${RESPONSE_PANEL_TITLE}' must NOT appear — .csx-only playlist uses playlist panel`
    );

    await runPromise;

    const panelAfter = findTabByLabel(PLAYLIST_PANEL_TITLE);
    assert.ok(
      panelAfter,
      `Tab '${PLAYLIST_PANEL_TITLE}' must persist after csx-only playlist completes`
    );
  });

  test("csx-only playlist contains no .nap steps and all scripts exist", () => {
    const playlistPath = getFixturePath("petstore/csx-only.naplist");
    const content = fs.readFileSync(playlistPath, "utf-8");

    assert.ok(content.includes("[meta]"), "Must have [meta] section");
    assert.ok(content.includes("[steps]"), "Must have [steps] section");
    assert.ok(
      content.includes("echo.csx"),
      "Must reference echo.csx"
    );
    assert.ok(
      content.includes("multi-output.csx"),
      "Must reference multi-output.csx"
    );

    const scriptsDir = getFixturePath("scripts");
    assert.ok(
      fs.existsSync(path.join(scriptsDir, "echo.csx")),
      "echo.csx must exist"
    );
    assert.ok(
      fs.existsSync(path.join(scriptsDir, "multi-output.csx")),
      "multi-output.csx must exist"
    );
  });

  // ── Failing script — extension must not crash ────────────────────────

  test("playlist with failing csx script opens panel and completes without crashing", async function () {
    this.timeout(60000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("petstore/csx-fail.naplist");
    assert.strictEqual(
      doc.languageId,
      "naplist",
      "csx-fail.naplist must have naplist language mode"
    );

    const runPromise = executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      () => findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
      5000
    );

    assert.ok(
      findTabByLabel(PLAYLIST_PANEL_TITLE),
      `Tab '${PLAYLIST_PANEL_TITLE}' must open even when playlist contains a failing .csx script`
    );

    // The run must resolve — a failing script must not hang the extension
    await runPromise;

    assert.ok(
      findTabByLabel(PLAYLIST_PANEL_TITLE),
      `Tab '${PLAYLIST_PANEL_TITLE}' must persist after playlist with failing script completes`
    );

    assert.strictEqual(
      findTabByLabel(RESPONSE_PANEL_TITLE),
      undefined,
      `Tab '${RESPONSE_PANEL_TITLE}' must NOT appear — even failed playlists use playlist panel`
    );
  });

  test("csx-fail.naplist fixture has failing script and valid steps", () => {
    const playlistPath = getFixturePath("petstore/csx-fail.naplist");
    const content = fs.readFileSync(playlistPath, "utf-8");

    assert.ok(content.includes("fail.csx"), "Must reference fail.csx");
    assert.ok(content.includes("echo.csx"), "Must reference echo.csx");
    assert.ok(content.includes("list-pets.nap"), "Must reference list-pets.nap");

    const scriptsDir = getFixturePath("scripts");
    assert.ok(
      fs.existsSync(path.join(scriptsDir, "fail.csx")),
      "fail.csx fixture must exist"
    );

    const failContent = fs.readFileSync(
      path.join(scriptsDir, "fail.csx"),
      "utf-8"
    );
    assert.ok(
      failContent.includes("Environment.Exit(1)"),
      "fail.csx must exit with non-zero code"
    );
  });

  // ── Compilation error — extension must handle gracefully ─────────────

  test("playlist with compilation-error csx opens panel and completes without crashing", async function () {
    this.timeout(60000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("petstore/csx-compile-error.naplist");
    assert.strictEqual(
      doc.languageId,
      "naplist",
      "csx-compile-error.naplist must have naplist language mode"
    );

    const runPromise = executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      () => findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
      5000
    );

    assert.ok(
      findTabByLabel(PLAYLIST_PANEL_TITLE),
      `Tab '${PLAYLIST_PANEL_TITLE}' must open even when playlist contains a .csx with compilation errors`
    );

    // Must not hang — compilation errors should produce a failed result, not block forever
    await runPromise;

    assert.ok(
      findTabByLabel(PLAYLIST_PANEL_TITLE),
      `Tab '${PLAYLIST_PANEL_TITLE}' must persist after playlist with compilation-error script`
    );
  });

  test("csx-compile-error.naplist fixture has script with type error", () => {
    const playlistPath = getFixturePath("petstore/csx-compile-error.naplist");
    const content = fs.readFileSync(playlistPath, "utf-8");

    assert.ok(
      content.includes("compile-error.csx"),
      "Must reference compile-error.csx"
    );

    const scriptsDir = getFixturePath("scripts");
    const scriptContent = fs.readFileSync(
      path.join(scriptsDir, "compile-error.csx"),
      "utf-8"
    );

    // The script assigns a string to an int — guaranteed compilation failure
    assert.ok(
      scriptContent.includes("int x"),
      "compile-error.csx must declare an int variable"
    );
  });

  // ── Multiple CSX scripts interleaved with .nap requests ──────────────

  test("playlist with multiple csx scripts interleaved with requests completes", async function () {
    this.timeout(90000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("petstore/csx-multi.naplist");
    assert.strictEqual(
      doc.languageId,
      "naplist",
      "csx-multi.naplist must have naplist language mode"
    );

    const runPromise = executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      () => findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
      5000
    );

    assert.ok(
      findTabByLabel(PLAYLIST_PANEL_TITLE),
      `Tab '${PLAYLIST_PANEL_TITLE}' must open for multi-script interleaved playlist`
    );

    await runPromise;

    assert.ok(
      findTabByLabel(PLAYLIST_PANEL_TITLE),
      `Tab '${PLAYLIST_PANEL_TITLE}' must persist after multi-script interleaved playlist`
    );

    assert.strictEqual(
      findTabByLabel(RESPONSE_PANEL_TITLE),
      undefined,
      `Tab '${RESPONSE_PANEL_TITLE}' must NOT appear for interleaved playlist`
    );
  });

  test("csx-multi.naplist has 5 steps mixing scripts and requests", () => {
    const playlistPath = getFixturePath("petstore/csx-multi.naplist");
    const content = fs.readFileSync(playlistPath, "utf-8");
    const lines = content.split("\n");

    let inSteps = false;
    const steps: string[] = [];
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
      if (inSteps && trimmed.length > 0) {
        steps.push(trimmed);
      }
    }

    assert.strictEqual(steps.length, 5, "csx-multi must have exactly 5 steps");

    const csxSteps = steps.filter((s) => s.endsWith(".csx"));
    const napSteps = steps.filter((s) => s.endsWith(".nap"));
    assert.strictEqual(csxSteps.length, 3, "Must have 3 .csx script steps");
    assert.strictEqual(napSteps.length, 2, "Must have 2 .nap request steps");
  });

  // ── Slow script — panel opens before script finishes ─────────────────

  test("slow csx script: panel opens immediately, run eventually completes", async function () {
    this.timeout(90000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("petstore/csx-slow.naplist");

    const runPromise = executeCommand(CMD_RUN_FILE, doc.uri);

    // Panel must appear within 2s — the slow script takes 3s+
    await waitForCondition(
      () => findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
      2000
    );

    assert.ok(
      findTabByLabel(PLAYLIST_PANEL_TITLE),
      `Tab '${PLAYLIST_PANEL_TITLE}' must open BEFORE slow .csx script finishes`
    );

    // Now wait for the full run to complete
    await runPromise;

    assert.ok(
      findTabByLabel(PLAYLIST_PANEL_TITLE),
      `Tab '${PLAYLIST_PANEL_TITLE}' must persist after slow script completes`
    );
  });

  // ── Re-run csx-only playlist reuses panel ────────────────────────────

  test("re-running csx-only playlist reuses panel, no duplicates", async function () {
    this.timeout(120000);
    await closeAllEditors();
    await sleep(500);

    const doc = await openDocument("petstore/csx-only.naplist");

    // First run
    await executeCommand(CMD_RUN_FILE, doc.uri);
    await waitForCondition(
      () => findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
      5000
    );

    assert.ok(
      findTabByLabel(PLAYLIST_PANEL_TITLE),
      "Playlist panel must exist after first csx-only run"
    );

    // Second run
    const secondRunPromise = executeCommand(CMD_RUN_FILE, doc.uri);
    await waitForCondition(
      () => findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
      2000
    );

    assert.strictEqual(
      countTabsByLabel(PLAYLIST_PANEL_TITLE),
      1,
      "Only ONE playlist panel tab must exist during re-run — panel must be reused"
    );

    await secondRunPromise;

    assert.strictEqual(
      countTabsByLabel(PLAYLIST_PANEL_TITLE),
      1,
      "Only ONE playlist panel tab must exist after re-run completes"
    );
  });

  // ── Save report after failed playlist ────────────────────────────────

  test("save report works after playlist with failing csx script", async function () {
    this.timeout(60000);
    await closeAllEditors();
    await sleep(500);

    const playlistPath = getFixturePath("petstore/csx-fail.naplist");
    const expectedReportPath = path.join(
      path.dirname(playlistPath),
      `csx-fail${REPORT_FILE_SUFFIX}${REPORT_FILE_EXTENSION}`
    );

    if (fs.existsSync(expectedReportPath)) {
      fs.unlinkSync(expectedReportPath);
    }

    const doc = await openDocument("petstore/csx-fail.naplist");
    await executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      () => findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
      5000
    );

    // Wait for run to fully complete before saving report
    await sleep(15000);

    await executeCommand(CMD_SAVE_REPORT);

    // Report file must be created even when playlist contains failures
    await waitForCondition(
      () => fs.existsSync(expectedReportPath),
      5000
    );

    assert.ok(
      fs.existsSync(expectedReportPath),
      `Report must be created at ${expectedReportPath} even when playlist has failing scripts`
    );

    const reportContent = fs.readFileSync(expectedReportPath, "utf-8");
    assert.ok(
      reportContent.includes("<!DOCTYPE html"),
      "Report must be valid HTML"
    );
    assert.ok(
      reportContent.includes("csx-fail"),
      "Report must contain the playlist name"
    );

    fs.unlinkSync(expectedReportPath);
  });

  // ── Save report after csx-only playlist ──────────────────────────────

  test("save report works for csx-only playlist with no .nap requests", async function () {
    this.timeout(60000);
    await closeAllEditors();
    await sleep(500);

    const playlistPath = getFixturePath("petstore/csx-only.naplist");
    const expectedReportPath = path.join(
      path.dirname(playlistPath),
      `csx-only${REPORT_FILE_SUFFIX}${REPORT_FILE_EXTENSION}`
    );

    if (fs.existsSync(expectedReportPath)) {
      fs.unlinkSync(expectedReportPath);
    }

    const doc = await openDocument("petstore/csx-only.naplist");
    await executeCommand(CMD_RUN_FILE, doc.uri);

    await waitForCondition(
      () => findTabByLabel(PLAYLIST_PANEL_TITLE) !== undefined,
      5000
    );

    // Wait for run to complete
    await sleep(15000);

    await executeCommand(CMD_SAVE_REPORT);

    await waitForCondition(
      () => fs.existsSync(expectedReportPath),
      5000
    );

    assert.ok(
      fs.existsSync(expectedReportPath),
      `Report must be created for csx-only playlist`
    );

    const reportContent = fs.readFileSync(expectedReportPath, "utf-8");
    assert.ok(
      reportContent.includes("<!DOCTYPE html"),
      "Report must be valid HTML"
    );
    assert.ok(
      reportContent.includes("csx-only"),
      "Report must contain the playlist name"
    );

    fs.unlinkSync(expectedReportPath);
  });

  // ── All fixture scripts exist and are well-formed ────────────────────

  test("all csx edge-case fixture scripts exist and are non-empty", () => {
    const scriptsDir = getFixturePath("scripts");

    const expectedScripts = [
      "echo.csx",
      "fail.csx",
      "compile-error.csx",
      "multi-output.csx",
      "slow.csx",
    ];

    for (const script of expectedScripts) {
      const scriptPath = path.join(scriptsDir, script);
      assert.ok(
        fs.existsSync(scriptPath),
        `Fixture script ${script} must exist`
      );

      const content = fs.readFileSync(scriptPath, "utf-8");
      assert.ok(
        content.trim().length > 0,
        `Fixture script ${script} must not be empty`
      );
    }
  });

  test("all csx edge-case naplist fixtures exist and have valid structure", () => {
    const petstoreDir = getFixturePath("petstore");

    const expectedPlaylists = [
      "csx-only.naplist",
      "csx-fail.naplist",
      "csx-compile-error.naplist",
      "csx-multi.naplist",
      "csx-slow.naplist",
    ];

    for (const playlist of expectedPlaylists) {
      const playlistPath = path.join(petstoreDir, playlist);
      assert.ok(
        fs.existsSync(playlistPath),
        `Fixture playlist ${playlist} must exist`
      );

      const content = fs.readFileSync(playlistPath, "utf-8");
      assert.ok(
        content.includes("[meta]"),
        `${playlist} must have [meta] section`
      );
      assert.ok(
        content.includes("[steps]"),
        `${playlist} must have [steps] section`
      );
    }
  });

  test("all naplist step file references resolve to existing files", () => {
    const petstoreDir = getFixturePath("petstore");

    const playlists = [
      "csx-only.naplist",
      "csx-fail.naplist",
      "csx-compile-error.naplist",
      "csx-multi.naplist",
      "csx-slow.naplist",
    ];

    for (const playlist of playlists) {
      const playlistPath = path.join(petstoreDir, playlist);
      const content = fs.readFileSync(playlistPath, "utf-8");
      const stepLines = extractStepLines(content);

      for (const step of stepLines) {
        const resolved = path.resolve(petstoreDir, step);
        assert.ok(
          fs.existsSync(resolved),
          `Step '${step}' in ${playlist} must resolve to existing file: ${resolved}`
        );
      }
    }
  });
});
