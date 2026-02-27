import * as assert from "assert";
import * as vscode from "vscode";
import {
  activateExtension,
  sleep,
  openDocument,
  closeAllEditors,
} from "../helpers/helpers";
import {
  CMD_RUN_FILE,
  CMD_COPY_CURL,
} from "../../constants";

suite("CodeLens", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(3000);
  });

  suiteTeardown(async () => {
    await closeAllEditors();
  });

  test("CodeLens appears for shorthand .nap file", async function () {
    this.timeout(15000);
    const doc = await openDocument("get-httpbin.nap");
    await sleep(3000);

    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      "vscode.executeCodeLensProvider",
      doc.uri
    );

    assert.ok(
      lenses.length > 0,
      "Should have at least one CodeLens for shorthand .nap file"
    );

    const runLens = lenses.find(
      (l) => l.command?.command === CMD_RUN_FILE
    );
    assert.ok(
      runLens,
      "Should have a Run CodeLens"
    );

    const curlLens = lenses.find(
      (l) => l.command?.command === CMD_COPY_CURL
    );
    assert.ok(
      curlLens,
      "Should have a Copy as curl CodeLens"
    );
  });

  test("CodeLens appears for .nap file with [request] section", async function () {
    this.timeout(15000);
    const doc = await openDocument("petstore/list-pets.nap");
    await sleep(3000);

    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      "vscode.executeCodeLensProvider",
      doc.uri
    );

    assert.ok(
      lenses.length > 0,
      "Should have CodeLens for [request] section"
    );

    const runLens = lenses.find(
      (l) => l.command?.command === CMD_RUN_FILE
    );
    assert.ok(runLens, "Run lens should exist on [request] section");
  });

  test("CodeLens appears for POST .nap file", async function () {
    this.timeout(15000);
    const doc = await openDocument("post-jsonplaceholder.nap");
    await sleep(3000);

    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      "vscode.executeCodeLensProvider",
      doc.uri
    );

    assert.ok(
      lenses.length > 0,
      "Should have CodeLens for POST .nap file"
    );
  });

  test("CodeLens appears for .naplist file", async function () {
    this.timeout(15000);
    const doc = await openDocument("petstore/smoke.naplist");
    await sleep(3000);

    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      "vscode.executeCodeLensProvider",
      doc.uri
    );

    assert.ok(
      lenses.length > 0,
      "Should have CodeLens for .naplist file with [meta] section"
    );

    const runPlaylistLens = lenses.find(
      (l) => l.command?.command === CMD_RUN_FILE
    );
    assert.ok(
      runPlaylistLens,
      "Should have Run Playlist CodeLens"
    );
  });

  test("CodeLens Run lens passes document URI as argument", async function () {
    this.timeout(15000);
    const doc = await openDocument("get-httpbin.nap");
    await sleep(3000);

    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      "vscode.executeCodeLensProvider",
      doc.uri
    );

    const runLens = lenses.find(
      (l) => l.command?.command === CMD_RUN_FILE
    );
    assert.ok(runLens, "Run lens should exist");
    assert.ok(
      runLens.command?.arguments,
      "Run lens should have arguments"
    );
    assert.ok(
      runLens.command.arguments.length > 0,
      "Run lens should pass at least one argument (the URI)"
    );
  });
});
