// Context menu command handlers for tree view items
// Scripts: Add to Playlist, Performance Test, Delete
// Playlists: Add .nap, Add Script, Delete, Duplicate, Copy Path

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import type { ExplorerAdapter } from "./explorerAdapter";
import {
  appendStepToPlaylist,
  updatePlaylistName,
} from "./explorerProvider";
import {
  NAPLIST_GLOB,
  NAP_GLOB,
  NAPLIST_EXTENSION,
  SCRIPT_GLOB,
  ENCODING_UTF8,
  PROMPT_SELECT_PLAYLIST,
  PROMPT_SELECT_NAP_FILE,
  PROMPT_SELECT_SCRIPT_FILE,
  PROMPT_CONFIRM_DELETE_PREFIX,
  PROMPT_CONFIRM_DELETE_SUFFIX,
  PROMPT_DUPLICATE_NAME,
  CONFIRM_YES,
  CONFIRM_NO,
  MSG_ADDED_TO_PLAYLIST,
  MSG_FILE_DELETED,
  MSG_PLAYLIST_DUPLICATED,
  MSG_PATH_COPIED,
  MSG_PERF_TEST_COMING_SOON,
  MSG_NO_PLAYLISTS,
  MSG_NO_NAP_FILES,
  MSG_NO_SCRIPT_FILES,
  DUPLICATE_SUFFIX,
  CMD_ADD_TO_PLAYLIST,
  CMD_PERF_TEST,
  CMD_DELETE_FILE,
  CMD_ADD_NAP_TO_PLAYLIST,
  CMD_ADD_SCRIPT_TO_PLAYLIST,
  CMD_DUPLICATE_PLAYLIST,
  CMD_COPY_PATH,
} from "./constants";

interface FilePickItem extends vscode.QuickPickItem {
  readonly uri: vscode.Uri;
}

const workspaceRoot = (): string | undefined =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

const toPickItems = (
  uris: readonly vscode.Uri[],
  root: string
): readonly FilePickItem[] =>
  uris.map((uri) => ({
    label: path.relative(root, uri.fsPath),
    uri,
  }));

const writeStepToPlaylist = async (
  playlistPath: string,
  pickedFilePath: string,
  explorer: ExplorerAdapter
): Promise<void> => {
  const playlistDir = path.dirname(playlistPath);
  const relStep = path.relative(playlistDir, pickedFilePath);
  const content = fs.readFileSync(playlistPath, ENCODING_UTF8);
  const updated = appendStepToPlaylist(content, relStep);
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(playlistPath),
    Buffer.from(updated, ENCODING_UTF8)
  );
  await vscode.window.showInformationMessage(
    `${MSG_ADDED_TO_PLAYLIST}${path.basename(playlistPath)}`
  );
  explorer.refresh();
};

const pickFileFromGlob = async (
  glob: string,
  prompt: string,
  emptyMsg: string
): Promise<FilePickItem | undefined> => {
  const files = await vscode.workspace.findFiles(glob);
  if (files.length === 0) {
    await vscode.window.showInformationMessage(emptyMsg);
    return undefined;
  }
  const root = workspaceRoot();
  if (root === undefined) { return undefined; }
  return await vscode.window.showQuickPick(
    toPickItems(files, root),
    { placeHolder: prompt }
  );
};

const addFileToPlaylist = async ({
  playlistPath,
  glob,
  prompt,
  emptyMsg,
  explorer,
}: {
  readonly playlistPath: string;
  readonly glob: string;
  readonly prompt: string;
  readonly emptyMsg: string;
  readonly explorer: ExplorerAdapter;
}): Promise<void> => {
  const picked = await pickFileFromGlob(glob, prompt, emptyMsg);
  if (picked === undefined) { return; }
  await writeStepToPlaylist(playlistPath, picked.uri.fsPath, explorer);
};

export const addToPlaylist = async (
  filePath: string,
  explorer: ExplorerAdapter
): Promise<void> => {
  const picked = await pickFileFromGlob(
    NAPLIST_GLOB,
    PROMPT_SELECT_PLAYLIST,
    MSG_NO_PLAYLISTS
  );
  if (picked === undefined) { return; }
  await writeStepToPlaylist(picked.uri.fsPath, filePath, explorer);
};

export const performanceTest = async (): Promise<void> => {
  await vscode.window.showInformationMessage(MSG_PERF_TEST_COMING_SOON);
};

const confirmDelete = async (
  fileName: string
): Promise<boolean> => {
  const answer = await vscode.window.showWarningMessage(
    `${PROMPT_CONFIRM_DELETE_PREFIX}${fileName}${PROMPT_CONFIRM_DELETE_SUFFIX}`,
    CONFIRM_YES,
    CONFIRM_NO
  );
  return answer === CONFIRM_YES;
};

