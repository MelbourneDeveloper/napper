// Specs: vscode-settings, vscode-commands
// File system watchers and auto-run registration for .nap/.naplist files

import * as vscode from "vscode";
import type { ExplorerAdapter } from "./explorerAdapter";
import type { Logger } from "./logger";
import {
  CONFIG_AUTO_RUN,
  CONFIG_SECTION,
  LOG_MSG_TREE_REFRESH,
  NAPLIST_EXTENSION,
  NAPLIST_GLOB,
  NAP_EXTENSION,
  NAP_GLOB,
} from "./constants";

const isNapperFile = (fileName: string): boolean =>
  fileName.endsWith(NAP_EXTENSION) || fileName.endsWith(NAPLIST_EXTENSION);

export const registerWatchers = (
  context: vscode.ExtensionContext,
  explorer: ExplorerAdapter,
  log: Logger,
): void => {
  const napWatcher = vscode.workspace.createFileSystemWatcher(NAP_GLOB),
   naplistWatcher = vscode.workspace.createFileSystemWatcher(NAPLIST_GLOB),
   refreshExplorer = (): void => {
    log.debug(LOG_MSG_TREE_REFRESH);
    explorer.refresh();
  };
  napWatcher.onDidCreate(refreshExplorer);
  napWatcher.onDidDelete(refreshExplorer);
  napWatcher.onDidChange(refreshExplorer);
  naplistWatcher.onDidCreate(refreshExplorer);
  naplistWatcher.onDidDelete(refreshExplorer);
  naplistWatcher.onDidChange(refreshExplorer);
  context.subscriptions.push(napWatcher, naplistWatcher);
};

export const registerAutoRun = (
  context: vscode.ExtensionContext,
  onRunFile: (uri: vscode.Uri) => Promise<void>,
): void => {
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const config = vscode.workspace.getConfiguration(CONFIG_SECTION),
       autoRun = config.get<boolean>(CONFIG_AUTO_RUN, false);
      if (autoRun && isNapperFile(doc.fileName)) {
        onRunFile(doc.uri).catch(() => undefined);
      }
    }),
  );
};
