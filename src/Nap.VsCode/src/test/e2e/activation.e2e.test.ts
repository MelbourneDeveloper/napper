import * as assert from "assert";
import * as fs from "fs";
import {
  activateExtension,
  getExtensionPath,
  getRegisteredCommands,
  sleep,
} from "../helpers/helpers";
import {
  CMD_COPY_CURL,
  CMD_NEW_PLAYLIST,
  CMD_NEW_REQUEST,
  CMD_OPEN_RESPONSE,
  CMD_RUN_ALL,
  CMD_RUN_FILE,
  CMD_SWITCH_ENV,
  NAPENV_EXTENSION,
  NAPLIST_EXTENSION,
  NAP_EXTENSION,
  VIEW_EXPLORER,
} from "../../constants";

suite("Extension Activation", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(3000);
  });

  test("extension activates successfully", async () => {
    const ctx = await activateExtension();
    assert.strictEqual(
      ctx.extension.isActive,
      true,
      "Extension should be active"
    );
  });

  test("all commands are registered", async () => {
    const commands = await getRegisteredCommands(),

     expectedCommands = [
      CMD_RUN_FILE,
      CMD_RUN_ALL,
      CMD_NEW_REQUEST,
      CMD_NEW_PLAYLIST,
      CMD_SWITCH_ENV,
      CMD_COPY_CURL,
      CMD_OPEN_RESPONSE,
    ];

    for (const cmd of expectedCommands) {
      assert.ok(
        commands.includes(cmd),
        `Command ${cmd} should be registered`
      );
    }
  });

  test("package.json declares all views in napper-panel container", () => {
    const packageJsonPath = getExtensionPath("package.json"),
     raw = fs.readFileSync(packageJsonPath, "utf-8"),
     packageJson = JSON.parse(raw) as {
      contributes: {
        views: Record<string, { id: string }[]>;
      };
    },

     napperPanelViews = packageJson.contributes.views["napper-panel"];
    assert.ok(
      Array.isArray(napperPanelViews),
      "napper-panel view container should exist"
    );

    const viewIds = napperPanelViews.map((v) => v.id);
    assert.ok(
      viewIds.includes(VIEW_EXPLORER),
      "napperExplorer view should be declared"
    );
  });

  test("package.json registers all three languages", () => {
    const packageJsonPath = getExtensionPath("package.json"),
     raw = fs.readFileSync(packageJsonPath, "utf-8"),
     packageJson = JSON.parse(raw) as {
      contributes: {
        languages: { id: string; extensions: string[] }[];
      };
    },

     {languages} = packageJson.contributes,
     langIds = languages.map((l) => l.id);

    assert.ok(langIds.includes("nap"), "nap language should be registered");
    assert.ok(
      langIds.includes("naplist"),
      "naplist language should be registered"
    );
    assert.ok(
      langIds.includes("napenv"),
      "napenv language should be registered"
    );

    const napLang = languages.find((l) => l.id === "nap");
    assert.ok(napLang !== undefined, "nap language must be registered");
    assert.ok(
      napLang.extensions.includes(NAP_EXTENSION),
      ".nap extension should be associated"
    );

    const naplistLang = languages.find((l) => l.id === "naplist");
    assert.ok(naplistLang !== undefined, "naplist language must be registered");
    assert.ok(
      naplistLang.extensions.includes(NAPLIST_EXTENSION),
      ".naplist extension should be associated"
    );

    const napenvLang = languages.find((l) => l.id === "napenv");
    assert.ok(napenvLang !== undefined, "napenv language must be registered");
    assert.ok(
      napenvLang.extensions.includes(NAPENV_EXTENSION),
      ".napenv extension should be associated"
    );
  });

  test("package.json declares all configuration properties", () => {
    const packageJsonPath = getExtensionPath("package.json"),
     raw = fs.readFileSync(packageJsonPath, "utf-8"),
     packageJson = JSON.parse(raw) as {
      contributes: {
        configuration: {
          properties: Record<string, unknown>;
        };
      };
    },

     props = packageJson.contributes.configuration.properties,
     expectedKeys = [
      "napper.defaultEnvironment",
      "napper.autoRunOnSave",
      "napper.splitEditorLayout",
      "napper.maskSecretsInPreview",
      "napper.cliPath",
    ];

    for (const key of expectedKeys) {
      assert.ok(
        key in props,
        `Configuration property ${key} should be declared`
      );
    }
  });

  test("package.json declares context menu for napperExplorer", () => {
    const packageJsonPath = getExtensionPath("package.json"),
     raw = fs.readFileSync(packageJsonPath, "utf-8"),
     packageJson = JSON.parse(raw) as {
      contributes: {
        menus: {
          "view/item/context": {
            command: string;
            when: string;
          }[];
        };
      };
    },

     contextMenus = packageJson.contributes.menus["view/item/context"],
     runFileMenu = contextMenus.find(
      (m) => m.command === CMD_RUN_FILE
    );
    assert.ok(
      runFileMenu,
      "runFile context menu should exist for explorer items"
    );
  });
});
