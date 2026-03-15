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
import { type Logger, createLogger } from "./logger";
import {
  installCli,
  installedCliPath,
  isCliInstalled,
  localBinaryName,
} from "./cliInstaller";
import { newPlaylist, newRequest } from "./fileCreation";
import { copyAsCurl } from "./curlCopy";
import { importOpenApiFromFile, importOpenApiFromUrl, runAiEnrichment } from "./openApiImport";
import { registerContextMenuCommands } from "./contextMenuCommands";
import { registerAutoRun, registerWatchers } from "./watchers";
import {
  CLI_BIN_DIR,
  CLI_ERROR_PREFIX,
  CLI_INSTALL_COMPLETE_MSG,
  CLI_INSTALL_FAILED_MSG,
  CLI_INSTALL_MSG,
  CMD_COPY_CURL,
  CMD_ENRICH_AI,
  CMD_IMPORT_OPENAPI_FILE,
  CMD_IMPORT_OPENAPI_URL,
  CMD_NEW_PLAYLIST,
  CMD_NEW_REQUEST,
  CMD_OPEN_RESPONSE,
  CMD_RUN_ALL,
  CMD_RUN_FILE,
  CMD_SAVE_REPORT,
  CMD_SWITCH_ENV,
  CONFIG_CLI_PATH,
  CONFIG_SECTION,
  CONFIG_SPLIT_LAYOUT,
  DEFAULT_CLI_PATH,
  ENCODING_UTF8,
  LANG_NAP,
  LANG_NAPLIST,
  LAYOUT_BELOW,
  LAYOUT_BESIDE,
  LOG_CHANNEL_NAME,
  LOG_MSG_ACTIVATED,
  LOG_MSG_CLI_RESULT_COUNT,
  LOG_MSG_CLI_SPAWN_ERROR,
  LOG_MSG_DEACTIVATED,
  LOG_MSG_RUN_FILE,
  LOG_MSG_RUN_PLAYLIST,
  LOG_MSG_STREAM_DONE,
  LOG_MSG_STREAM_RESULT,
  MSG_NO_FILE_SELECTED,
  MSG_NO_RESPONSE,
  NAPLIST_EXTENSION,
  PROP_FILE_PATH,
  REPORT_FILE_EXTENSION,
  REPORT_FILE_SUFFIX,
  REPORT_SAVED_MSG,
  STATUS_RUNNING_ICON,
  STATUS_RUNNING_SUFFIX,
  VIEW_EXPLORER,
} from "./constants";

let bundledCliPath: string | undefined = undefined,
 envStatusBar: EnvironmentStatusBar = undefined as unknown as EnvironmentStatusBar,
 explorerProvider: ExplorerAdapter = undefined as unknown as ExplorerAdapter,
 installedPath: string | undefined = undefined,
 lastPlaylistReport: (() => void) | undefined = undefined,
 lastResult: RunResult | undefined = undefined,
 logger: Logger = undefined as unknown as Logger,

 playlistPanel: PlaylistPanel = undefined as unknown as PlaylistPanel,
 responsePanel: ResponsePanel = undefined as unknown as ResponsePanel;

