// Napper VSCode Extension — main entry point
// Registers all providers, commands, and file watchers

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ExplorerAdapter } from "./explorerAdapter";
import { CodeLensProvider } from "./codeLensProvider";
import { EnvironmentStatusBar } from "./environmentAdapter";
import { ResponsePanel } from "./responsePanel";
import { PlaylistPanel } from "./playlistPanel";
import { runCli, streamCli } from "./cliRunner";
import type { RunResult } from "./types";
import { parsePlaylistStepPaths } from "./explorerProvider";
import { generatePlaylistReport } from "./reportGenerator";
import { createLogger, type Logger } from "./logger";
import {
  isCliInstalled,
  installedCliPath,
  installCli,
  localBinaryName,
} from "./cliInstaller";
import { newRequest, newPlaylist } from "./fileCreation";
import { copyAsCurl } from "./curlCopy";
import { importOpenApi } from "./openApiImport";
import {
  VIEW_EXPLORER,
  CMD_RUN_FILE,
  CMD_RUN_ALL,
  CMD_NEW_REQUEST,
  CMD_NEW_PLAYLIST,
  CMD_SWITCH_ENV,
  CMD_COPY_CURL,
  CMD_OPEN_RESPONSE,
  CONFIG_SECTION,
  CONFIG_CLI_PATH,
  CONFIG_SPLIT_LAYOUT,
  CONFIG_AUTO_RUN,
  NAP_EXTENSION,
  NAPLIST_EXTENSION,
  NAP_GLOB,
  NAPLIST_GLOB,
  DEFAULT_CLI_PATH,
  LAYOUT_BESIDE,
  LAYOUT_BELOW,
  ENCODING_UTF8,
  LANG_NAP,
  LANG_NAPLIST,
  MSG_NO_FILE_SELECTED,
  MSG_NO_RESPONSE,
  REPORT_FILE_EXTENSION,
  REPORT_FILE_SUFFIX,
  REPORT_SAVED_MSG,
  CMD_SAVE_REPORT,
  CMD_IMPORT_OPENAPI,
  LOG_CHANNEL_NAME,
  LOG_MSG_ACTIVATED,
  LOG_MSG_DEACTIVATED,
  LOG_MSG_RUN_FILE,
  LOG_MSG_RUN_PLAYLIST,
  LOG_MSG_CLI_RESULT_COUNT,
  LOG_MSG_CLI_SPAWN_ERROR,
  LOG_MSG_STREAM_RESULT,
  LOG_MSG_STREAM_DONE,
  LOG_MSG_TREE_REFRESH,
  CLI_INSTALL_MSG,
  CLI_INSTALL_COMPLETE_MSG,
  CLI_INSTALL_FAILED_MSG,
  CLI_BIN_DIR,
  CLI_ERROR_PREFIX,
  STATUS_RUNNING_ICON,
  STATUS_RUNNING_SUFFIX,
  PROP_FILE_PATH,
} from "./constants";

let explorerProvider: ExplorerAdapter;
let envStatusBar: EnvironmentStatusBar;
let responsePanel: ResponsePanel;
let playlistPanel: PlaylistPanel;
let lastResult: RunResult | undefined;
let lastPlaylistReport: (() => void) | undefined;
let logger: Logger;

let installedPath: string | undefined;
let bundledCliPath: string | undefined;

const getCliPath = (): string => {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const configured = config.get<string>(CONFIG_CLI_PATH, DEFAULT_CLI_PATH);
  if (configured !== DEFAULT_CLI_PATH) { return configured; }
  if (bundledCliPath !== undefined && isCliInstalled(bundledCliPath)) {
    return bundledCliPath;
  }
  return installedPath ?? DEFAULT_CLI_PATH;
};

const handleInstallResult = (
  result: { readonly ok: true; readonly value: { readonly cliPath: string } }
    | { readonly ok: false; readonly error: string }
): void => {
  if (result.ok) {
    installedPath = result.value.cliPath;
    logger.info(CLI_INSTALL_COMPLETE_MSG);
  } else {
    logger.error(`${CLI_INSTALL_FAILED_MSG}${result.error}`);
    const _p = vscode.window.showErrorMessage(
      `${CLI_INSTALL_FAILED_MSG}${result.error}`
    );
  }
};

const ensureCliInstalled = async (
  storageUri: vscode.Uri | undefined
): Promise<void> => {
  if (storageUri === undefined) { return; }

  const storagePath = storageUri.fsPath;
  const candidate = installedCliPath(storagePath, process.platform);

  if (isCliInstalled(candidate)) {
    installedPath = candidate;
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: CLI_INSTALL_MSG, cancellable: false },
    async () => {
      const result = await installCli(storagePath, process.platform, process.arch);
      handleInstallResult(result);
    }
  );
};

const getWorkspacePath = (): string | undefined =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

const getResponseColumn = (): vscode.ViewColumn => {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const layout = config.get<string>(CONFIG_SPLIT_LAYOUT, LAYOUT_BESIDE);
  return layout === LAYOUT_BELOW
    ? vscode.ViewColumn.Active
    : vscode.ViewColumn.Beside;
};

