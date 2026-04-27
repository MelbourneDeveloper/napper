// Specs: vscode-impl, vscode-commands
// Napper VSCode Extension — main entry point
// Registers all providers, commands, and file watchers

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ExplorerAdapter } from './explorerAdapter';
import { CodeLensProvider } from './codeLensProvider';
import { EnvironmentStatusBar } from './environmentAdapter';
import { ResponsePanel } from './responsePanel';
import { PlaylistPanel } from './playlistPanel';
import { runCli, streamCli } from './cliRunner';
import type { ResolverPlatform, RunResult } from './types';
import { parsePlaylistStepPaths } from './explorerProvider';
import { generatePlaylistReport } from './reportGenerator';
import { type Logger, createLogger } from './logger';
import { ensureCli } from './cliResolverUi';
import {
  registerEditCommands,
  registerHttpConvertCommands,
  registerOpenApiCommands,
} from './editAndImportCommands';
import { registerContextMenuCommands } from './contextMenuCommands';
import { registerAutoRun, registerWatchers } from './watchers';
import { startLspClient, stopLspClient } from './lspClient';
import {
  CLI_BINARY_NAME,
  CLI_ERROR_PREFIX,
  CLI_INSTALL_COMPLETE_MSG,
  CMD_OPEN_RESPONSE,
  CMD_RUN_ALL,
  CMD_RUN_FILE,
  CMD_SAVE_REPORT,
  CONFIG_CLI_PATH,
  CONFIG_SECTION,
  CONFIG_SPLIT_LAYOUT,
  DEFAULT_CLI_PATH,
  ENCODING_UTF8,
  HTTP_FILE_EXTENSION,
  LANG_NAP,
  LANG_NAPLIST,
  REST_FILE_EXTENSION,
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
} from './constants';

let envStatusBar: EnvironmentStatusBar,
  extensionContext: vscode.ExtensionContext,
  extensionDir: string,
  extensionVersion: string,
  explorerProvider: ExplorerAdapter,
  installedCliOverride: string | undefined,
  lastPlaylistReport: (() => void) | undefined,
  lastResult: RunResult | undefined,
  logger: Logger,
  outputChannel: vscode.OutputChannel,
  playlistPanel: PlaylistPanel,
  responsePanel: ResponsePanel;