const getCliPath = (): string => {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION),
   configured = config.get<string>(CONFIG_CLI_PATH, DEFAULT_CLI_PATH);
  if (configured !== DEFAULT_CLI_PATH) { return configured; }
  if (bundledCliPath !== undefined && isCliInstalled(bundledCliPath)) {
    return bundledCliPath;
  }
  return installedPath ?? DEFAULT_CLI_PATH;
},

 handleInstallResult = (
  result: { readonly ok: true; readonly value: { readonly cliPath: string } }
    | { readonly ok: false; readonly error: string }
): void => {
  if (result.ok) {
    installedPath = result.value.cliPath;
    logger.info(CLI_INSTALL_COMPLETE_MSG);
    return;
  }
  logger.error(`${CLI_INSTALL_FAILED_MSG}${result.error}`);
  void vscode.window.showErrorMessage(
    `${CLI_INSTALL_FAILED_MSG}${result.error}`
  );
},

 ensureCliInstalled = async (
  storageUri: vscode.Uri | undefined
): Promise<void> => {
  if (storageUri === undefined) { return; }
  const storagePath = storageUri.fsPath,
   candidate = installedCliPath(storagePath, process.platform);
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
},

 getWorkspacePath = (): string | undefined =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,

 getResponseColumn = (): vscode.ViewColumn => {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION),
   layout = config.get<string>(CONFIG_SPLIT_LAYOUT, LAYOUT_BESIDE);
  return layout === LAYOUT_BELOW
    ? vscode.ViewColumn.Active
    : vscode.ViewColumn.Beside;
},

 resolveFileUri = (
  arg?: vscode.Uri | { readonly filePath: string }
): vscode.Uri | undefined => {
  if (arg === undefined) { return vscode.window.activeTextEditor?.document.uri; }
  if (arg instanceof vscode.Uri) { return arg; }
  if (PROP_FILE_PATH in arg) { return vscode.Uri.file(arg.filePath); }
  return undefined;
},

 makeRunningStatus = (fsPath: string): vscode.Disposable =>
  vscode.window.setStatusBarMessage(
    `${STATUS_RUNNING_ICON}${path.basename(fsPath)}${STATUS_RUNNING_SUFFIX}`
  ),

 handleStreamResult = (result: RunResult, index: number): void => {
  logger.debug(`${LOG_MSG_STREAM_RESULT} ${result.file}`);
  explorerProvider.updateResult(result.file, result);
  lastResult = result;
  playlistPanel.addResult(index, result);
},

 savePlaylistReport = (
  playlistFile: string,
  results: readonly RunResult[]
): void => {
  const dir = path.dirname(playlistFile),
   baseName = path.basename(playlistFile, path.extname(playlistFile)),
   reportPath = path.join(
    dir,
    `${baseName}${REPORT_FILE_SUFFIX}${REPORT_FILE_EXTENSION}`
  ),
   html = generatePlaylistReport(baseName, results);
  fs.writeFileSync(reportPath, html, ENCODING_UTF8);
  void vscode.env.openExternal(vscode.Uri.file(reportPath));
  void vscode.window.showInformationMessage(
    `${REPORT_SAVED_MSG}${path.basename(reportPath)}`
  );
},

 currentEnvOrUndefined = (): string | undefined => {
  const env = envStatusBar.currentEnv;
  return env !== "" ? env : undefined;
},

 preparePlaylistRun = (fileUri: vscode.Uri): void => {
  logger.info(`${LOG_MSG_RUN_PLAYLIST} ${fileUri.fsPath}`);
  explorerProvider.clearResults();
  const content = fs.readFileSync(fileUri.fsPath, ENCODING_UTF8),
   stepPaths = parsePlaylistStepPaths(content),
   stepFileNames = stepPaths.map((s) => path.basename(s));
  playlistPanel.showRunning(fileUri.fsPath, stepFileNames, getResponseColumn());
};

interface StreamState {
  readonly collectedResults: RunResult[];
  resultIndex: number;
  streamError: string | undefined;
}