const resolveFileUri = (
  arg?: vscode.Uri | { readonly filePath: string }
): vscode.Uri | undefined => {
  if (arg === undefined) { return vscode.window.activeTextEditor?.document.uri; }
  if (arg instanceof vscode.Uri) { return arg; }
  if (PROP_FILE_PATH in arg) { return vscode.Uri.file(arg.filePath); }
  return undefined;
};

const makeRunningStatus = (fsPath: string): vscode.Disposable =>
  vscode.window.setStatusBarMessage(
    `${STATUS_RUNNING_ICON}${path.basename(fsPath)}${STATUS_RUNNING_SUFFIX}`
  );

const handleStreamResult = (result: RunResult, index: number): void => {
  logger.debug(`${LOG_MSG_STREAM_RESULT} ${result.file}`);
  explorerProvider.updateResult(result.file, result);
  lastResult = result;
  playlistPanel.addResult(index, result);
};

const savePlaylistReport = (
  playlistFile: string,
  results: readonly RunResult[]
): void => {
  const dir = path.dirname(playlistFile);
  const baseName = path.basename(playlistFile, path.extname(playlistFile));
  const reportPath = path.join(
    dir,
    `${baseName}${REPORT_FILE_SUFFIX}${REPORT_FILE_EXTENSION}`
  );
  const html = generatePlaylistReport(baseName, results);
  fs.writeFileSync(reportPath, html, ENCODING_UTF8);
  const _open = vscode.env.openExternal(vscode.Uri.file(reportPath));
  const _msg = vscode.window.showInformationMessage(
    `${REPORT_SAVED_MSG}${path.basename(reportPath)}`
  );
};

const currentEnvOrUndefined = (): string | undefined => {
  const env = envStatusBar.currentEnv;
  return env !== "" ? env : undefined;
};

const preparePlaylistRun = (
  fileUri: vscode.Uri
): { readonly stepFileNames: readonly string[] } => {
  logger.info(`${LOG_MSG_RUN_PLAYLIST} ${fileUri.fsPath}`);
  explorerProvider.clearResults();
  const content = fs.readFileSync(fileUri.fsPath, ENCODING_UTF8);
  const stepPaths = parsePlaylistStepPaths(content);
  const stepFileNames = stepPaths.map((s) => path.basename(s));
  playlistPanel.showRunning(fileUri.fsPath, stepFileNames, getResponseColumn());
  return { stepFileNames };
};

const handleStreamDone = (
  error: string | undefined,
  collectedResults: RunResult[],
  fileUri: vscode.Uri,
  statusMsg: vscode.Disposable
): void => {
  statusMsg.dispose();
  if (error !== undefined && collectedResults.length === 0) {
    logger.error(`${LOG_MSG_CLI_SPAWN_ERROR} ${error}`);
    playlistPanel.showError(error);
    const _msg = vscode.window.showErrorMessage(`${CLI_ERROR_PREFIX}${error}`);
  } else {
    logger.info(LOG_MSG_STREAM_DONE);
    playlistPanel.showComplete(collectedResults);
    const doSave = (): void => {
      savePlaylistReport(fileUri.fsPath, collectedResults);
    };
    playlistPanel.onSaveReport = doSave;
    lastPlaylistReport = doSave;
  }
};

const runPlaylistStreaming = async (
  fileUri: vscode.Uri,
  cwd: string
): Promise<void> =>
  { await new Promise((resolve) => {
    preparePlaylistRun(fileUri);
    const statusMsg = makeRunningStatus(fileUri.fsPath);
    const collectedResults: RunResult[] = [];
    let resultIndex = 0;

    streamCli({
      cliPath: getCliPath(),
      filePath: fileUri.fsPath,
      env: currentEnvOrUndefined(),
      cwd,
      onResult: (result: RunResult) => {
        handleStreamResult(result, resultIndex);
        collectedResults.push(result);
        resultIndex++;
      },
      onDone: (error?: string) => {
        handleStreamDone(error, collectedResults, fileUri, statusMsg);
        resolve();
      },
    });
  }); };

const handleCliResults = (results: readonly RunResult[]): void => {
  logger.info(`${LOG_MSG_CLI_RESULT_COUNT} ${results.length}`);
  for (const r of results) {
    explorerProvider.updateResult(r.file, r);
    lastResult = r;
  }
  if (results.length > 0) {
    responsePanel.show(results[0], getResponseColumn());
  }
};

const runSingleFile = async (
  fileUri: vscode.Uri,
  cwd: string
): Promise<void> => {
  logger.info(`${LOG_MSG_RUN_FILE} ${fileUri.fsPath}`);
  const statusMsg = makeRunningStatus(fileUri.fsPath);

  const result = await runCli({
    cliPath: getCliPath(),
    filePath: fileUri.fsPath,
    env: currentEnvOrUndefined(),
    cwd,
  });

  statusMsg.dispose();

  if (!result.ok) {
    logger.error(`${LOG_MSG_CLI_SPAWN_ERROR} ${result.error}`);
    await vscode.window.showErrorMessage(`${CLI_ERROR_PREFIX}${result.error}`);
    return;
  }

  handleCliResults(result.value);
};

