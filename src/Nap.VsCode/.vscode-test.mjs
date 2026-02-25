import { defineConfig } from "@vscode/test-cli";
import { cpSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const testWorkspace = mkdtempSync(join(tmpdir(), "napper-test-"));
cpSync("./src/test/fixtures/workspace", testWorkspace, { recursive: true });

// No custom settings needed — CLI resolves from extension path via context.extensionPath

const userDataDir = resolve(__dirname, ".vscode-test/user-data");

export default defineConfig({
  files: ["out/test/e2e/**/*.test.js"],
  version: "stable",
  workspaceFolder: testWorkspace,
  extensionDevelopmentPath: "./",
  mocha: {
    ui: "tdd",
    timeout: 60000,
    color: true,
    slow: 10000,
  },
  launchArgs: [
    "--disable-gpu",
    "--user-data-dir", userDataDir,
    "--new-window",
    "--disable-workspace-trust",
  ],
});
