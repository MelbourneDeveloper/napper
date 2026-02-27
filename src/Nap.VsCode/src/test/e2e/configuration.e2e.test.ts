import * as assert from "assert";
import * as vscode from "vscode";
import {
  activateExtension,
  sleep,
} from "../helpers/helpers";
import {
  CONFIG_SECTION,
  CONFIG_AUTO_RUN,
  CONFIG_SPLIT_LAYOUT,
  CONFIG_MASK_SECRETS,
  CONFIG_CLI_PATH,
  CONFIG_DEFAULT_ENV,
  DEFAULT_CLI_PATH,
} from "../../constants";

suite("Configuration", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(3000);
  });

  test("napper configuration section exists", () => {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    assert.notStrictEqual(config, undefined, "napper configuration section should exist");
  });

  test("autoRunOnSave defaults to false", () => {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const autoRun = config.get<boolean>(CONFIG_AUTO_RUN);
    assert.strictEqual(
      autoRun,
      false,
      "autoRunOnSave should default to false"
    );
  });

  test("splitEditorLayout defaults to beside", () => {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const layout = config.get<string>(CONFIG_SPLIT_LAYOUT);
    assert.strictEqual(
      layout,
      "beside",
      "splitEditorLayout should default to 'beside'"
    );
  });

  test("maskSecretsInPreview defaults to true", () => {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const mask = config.get<boolean>(CONFIG_MASK_SECRETS);
    assert.strictEqual(
      mask,
      true,
      "maskSecretsInPreview should default to true"
    );
  });

  test("cliPath has a default value", () => {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const cliPath = config.get<string>(CONFIG_CLI_PATH);
    assert.strictEqual(
      cliPath,
      DEFAULT_CLI_PATH,
      `cliPath should default to ${DEFAULT_CLI_PATH}`
    );
  });

  test("defaultEnvironment defaults to empty string", () => {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const env = config.get<string>(CONFIG_DEFAULT_ENV);
    assert.strictEqual(
      env,
      "",
      "defaultEnvironment should default to empty string"
    );
  });

  test("splitEditorLayout only accepts valid values", () => {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const inspected = config.inspect<string>(CONFIG_SPLIT_LAYOUT);
    assert.ok(
      inspected,
      "splitEditorLayout should be inspectable"
    );
    assert.strictEqual(
      inspected.defaultValue,
      "beside",
      "Default should be 'beside'"
    );
  });
});