const collectResult = (state: StreamState, result: RunResult): void => {
  handleStreamResult(result, state.resultIndex);
  state.collectedResults.push(result);
  state.resultIndex++;
},

 awaitStream = async (
  fileUri: vscode.Uri,
  cwd: string,
  state: StreamState
): Promise<void> => {
  await new Promise<void>((resolve) => {
    streamCli({
      cliPath: getCliPath(),
      filePath: fileUri.fsPath,
      env: currentEnvOrUndefined(),
      cwd,
      onResult: (result: RunResult) => { collectResult(state, result); },
      onDone: (error?: string) => { state.streamError = error; resolve(); },
    });
  });
},

 handleStreamError = (
  state: StreamState
): void => {
  logger.error(`${LOG_MSG_CLI_SPAWN_ERROR} ${state.streamError}`);
  playlistPanel.showError(state.streamError ?? "");
  void vscode.window.showErrorMessage(
    `${CLI_ERROR_PREFIX}${state.streamError}`
  );
},

 handleStreamSuccess = (
  state: StreamState,
  fileUri: vscode.Uri
): void => {
  logger.info(LOG_MSG_STREAM_DONE);
  playlistPanel.showComplete(state.collectedResults);
  const doSave = (): void => {
    savePlaylistReport(fileUri.fsPath, state.collectedResults);
  };
  playlistPanel.onSaveReport = doSave;
  lastPlaylistReport = (): void => {
    savePlaylistReport(fileUri.fsPath, state.collectedResults);
  };
},

 runPlaylistStreaming = async (
  fileUri: vscode.Uri,
  cwd: string
): Promise<void> => {
  preparePlaylistRun(fileUri);
  const statusMsg = makeRunningStatus(fileUri.fsPath),
   state: StreamState = { collectedResults: [], resultIndex: 0, streamError: undefined };
  await awaitStream(fileUri, cwd, state);
  statusMsg.dispose();
  if (state.streamError !== undefined && state.collectedResults.length === 0) {
    handleStreamError(state);
  } else {
    handleStreamSuccess(state, fileUri);
  }
},

 handleCliResults = (results: readonly RunResult[]): void => {
  logger.info(`${LOG_MSG_CLI_RESULT_COUNT} ${results.length}`);
  for (const r of results) {
    explorerProvider.updateResult(r.file, r);
    lastResult = r;
  }
  const first = results[0];
  if (first !== undefined) {
    responsePanel.show(first, getResponseColumn());
  }
},

 runSingleFile = async (
  fileUri: vscode.Uri,
  cwd: string
): Promise<void> => {
  logger.info(`${LOG_MSG_RUN_FILE} ${fileUri.fsPath}`);
  const statusMsg = makeRunningStatus(fileUri.fsPath),
   result = await runCli({
    cliPath: getCliPath(),
    filePath: fileUri.fsPath,
    env: currentEnvOrUndefined(),
    cwd,
  });
  statusMsg.dispose();
  if (!result.ok) {
    logger.error(`${LOG_MSG_CLI_SPAWN_ERROR} ${result.error}`);
    void vscode.window.showErrorMessage(`${CLI_ERROR_PREFIX}${result.error}`);
    return;
  }
  handleCliResults(result.value);
},

 runFile = async (
  arg?: vscode.Uri | { readonly filePath: string }
): Promise<void> => {
  const fileUri = resolveFileUri(arg);
  if (fileUri === undefined) {
    void vscode.window.showWarningMessage(MSG_NO_FILE_SELECTED);
    return;
  }
  const cwd = getWorkspacePath();
  if (cwd === undefined) { return; }
  if (fileUri.fsPath.endsWith(NAPLIST_EXTENSION)) {
    await runPlaylistStreaming(fileUri, cwd);
  } else {
    await runSingleFile(fileUri, cwd);
  }
},

 runAll = async (): Promise<void> => {
  const cwd = getWorkspacePath();
  if (cwd === undefined) { return; }
  await runFile(vscode.Uri.file(cwd));
},

 openResponse = (): void => {
  if (lastResult !== undefined) {
    responsePanel.show(lastResult, getResponseColumn());
  } else {
    void vscode.window.showInformationMessage(MSG_NO_RESPONSE);
  }
},


 registerRunCommands = (context: vscode.ExtensionContext): void => {
  context.subscriptions.push(
    vscode.commands.registerCommand(CMD_RUN_FILE, runFile),
    vscode.commands.registerCommand(CMD_RUN_ALL, runAll),
    vscode.commands.registerCommand(CMD_COPY_CURL, copyAsCurl),
    vscode.commands.registerCommand(CMD_OPEN_RESPONSE, openResponse),
    vscode.commands.registerCommand(CMD_SAVE_REPORT, () => {
      if (lastPlaylistReport !== undefined) {
        lastPlaylistReport();
      }
    })
  );
},

 registerEditCommands = (context: vscode.ExtensionContext): void => {
  context.subscriptions.push(
    vscode.commands.registerCommand(CMD_NEW_REQUEST, async () => {
      await newRequest(explorerProvider);
    }),
    vscode.commands.registerCommand(CMD_NEW_PLAYLIST, async () => {
      await newPlaylist(explorerProvider);
    }),
    vscode.commands.registerCommand(CMD_SWITCH_ENV, async () => {
      await envStatusBar.showPicker();
    })
  );
},

 registerOpenApiCommands = (context: vscode.ExtensionContext): void => {
  context.subscriptions.push(
    vscode.commands.registerCommand(CMD_IMPORT_OPENAPI_URL, async () => {
      await importOpenApiFromUrl(explorerProvider, logger);
    }),
    vscode.commands.registerCommand(CMD_IMPORT_OPENAPI_FILE, async () => {
      await importOpenApiFromFile(explorerProvider, logger);
    }),
    vscode.commands.registerCommand(CMD_ENRICH_AI, async (arg?: { readonly filePath?: string }) => {
      const fp = arg?.filePath;
      if (fp === undefined) { return; }
      await runAiEnrichment(path.dirname(fp), logger);
      explorerProvider.refresh();
    })
  );
},

 initProviders = (): void => {
  explorerProvider = new ExplorerAdapter();
  envStatusBar = new EnvironmentStatusBar();
  responsePanel = new ResponsePanel();
  playlistPanel = new PlaylistPanel();
},

 registerCodeLens = (context: vscode.ExtensionContext): void => {
  const codeLens = new CodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [{ language: LANG_NAP }, { language: LANG_NAPLIST }], codeLens
    )
  );
},

 initLogger = (context: vscode.ExtensionContext): void => {
  const outputChannel = vscode.window.createOutputChannel(LOG_CHANNEL_NAME);
  context.subscriptions.push(outputChannel);
  logger = createLogger((msg) => { outputChannel.appendLine(msg); });
  logger.info(LOG_MSG_ACTIVATED);
  bundledCliPath = path.join(
    context.extensionPath, CLI_BIN_DIR, localBinaryName(process.platform)
  );
  ensureCliInstalled(context.globalStorageUri).catch(() => undefined);
};

export interface ExtensionApi {
  readonly explorerProvider: ExplorerAdapter;
}

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  initLogger(context);
  initProviders();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(VIEW_EXPLORER, explorerProvider),
    vscode.window.registerFileDecorationProvider(explorerProvider),
  );
  registerCodeLens(context);
  registerRunCommands(context);
  registerEditCommands(context);
  registerOpenApiCommands(context);
  registerContextMenuCommands(context, explorerProvider);
  registerWatchers(context, explorerProvider, logger);
  registerAutoRun(context, async (uri) => runFile(uri));
  context.subscriptions.push(envStatusBar, responsePanel, playlistPanel);
  return { explorerProvider };
}

export function deactivate(): void {
  logger.info(LOG_MSG_DEACTIVATED);
}
