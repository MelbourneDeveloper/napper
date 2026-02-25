import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import {
  activateExtension,
  sleep,
  getFixturePath,
  getExtensionPath,
} from "../helpers/helpers";
import {
  CONFIG_SECTION,
  CONFIG_DEFAULT_ENV,
  CMD_SWITCH_ENV,
  NAPENV_EXTENSION,
} from "../../constants";

suite("Environment Switching", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(3000);
  });

  test(".napenv file exists in test workspace", () => {
    const envPath = getFixturePath(`petstore/${NAPENV_EXTENSION}`);
    assert.ok(
      fs.existsSync(envPath),
      ".napenv file should exist in petstore fixture"
    );
  });

  test(".napenv.staging file exists for multi-env testing", () => {
    const envPath = getFixturePath("petstore/.napenv.staging");
    assert.ok(
      fs.existsSync(envPath),
      ".napenv.staging file should exist"
    );
  });

  test(".napenv file contains environment variables", () => {
    const envPath = getFixturePath(`petstore/${NAPENV_EXTENSION}`);
    const content = fs.readFileSync(envPath, "utf-8");
    assert.ok(
      content.includes("baseUrl"),
      ".napenv should define baseUrl variable"
    );
    assert.ok(
      content.includes("petId"),
      ".napenv should define petId variable"
    );
  });

  test("configuration property for defaultEnvironment is readable", () => {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const envValue = config.get<string>(CONFIG_DEFAULT_ENV);
    assert.ok(
      envValue !== undefined,
      "defaultEnvironment config should be readable (may be empty string)"
    );
  });

  test("switchEnvironment command is registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes(CMD_SWITCH_ENV),
      "switchEnvironment command should be registered"
    );
  });

  test("package.json declares defaultEnvironment configuration", () => {
    const packageJsonPath = getExtensionPath("package.json");
    const raw = fs.readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(raw) as {
      contributes: {
        configuration: {
          properties: Record<string, { type: string; default: string }>;
        };
      };
    };

    const envProp =
      packageJson.contributes.configuration.properties["napper.defaultEnvironment"];
    assert.ok(envProp, "defaultEnvironment property should exist");
    assert.strictEqual(
      envProp.type,
      "string",
      "defaultEnvironment should be a string type"
    );
  });
});
