// VSCode adapter for the Explorer tree view
// This is the only file that touches the vscode SDK for the explorer

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  type TreeNode,
  createFileNode,
  createFolderNode,
  createPlaylistNode,
  createPlaylistSectionNode,
  parsePlaylistStepPaths,
} from "./explorerProvider";
import { type RunResult, RunState } from "./types";
import {
  NAP_EXTENSION,
  NAPLIST_EXTENSION,
  CONTEXT_PLAYLIST,
  CONTEXT_PLAYLIST_SECTION,
  CONTEXT_SCRIPT_FILE,
  ICON_PLAYLIST_SECTION,
  ICON_PLAYLIST_FILE,
  ICON_IDLE,
  ICON_RUNNING,
  ICON_PASSED,
  ICON_FAILED,
  ICON_ERROR,
  BADGE_PASSED,
  BADGE_FAILED,
  BADGE_ERROR,
  THEME_COLOR_PASSED,
  THEME_COLOR_FAILED,
  THEME_COLOR_ERROR,
  CMD_VSCODE_OPEN,
  ENCODING_UTF8,
} from "./constants";

const OPEN_COMMAND_TITLE = "Open";
const EMPTY_STRING = "";

const RUN_STATE_ICONS: Record<RunState, string> = {
  [RunState.Idle]: ICON_IDLE,
  [RunState.Running]: ICON_RUNNING,
  [RunState.Passed]: ICON_PASSED,
  [RunState.Failed]: ICON_FAILED,
  [RunState.Error]: ICON_ERROR,
};

const RUN_STATE_COLORS: Record<RunState, string | undefined> = {
  [RunState.Idle]: undefined,
  [RunState.Running]: undefined,
  [RunState.Passed]: THEME_COLOR_PASSED,
  [RunState.Failed]: THEME_COLOR_FAILED,
  [RunState.Error]: THEME_COLOR_ERROR,
};

const hasChildren = (node: TreeNode): boolean =>
  node.isDirectory || (node.children !== undefined && node.children.length > 0);

const applyPlaylistSectionStyle = (
  item: vscode.TreeItem,
): void => {
  item.iconPath = new vscode.ThemeIcon(ICON_PLAYLIST_SECTION);
};

const applyDirectoryStyle = (
  item: vscode.TreeItem,
  node: TreeNode,
): void => {
  item.resourceUri = vscode.Uri.file(node.filePath);
  item.iconPath = vscode.ThemeIcon.Folder;
};

const runStateIcon = (state: RunState): vscode.ThemeIcon => {
  const color = RUN_STATE_COLORS[state];
  return new vscode.ThemeIcon(
    RUN_STATE_ICONS[state],
    color !== undefined ? new vscode.ThemeColor(color) : undefined,
  );
};

const applyFileStyle = (
  item: vscode.TreeItem,
  node: TreeNode,
): void => {
  item.resourceUri = vscode.Uri.file(node.filePath);
  item.command = {
    command: CMD_VSCODE_OPEN,
    title: OPEN_COMMAND_TITLE,
    arguments: [vscode.Uri.file(node.filePath)],
  };
  if (node.contextValue === CONTEXT_PLAYLIST) {
    item.iconPath = new vscode.ThemeIcon(ICON_PLAYLIST_FILE);
    return;
  }
  if (node.contextValue === CONTEXT_SCRIPT_FILE) {
    return;
  }
  item.description = node.httpMethod ?? EMPTY_STRING;
  item.iconPath = runStateIcon(node.runState);
};