export const deleteFile = async (
  filePath: string,
  explorer: ExplorerAdapter
): Promise<void> => {
  const fileName = path.basename(filePath);
  const confirmed = await confirmDelete(fileName);
  if (!confirmed) { return; }
  await vscode.workspace.fs.delete(vscode.Uri.file(filePath));
  await vscode.window.showInformationMessage(
    `${MSG_FILE_DELETED}${fileName}`
  );
  explorer.refresh();
};

export const addNapToPlaylist = async (
  playlistPath: string,
  explorer: ExplorerAdapter
): Promise<void> => {
  await addFileToPlaylist({
    playlistPath,
    glob: NAP_GLOB,
    prompt: PROMPT_SELECT_NAP_FILE,
    emptyMsg: MSG_NO_NAP_FILES,
    explorer,
  });
};

export const addScriptToPlaylist = async (
  playlistPath: string,
  explorer: ExplorerAdapter
): Promise<void> => {
  await addFileToPlaylist({
    playlistPath,
    glob: SCRIPT_GLOB,
    prompt: PROMPT_SELECT_SCRIPT_FILE,
    emptyMsg: MSG_NO_SCRIPT_FILES,
    explorer,
  });
};

interface DuplicateContext {
  readonly newPath: string;
  readonly content: string;
  readonly newName: string;
  readonly explorer: ExplorerAdapter;
}

const writeDuplicate = async (ctx: DuplicateContext): Promise<void> => {
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(ctx.newPath),
    Buffer.from(ctx.content, ENCODING_UTF8)
  );
  const doc = await vscode.workspace.openTextDocument(ctx.newPath);
  await vscode.window.showTextDocument(doc);
  await vscode.window.showInformationMessage(
    `${MSG_PLAYLIST_DUPLICATED}${ctx.newName}`
  );
  ctx.explorer.refresh();
};

export const duplicatePlaylist = async (
  playlistPath: string,
  explorer: ExplorerAdapter
): Promise<void> => {
  const baseName = path.basename(playlistPath, NAPLIST_EXTENSION);
  const newName = await vscode.window.showInputBox({
    prompt: PROMPT_DUPLICATE_NAME,
    value: `${baseName}${DUPLICATE_SUFFIX}`,
  });
  if (newName === undefined) { return; }
  const newPath = path.join(
    path.dirname(playlistPath),
    `${newName}${NAPLIST_EXTENSION}`
  );
  const content = fs.readFileSync(playlistPath, ENCODING_UTF8);
  const updated = updatePlaylistName(content, newName);
  await writeDuplicate({ newPath, content: updated, newName, explorer });
};

export const copyPath = async (filePath: string): Promise<void> => {
  await vscode.env.clipboard.writeText(filePath);
  await vscode.window.showInformationMessage(MSG_PATH_COPIED);
};

interface NodeArg {
  readonly filePath?: string;
}

const withFilePath = (
  handler: (fp: string) => Promise<void>
): ((arg?: NodeArg) => Promise<void>) =>
  async (arg?: NodeArg): Promise<void> => {
    const fp = arg?.filePath;
    if (fp !== undefined) { await handler(fp); }
  };

const registerScriptCommands = (
  context: vscode.ExtensionContext,
  explorer: ExplorerAdapter
): void => {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      CMD_ADD_TO_PLAYLIST,
      withFilePath(async (fp) => { await addToPlaylist(fp, explorer); })
    ),
    vscode.commands.registerCommand(CMD_PERF_TEST, performanceTest),
    vscode.commands.registerCommand(
      CMD_DELETE_FILE,
      withFilePath(async (fp) => { await deleteFile(fp, explorer); })
    )
  );
};

const registerPlaylistAddCommands = (
  context: vscode.ExtensionContext,
  explorer: ExplorerAdapter
): void => {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      CMD_ADD_NAP_TO_PLAYLIST,
      withFilePath(async (fp) => { await addNapToPlaylist(fp, explorer); })
    ),
    vscode.commands.registerCommand(
      CMD_ADD_SCRIPT_TO_PLAYLIST,
      withFilePath(async (fp) => { await addScriptToPlaylist(fp, explorer); })
    )
  );
};

const registerPlaylistEditCommands = (
  context: vscode.ExtensionContext,
  explorer: ExplorerAdapter
): void => {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      CMD_DUPLICATE_PLAYLIST,
      withFilePath(async (fp) => { await duplicatePlaylist(fp, explorer); })
    ),
    vscode.commands.registerCommand(
      CMD_COPY_PATH,
      withFilePath(async (fp) => { await copyPath(fp); })
    )
  );
};

export const registerContextMenuCommands = (
  context: vscode.ExtensionContext,
  explorer: ExplorerAdapter
): void => {
  registerScriptCommands(context, explorer);
  registerPlaylistAddCommands(context, explorer);
  registerPlaylistEditCommands(context, explorer);
};