const platformToDtk = (): string => {
    const p = process.platform,
      a = process.arch;
    if (p === 'darwin') {
      return a === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    }
    if (p === 'linux') {
      return 'linux-x64';
    }
    return a === 'arm64' ? 'win32-arm64' : 'win32-x64';
  },
  bundledCliPath = (): string => {
    const bin = process.platform === 'win32' ? `${CLI_BINARY_NAME}.exe` : CLI_BINARY_NAME;
    return path.join(extensionDir, 'bin', platformToDtk(), bin);
  },
  getCliPath = (): string => {
    const configured = vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .get<string>(CONFIG_CLI_PATH, DEFAULT_CLI_PATH);
    if (configured !== DEFAULT_CLI_PATH) {
      return configured;
    }
    if (installedCliOverride !== undefined) {
      return installedCliOverride;
    }
    const bundled = bundledCliPath();
    return fs.existsSync(bundled) ? bundled : CLI_BINARY_NAME;
  },
  resolverPlatform = (): ResolverPlatform => {
    const p = process.platform;
    if (p === 'darwin' || p === 'linux' || p === 'win32') {
      return p;
    }
    return 'linux';
  },
  startCliAndLsp = (cliPath: string): void => {
    installedCliOverride = cliPath;
    logger.info(`${CLI_INSTALL_COMPLETE_MSG} (${cliPath})`);
    startLspClient(cliPath, outputChannel, extensionContext);
  },
  runEnsureCli = async (): Promise<void> => {
    logger.info('Resolving CLI...');
    const configuredPath = vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .get<string>(CONFIG_CLI_PATH);
    const cliPath = await ensureCli({
      vsixVersion: extensionVersion,
      configuredCliPath: configuredPath,
      platform: resolverPlatform(),
      outputChannel,
    });
    if (cliPath !== undefined) {
      startCliAndLsp(cliPath);
    }
  },
  getWorkspacePath = (): string | undefined => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  getResponseColumn = (): vscode.ViewColumn => {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION),
      layout = config.get<string>(CONFIG_SPLIT_LAYOUT, LAYOUT_BESIDE);
    return layout === LAYOUT_BELOW ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside;
  },
  resolveFileUri = (arg?: vscode.Uri | { readonly filePath: string }): vscode.Uri | undefined => {
    if (arg === undefined) {
      return vscode.window.activeTextEditor?.document.uri;
    }
    if (arg instanceof vscode.Uri) {
      return arg;
    }
    return PROP_FILE_PATH in arg ? vscode.Uri.file(arg.filePath) : undefined;
  },
  makeRunningStatus = (fsPath: string): vscode.Disposable =>
    vscode.window.setStatusBarMessage(
      `${STATUS_RUNNING_ICON}${path.basename(fsPath)}${STATUS_RUNNING_SUFFIX}`,
    ),
  handleStreamResult = (result: RunResult, index: number): void => {
    logger.debug(`${LOG_MSG_STREAM_RESULT} ${result.file}`);
    explorerProvider.updateResult(result.file, result);
    lastResult = result;
    playlistPanel.addResult(index, result);
  },
  savePlaylistReport = (playlistFile: string, results: readonly RunResult[]): void => {
    const baseName = path.basename(playlistFile, path.extname(playlistFile)),
      reportPath = path.join(
        path.dirname(playlistFile),
        `${baseName}${REPORT_FILE_SUFFIX}${REPORT_FILE_EXTENSION}`,
      );
    fs.writeFileSync(reportPath, generatePlaylistReport(baseName, results), ENCODING_UTF8);
    void vscode.env.openExternal(vscode.Uri.file(reportPath));
    void vscode.window.showInformationMessage(`${REPORT_SAVED_MSG}${path.basename(reportPath)}`);
  },
  currentEnvOrUndefined = (): string | undefined => {
    const env = envStatusBar.currentEnv;
    return env !== '' ? env : undefined;
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
  awaitStream = async (fileUri: vscode.Uri, cwd: string, state: StreamState): Promise<void> => {
    await new Promise<void>((resolve) => {
      streamCli({
        cliPath: getCliPath(),
        filePath: fileUri.fsPath,
        env: currentEnvOrUndefined(),
        cwd,
        onResult: (result: RunResult) => {
          collectResult(state, result);
        },
        onDone: (error?: string) => {
          state.streamError = error;
          resolve();
        },
      });
    });
  },
  handleStreamError = (state: StreamState): void => {
    logger.error(`${LOG_MSG_CLI_SPAWN_ERROR} ${state.streamError}`);
    playlistPanel.showError(state.streamError ?? '');
    void vscode.window.showErrorMessage(`${CLI_ERROR_PREFIX}${state.streamError}`);
  },
  handleStreamSuccess = (state: StreamState, fileUri: vscode.Uri): void => {
    logger.info(LOG_MSG_STREAM_DONE);
    playlistPanel.showComplete(state.collectedResults);
    const doSave = (): void => {
      savePlaylistReport(fileUri.fsPath, state.collectedResults);
    };
    playlistPanel.onSaveReport = doSave;
    lastPlaylistReport = doSave;
  },
  runPlaylistStreaming = async (fileUri: vscode.Uri, cwd: string): Promise<void> => {
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
    const [first] = results;
    if (first !== undefined) {
      responsePanel.show(first, getResponseColumn());
    }
  },
  runSingleFile = async (fileUri: vscode.Uri, cwd: string): Promise<void> => {
    const resolvedCliPath = getCliPath();
    logger.info(`${LOG_MSG_RUN_FILE} ${fileUri.fsPath}`);
    logger.info(`CLI path: ${resolvedCliPath}, cwd: ${cwd}`);
    const statusMsg = makeRunningStatus(fileUri.fsPath),
      result = await runCli({
        cliPath: resolvedCliPath,
        filePath: fileUri.fsPath,
        env: currentEnvOrUndefined(),
        cwd,
      });
    statusMsg.dispose();
    logger.info(`CLI completed: ok=${String(result.ok)}`);
    if (!result.ok) {
      logger.error(`${LOG_MSG_CLI_SPAWN_ERROR} ${result.error}`);
      void vscode.window.showErrorMessage(`${CLI_ERROR_PREFIX}${result.error}`);
      return;
    }
    handleCliResults(result.value);
  },
  runFile = async (arg?: vscode.Uri | { readonly filePath: string }): Promise<void> => {
    const fileUri = resolveFileUri(arg);
    if (fileUri === undefined) {
      void vscode.window.showWarningMessage(MSG_NO_FILE_SELECTED);
      return;
    }
    const cwd = getWorkspacePath();
    if (cwd === undefined) {
      return;
    }
    if (fileUri.fsPath.endsWith(NAPLIST_EXTENSION)) {
      await runPlaylistStreaming(fileUri, cwd);
    } else {
      await runSingleFile(fileUri, cwd);
    }
  },
  runAll = async (): Promise<void> => {
    const cwd = getWorkspacePath();
    if (cwd !== undefined) {
      await runFile(vscode.Uri.file(cwd));
    }
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
      vscode.commands.registerCommand(CMD_OPEN_RESPONSE, openResponse),
      vscode.commands.registerCommand(CMD_SAVE_REPORT, () => {
        if (lastPlaylistReport !== undefined) {
          lastPlaylistReport();
        }
      }),
    );
  },
  initProviders = (): void => {
    explorerProvider = new ExplorerAdapter();
    envStatusBar = new EnvironmentStatusBar();
    responsePanel = new ResponsePanel();
    playlistPanel = new PlaylistPanel();
  },
  codeLensSelectors = [
    { language: LANG_NAP },
    { language: LANG_NAPLIST },
    { pattern: `**/*${HTTP_FILE_EXTENSION}` },
    { pattern: `**/*${REST_FILE_EXTENSION}` },
  ],
  registerCodeLens = (context: vscode.ExtensionContext): void => {
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(codeLensSelectors, new CodeLensProvider()),
    );
  },
  initLogger = (context: vscode.ExtensionContext): void => {
    extensionContext = context;
    outputChannel = vscode.window.createOutputChannel(LOG_CHANNEL_NAME);
    context.subscriptions.push(outputChannel);
    logger = createLogger((msg) => {
      outputChannel.appendLine(msg);
    });
    logger.info(LOG_MSG_ACTIVATED);
    extensionVersion = (context.extension.packageJSON as { version: string }).version;
    extensionDir = context.extensionUri.fsPath;
    logger.info(`Extension version: ${extensionVersion}`);
    runEnsureCli().catch(() => undefined);
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
  const commandDeps = { explorer: explorerProvider, envStatusBar, logger, getCliPath };
  registerRunCommands(context);
  registerEditCommands(context, commandDeps);
  registerOpenApiCommands(context, commandDeps);
  registerHttpConvertCommands(context, commandDeps);
  registerContextMenuCommands(context, explorerProvider);
  registerWatchers(context, explorerProvider, logger);
  registerAutoRun(context, async (uri) => runFile(uri));
  context.subscriptions.push(envStatusBar, responsePanel, playlistPanel);
  return { explorerProvider };
}

export async function deactivate(): Promise<void> {
  logger.info(LOG_MSG_DEACTIVATED);
  await stopLspClient();
}