const runFile = async (
  arg?: vscode.Uri | { readonly filePath: string }
): Promise<void> => {
  const fileUri = resolveFileUri(arg);
  if (fileUri === undefined) {
    await vscode.window.showWarningMessage(MSG_NO_FILE_SELECTED);
    return;
  }

  const cwd = getWorkspacePath();
  if (cwd === undefined) { return; }

  const isPlaylist = fileUri.fsPath.endsWith(NAPLIST_EXTENSION);
  if (isPlaylist) {
    await runPlaylistStreaming(fileUri, cwd);
  } else {
    await runSingleFile(fileUri, cwd);
  }
};

const runAll = async (): Promise<void> => {
  const cwd = getWorkspacePath();
  if (cwd === undefined) { return; }
  await runFile(vscode.Uri.file(cwd));
};

const openResponse = async (): Promise<void> => {
  if (lastResult !== undefined) {
    responsePanel.show(lastResult, getResponseColumn());
  } else {
    await vscode.window.showInformationMessage(MSG_NO_RESPONSE);
  }
};

const registerWatchers = (context: vscode.ExtensionContext): void => {
  const napWatcher = vscode.workspace.createFileSystemWatcher(NAP_GLOB);
  const naplistWatcher = vscode.workspace.createFileSystemWatcher(NAPLIST_GLOB);

  const refreshExplorer = (): void => {
    logger.debug(LOG_MSG_TREE_REFRESH);
    explorerProvider.refresh();
  };

  napWatcher.onDidCreate(refreshExplorer);
  napWatcher.onDidDelete(refreshExplorer);
  napWatcher.onDidChange(refreshExplorer);
  naplistWatcher.onDidCreate(refreshExplorer);
  naplistWatcher.onDidDelete(refreshExplorer);
  naplistWatcher.onDidChange(refreshExplorer);

  context.subscriptions.push(napWatcher, naplistWatcher);
};

const registerAutoRun = (context: vscode.ExtensionContext): void => {
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      const autoRun = config.get<boolean>(CONFIG_AUTO_RUN, false);
      if (
        autoRun &&
        (doc.fileName.endsWith(NAP_EXTENSION) ||
          doc.fileName.endsWith(NAPLIST_EXTENSION))
      ) {
        const _run = runFile(doc.uri);
      }
    })
  );
};

const registerCommands = (context: vscode.ExtensionContext): void => {
  context.subscriptions.push(
    vscode.commands.registerCommand(CMD_RUN_FILE, runFile),
    vscode.commands.registerCommand(CMD_RUN_ALL, runAll),
    vscode.commands.registerCommand(CMD_NEW_REQUEST, async () =>
      { await newRequest(explorerProvider); }
    ),
    vscode.commands.registerCommand(CMD_NEW_PLAYLIST, async () =>
      { await newPlaylist(explorerProvider); }
    ),
    vscode.commands.registerCommand(CMD_SWITCH_ENV, async () =>
      { await envStatusBar.showPicker(); }
    ),
    vscode.commands.registerCommand(CMD_COPY_CURL, copyAsCurl),
    vscode.commands.registerCommand(CMD_OPEN_RESPONSE, openResponse),
    vscode.commands.registerCommand(CMD_SAVE_REPORT, () => {
      if (lastPlaylistReport !== undefined) {
        lastPlaylistReport();
      }
    }),
    vscode.commands.registerCommand(CMD_IMPORT_OPENAPI, async () =>
      { await importOpenApi(explorerProvider, logger); }
    )
  );
};

const initProviders = (): void => {
  explorerProvider = new ExplorerAdapter();
  envStatusBar = new EnvironmentStatusBar();
  responsePanel = new ResponsePanel();
  playlistPanel = new PlaylistPanel();
};

export interface ExtensionApi {
  readonly explorerProvider: ExplorerAdapter;
}

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  const outputChannel = vscode.window.createOutputChannel(LOG_CHANNEL_NAME);
  context.subscriptions.push(outputChannel);
  logger = createLogger((msg) => { outputChannel.appendLine(msg); });
  logger.info(LOG_MSG_ACTIVATED);

  bundledCliPath = path.join(
    context.extensionPath, CLI_BIN_DIR, localBinaryName(process.platform)
  );

  const _install = ensureCliInstalled(context.globalStorageUri);
  initProviders();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(VIEW_EXPLORER, explorerProvider)
  );

  const codeLens = new CodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [{ language: LANG_NAP }, { language: LANG_NAPLIST }], codeLens
    )
  );

  registerCommands(context);
  registerWatchers(context);
  registerAutoRun(context);
  context.subscriptions.push(envStatusBar, responsePanel, playlistPanel);

  return { explorerProvider };
}

export function deactivate(): void {
  logger.info(LOG_MSG_DEACTIVATED);
}
