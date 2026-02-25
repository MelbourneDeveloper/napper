import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

const EXTENSION_ID = "nimblesite.napper";

interface TestContext {
  readonly extension: vscode.Extension<unknown>;
  readonly workspaceRoot: string;
}

export const activateExtension = async (): Promise<TestContext> => {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  if (!extension) {
    throw new Error(`Extension ${EXTENSION_ID} not found`);
  }

  if (!extension.isActive) {
    await extension.activate();
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error("No workspace folder open");
  }

  const firstFolder = workspaceFolders[0];
  if (!firstFolder) {
    throw new Error("No workspace folder open");
  }

  return {
    extension,
    workspaceRoot: firstFolder.uri.fsPath,
  };
};

export const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const getFixturePath = (relativePath: string): string => {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error("No workspace folder open");
  }
  const firstFolder = workspaceFolders[0];
  if (!firstFolder) {
    throw new Error("No workspace folder open");
  }
  return path.join(firstFolder.uri.fsPath, relativePath);
};

export const getExtensionPath = (relativePath: string): string => {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  if (!extension) {
    throw new Error(`Extension ${EXTENSION_ID} not found`);
  }
  return path.join(extension.extensionPath, relativePath);
};

export const fileExists = (filePath: string): boolean =>
  fs.existsSync(filePath);

export const readFixtureFile = (relativePath: string): string =>
  fs.readFileSync(getFixturePath(relativePath), "utf-8");

export const writeFixtureFile = (
  relativePath: string,
  content: string
): void => {
  const fullPath = getFixturePath(relativePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, content, "utf-8");
};

export const deleteFixtureFile = (relativePath: string): void => {
  const fullPath = getFixturePath(relativePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};

export const waitForCondition = async (
  condition: () => Promise<boolean>,
  timeout = 10000,
  interval = 200
): Promise<void> => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(interval);
  }
  throw new Error(`Condition not met within ${timeout}ms`);
};

export const executeCommand = async <T>(
  command: string,
  ...args: unknown[]
): Promise<T> => vscode.commands.executeCommand<T>(command, ...args);

export const getRegisteredCommands = async (): Promise<string[]> =>
  vscode.commands.getCommands(true);

export const openDocument = async (
  relativePath: string
): Promise<vscode.TextDocument> => {
  const fullPath = getFixturePath(relativePath);
  const doc = await vscode.workspace.openTextDocument(fullPath);
  await vscode.window.showTextDocument(doc);
  return doc;
};

export const closeAllEditors = async (): Promise<void> => {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
};
