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
  ICON_PLAYLIST_SECTION,
  ICON_PLAYLIST_FILE,
  ICON_IDLE,
  ICON_RUNNING,
  ICON_PASSED,
  ICON_FAILED,
  ICON_ERROR,
  THEME_COLOR_PASSED,
  THEME_COLOR_FAILED,
  THEME_COLOR_ERROR,
  CMD_VSCODE_OPEN,
  ENCODING_UTF8,
} from "./constants";

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

class ExplorerTreeItem extends vscode.TreeItem {
  constructor(node: TreeNode) {
    super(
      node.label,
      hasChildren(node)
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    this.contextValue = node.contextValue;

    if (node.contextValue === CONTEXT_PLAYLIST_SECTION) {
      this.iconPath = new vscode.ThemeIcon(ICON_PLAYLIST_SECTION);
      return;
    }

    this.resourceUri = vscode.Uri.file(node.filePath);

    if (node.isDirectory) {
      this.iconPath = vscode.ThemeIcon.Folder;
      return;
    }

    this.command = {
      command: CMD_VSCODE_OPEN,
      title: "Open",
      arguments: [vscode.Uri.file(node.filePath)],
    };

    if (node.contextValue === CONTEXT_PLAYLIST) {
      this.iconPath = new vscode.ThemeIcon(ICON_PLAYLIST_FILE);
      return;
    }

    this.description = node.httpMethod || "";
    const color = RUN_STATE_COLORS[node.runState];
    this.iconPath = new vscode.ThemeIcon(
      RUN_STATE_ICONS[node.runState],
      color ? new vscode.ThemeColor(color) : undefined
    );
  }
}

const buildPlaylistStepNodes = (
  naplistPath: string,
  results: ReadonlyMap<string, RunResult>
): TreeNode[] => {
  const content = fs.readFileSync(naplistPath, ENCODING_UTF8);
  const stepRelPaths = parsePlaylistStepPaths(content);
  const basePath = path.dirname(naplistPath);
  const stepNodes: TreeNode[] = [];
  for (const rel of stepRelPaths) {
    const stepFull = path.resolve(basePath, rel);
    if (fs.existsSync(stepFull)) {
      if (stepFull.endsWith(NAPLIST_EXTENSION)) {
        const nestedChildren = buildPlaylistStepNodes(stepFull, results);
        stepNodes.push(createPlaylistNode(stepFull, results, nestedChildren));
      } else {
        const stepContent = fs.readFileSync(stepFull, ENCODING_UTF8);
        stepNodes.push(createFileNode(stepFull, stepContent, results));
      }
    }
  }
  return stepNodes;
};

export class ExplorerAdapter
  implements vscode.TreeDataProvider<TreeNode>
{
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _results = new Map<string, RunResult>();

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  clearResults(): void {
    this._results.clear();
    this.refresh();
  }

  updateResult(filePath: string, result: RunResult): void {
    this._results.set(filePath, result);
    this.refresh();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return new ExplorerTreeItem(element);
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (!vscode.workspace.workspaceFolders) return [];

    if (!element) {
      const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
      const fileTree = this._buildTree(root);
      const playlistSection = this._buildPlaylistSection(root);
      return [...fileTree, playlistSection];
    }

    if (element.isDirectory) {
      return this._buildTree(element.filePath);
    }

    return element.children ? [...element.children] : [];
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
    if (!fs.existsSync(dirPath)) return [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
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

  private _buildTree(dirPath: string): TreeNode[] {
    if (!fs.existsSync(dirPath)) return [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const nodes: TreeNode[] = [];

    const sortedEntries = entries
      .filter((e) => !e.name.startsWith("."))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    for (const entry of sortedEntries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const children = this._buildTree(fullPath);
        if (children.length > 0) {
          nodes.push(createFolderNode(fullPath, children));
        }
      } else if (entry.name.endsWith(NAPLIST_EXTENSION)) {
        nodes.push(this._buildNaplistNode(fullPath));
      } else if (entry.name.endsWith(NAP_EXTENSION)) {
        nodes.push(this._buildFileNode(fullPath));
      }
    }

    return nodes;
  }
}