class ExplorerTreeItem extends vscode.TreeItem {
  constructor(node: TreeNode) {
    super(
      node.label,
      hasChildren(node)
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.contextValue = node.contextValue;
    if (node.contextValue === CONTEXT_PLAYLIST_SECTION) {
      applyPlaylistSectionStyle(this);
    } else if (node.isDirectory) {
      applyDirectoryStyle(this, node);
    } else {
      applyFileStyle(this, node);
    }
  }
}

function buildStepNode(
  stepFull: string,
  results: ReadonlyMap<string, RunResult>,
): TreeNode | undefined {
  if (!fs.existsSync(stepFull)) {
    return undefined;
  }
  if (stepFull.endsWith(NAPLIST_EXTENSION)) {
    const nested = buildPlaylistStepNodes(stepFull, results);
    return createPlaylistNode(stepFull, results, nested);
  }
  const content = fs.readFileSync(stepFull, ENCODING_UTF8);
  return createFileNode(stepFull, content, results);
}

function buildPlaylistStepNodes(
  naplistPath: string,
  results: ReadonlyMap<string, RunResult>,
): TreeNode[] {
  const content = fs.readFileSync(naplistPath, ENCODING_UTF8);
  const stepRelPaths = parsePlaylistStepPaths(content);
  const basePath = path.dirname(naplistPath);
  const stepNodes: TreeNode[] = [];
  for (const rel of stepRelPaths) {
    const node = buildStepNode(path.resolve(basePath, rel), results);
    if (node !== undefined) {
      stepNodes.push(node);
    }
  }
  return stepNodes;
}

const runStateBadge = (
  result: RunResult,
): vscode.FileDecoration | undefined => {
  if (result.error !== undefined) {
    return new vscode.FileDecoration(
      BADGE_ERROR,
      result.error,
      new vscode.ThemeColor(THEME_COLOR_ERROR),
    );
  }
  return result.passed
    ? new vscode.FileDecoration(
        BADGE_PASSED,
        undefined,
        new vscode.ThemeColor(THEME_COLOR_PASSED),
      )
    : new vscode.FileDecoration(
        BADGE_FAILED,
        undefined,
        new vscode.ThemeColor(THEME_COLOR_FAILED),
      );
};

export class ExplorerAdapter
  implements
    vscode.TreeDataProvider<TreeNode>,
    vscode.FileDecorationProvider
{
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly _onDidChangeFileDecorations =
    new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  private readonly _results = new Map<string, RunResult>();

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const result = this._results.get(uri.fsPath);
    if (result === undefined) {
      return undefined;
    }
    return runStateBadge(result);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  clearResults(): void {
    this._results.clear();
    this._onDidChangeFileDecorations.fire(undefined);
    this.refresh();
  }

  updateResult(filePath: string, result: RunResult): void {
    this._results.set(filePath, result);
    this._onDidChangeFileDecorations.fire(vscode.Uri.file(filePath));
    this.refresh();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return new ExplorerTreeItem(element);
  }

  getChildren(element?: TreeNode): TreeNode[] {
    const folders = vscode.workspace.workspaceFolders;
    const firstFolder = folders?.[0];
    if (firstFolder === undefined) {
      return [];
    }

    if (element === undefined) {
      const root = firstFolder.uri.fsPath;
      const fileTree = this._buildTree(root);
      const playlistSection = this._buildPlaylistSection(root);
      return [...fileTree, playlistSection];
    }

    if (element.isDirectory) {
      return this._buildTree(element.filePath);
    }

    return element.children !== undefined ? [...element.children] : [];
  }

  private _buildPlaylistSection(rootPath: string): TreeNode {
    const naplistPaths = this._collectNaplistFiles(rootPath);
    const playlistNodes = naplistPaths.map((fp) => {
      const stepNodes = buildPlaylistStepNodes(fp, this._results);
      return createPlaylistNode(fp, this._results, stepNodes);
    });
    return createPlaylistSectionNode(playlistNodes);
  }

  private _collectNaplistFiles(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...this._collectNaplistFiles(fullPath));
      } else if (entry.name.endsWith(NAPLIST_EXTENSION)) {
        results.push(fullPath);
      }
    }
    return results.sort((a, b) => a.localeCompare(b));
  }

  private _buildFileNode(fullPath: string): TreeNode {
    const content = fs.readFileSync(fullPath, ENCODING_UTF8);
    return createFileNode(fullPath, content, this._results);
  }

  private _buildNaplistNode(fullPath: string): TreeNode {
    const stepNodes = buildPlaylistStepNodes(fullPath, this._results);
    return createPlaylistNode(fullPath, this._results, stepNodes);
  }

  private _sortedVisibleEntries(dirPath: string): fs.Dirent[] {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith("."))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) {
          return -1;
        }
        if (!a.isDirectory() && b.isDirectory()) {
          return 1;
        }
        return a.name.localeCompare(b.name);
      });
  }

  private _buildEntryNode(
    entry: fs.Dirent,
    fullPath: string,
  ): TreeNode | undefined {
    if (entry.isDirectory()) {
      const children = this._buildTree(fullPath);
      return children.length > 0
        ? createFolderNode(fullPath, children)
        : undefined;
    }
    if (entry.name.endsWith(NAPLIST_EXTENSION)) {
      return this._buildNaplistNode(fullPath);
    }
    if (entry.name.endsWith(NAP_EXTENSION)) {
      return this._buildFileNode(fullPath);
    }
    return undefined;
  }

  private _buildTree(dirPath: string): TreeNode[] {
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    const sorted = this._sortedVisibleEntries(dirPath);
    const nodes: TreeNode[] = [];
    for (const entry of sorted) {
      const node = this._buildEntryNode(
        entry,
        path.join(dirPath, entry.name),
      );
      if (node !== undefined) {
        nodes.push(node);
      }
    }
    return nodes;
  }
}
