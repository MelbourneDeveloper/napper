// File creation commands — newRequest, newPlaylist
// Extracted from extension.ts to keep files under 450 LOC

import * as vscode from "vscode";
import * as path from "path";
import type { ExplorerAdapter } from "./explorerAdapter";
import {
  HTTP_METHODS,
  NAP_EXTENSION,
  NAPLIST_EXTENSION,
  SECTION_META,
  SECTION_STEPS,
  ENCODING_UTF8,
  PROMPT_SELECT_METHOD,
  PROMPT_ENTER_URL,
  PROMPT_REQUEST_NAME,
  PROMPT_PLAYLIST_NAME,
  PLACEHOLDER_URL,
  DEFAULT_PLAYLIST_NAME,
  REQUEST_NAME_SUFFIX,
  NAP_NAME_KEY_PREFIX,
  NAP_NAME_KEY_SUFFIX,
} from "./constants";

const promptMethod = (): Thenable<string | undefined> =>
  vscode.window.showQuickPick(
    HTTP_METHODS.map((m) => m),
    { placeHolder: PROMPT_SELECT_METHOD }
  );

const promptUrl = (): Thenable<string | undefined> =>
  vscode.window.showInputBox({
    prompt: PROMPT_ENTER_URL,
    placeHolder: PLACEHOLDER_URL,
  });

const promptFileName = (
  defaultValue: string
): Thenable<string | undefined> =>
  vscode.window.showInputBox({
    prompt: PROMPT_REQUEST_NAME,
    value: defaultValue,
  });

const writeAndOpen = async (
  filePath: string,
  content: string,
  explorer: ExplorerAdapter
): Promise<void> => {
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(filePath),
    Buffer.from(content, ENCODING_UTF8)
  );
  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc);
  explorer.refresh();
};

const getWorkspacePath = (): string | undefined =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

export const newRequest = async (
  explorer: ExplorerAdapter
): Promise<void> => {
  const method = await promptMethod();
  if (method === undefined) { return; }
  const url = await promptUrl();
  if (url === undefined) { return; }
  const cwd = getWorkspacePath();
  if (cwd === undefined) { return; }
  const defaultName = `${method.toLowerCase()}${REQUEST_NAME_SUFFIX}`;
  const name = await promptFileName(defaultName);
  if (name === undefined) { return; }

  const filePath = path.join(cwd, `${name}${NAP_EXTENSION}`);
  await writeAndOpen(filePath, `${method} ${url}\n`, explorer);
};

export const newPlaylist = async (
  explorer: ExplorerAdapter
): Promise<void> => {
  const cwd = getWorkspacePath();
  if (cwd === undefined) { return; }

  const name = await vscode.window.showInputBox({
    prompt: PROMPT_PLAYLIST_NAME,
    value: DEFAULT_PLAYLIST_NAME,
  });
  if (name === undefined) { return; }

  const filePath = path.join(cwd, `${name}${NAPLIST_EXTENSION}`);
  const content =
    `${SECTION_META}\n${NAP_NAME_KEY_PREFIX}${name}${NAP_NAME_KEY_SUFFIX}\n\n${SECTION_STEPS}\n`;
  await writeAndOpen(filePath, content, explorer);
};
