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
import { type RunResult } from "./types";
import { parsePlaylistStepPaths } from "./explorerProvider";
import { generatePlaylistReport } from "./reportGenerator";
import { generateFromOpenApi } from "./openApiGenerator";
import { createLogger, type Logger } from "./logger";
import {
  isCliInstalled,
  installedCliPath,
  installCli,
  localBinaryName,
} from "./cliInstaller";
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
  HTTP_METHODS,
  DEFAULT_CLI_PATH,
  LAYOUT_BESIDE,
  LAYOUT_BELOW,
  ENCODING_UTF8,
  LANG_NAP,
  LANG_NAPLIST,
  MSG_NO_FILE_SELECTED,
  MSG_COPIED,
  MSG_NO_RESPONSE,
  PROMPT_SELECT_METHOD,
  PROMPT_ENTER_URL,
  PROMPT_REQUEST_NAME,
  PROMPT_PLAYLIST_NAME,
  PLACEHOLDER_URL,
  DEFAULT_PLAYLIST_NAME,
  DEFAULT_METHOD,
  NAP_KEY_METHOD,
  NAP_KEY_URL,
  SECTION_META,
  SECTION_STEPS,
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
  OPENAPI_PICK_FILE,
  OPENAPI_PICK_FOLDER,
  OPENAPI_FILTER_LABEL,
  OPENAPI_FILE_EXTENSIONS,
  OPENAPI_SUCCESS_PREFIX,
  OPENAPI_SUCCESS_SUFFIX,
  OPENAPI_ERROR_PREFIX,
  LOG_MSG_OPENAPI_IMPORT,
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
  if (configured !== DEFAULT_CLI_PATH) return configured;
  if (bundledCliPath && isCliInstalled(bundledCliPath)) return bundledCliPath;
  return installedPath ?? DEFAULT_CLI_PATH;
};

const ensureCliInstalled = async (
  storageUri: vscode.Uri | undefined
): Promise<void> => {
  if (!storageUri) return;

  const storagePath = storageUri.fsPath;
  const candidate = installedCliPath(storagePath, process.platform);

  if (isCliInstalled(candidate)) {
    installedPath = candidate;
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: CLI_INSTALL_MSG,
      cancellable: false,
    },
    async () => {
      const result = await installCli(
        storagePath,
        process.platform,
        process.arch
      );
      if (result.ok) {
        installedPath = result.value.cliPath;
        logger.info(CLI_INSTALL_COMPLETE_MSG);
      } else {
        logger.error(`${CLI_INSTALL_FAILED_MSG}${result.error}`);
        void vscode.window.showErrorMessage(
          `${CLI_INSTALL_FAILED_MSG}${result.error}`
        );
      }
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
  if (!arg) return vscode.window.activeTextEditor?.document.uri;
  if (arg instanceof vscode.Uri) return arg;
  if ("filePath" in arg) return vscode.Uri.file(arg.filePath);
  return undefined;
};

const makeRunningStatus = (fsPath: string): vscode.Disposable =>
  vscode.window.setStatusBarMessage(
    `$(loading~spin) Running ${path.basename(fsPath)}...`
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
  void vscode.env.openExternal(vscode.Uri.file(reportPath));
  void vscode.window.showInformationMessage(
    `${REPORT_SAVED_MSG}${path.basename(reportPath)}`
  );
};

const runPlaylistStreaming = (
  fileUri: vscode.Uri,
  cwd: string
): Promise<void> =>
  new Promise((resolve) => {
    logger.info(`${LOG_MSG_RUN_PLAYLIST} ${fileUri.fsPath}`);
    explorerProvider.clearResults();

    const content = fs.readFileSync(fileUri.fsPath, ENCODING_UTF8);
    const stepPaths = parsePlaylistStepPaths(content);
    const stepFileNames = stepPaths.map((s) => path.basename(s));

    playlistPanel.showRunning(
      fileUri.fsPath,
      stepFileNames,
      getResponseColumn()
    );

    const statusMsg = makeRunningStatus(fileUri.fsPath);
    const collectedResults: RunResult[] = [];
    let resultIndex = 0;

    streamCli({
      cliPath: getCliPath(),
      filePath: fileUri.fsPath,
      env: envStatusBar.currentEnv || undefined,
      cwd,
      onResult: (result: RunResult) => {
        handleStreamResult(result, resultIndex);
        collectedResults.push(result);
        resultIndex++;
      },
      onDone: (error?: string) => {
        statusMsg.dispose();
        if (error && collectedResults.length === 0) {
          logger.error(`${LOG_MSG_CLI_SPAWN_ERROR} ${error}`);
          playlistPanel.showError(error);
          void vscode.window.showErrorMessage(
            `Napper CLI error: ${error}`
          );
        } else {
          logger.info(LOG_MSG_STREAM_DONE);
          playlistPanel.showComplete(collectedResults);
          const doSaveReport = (): void =>
            savePlaylistReport(fileUri.fsPath, collectedResults);
          playlistPanel.onSaveReport = doSaveReport;
          lastPlaylistReport = doSaveReport;
        }
        resolve();
      },
    });
  });

const runSingleFile = async (
  fileUri: vscode.Uri,
  cwd: string
): Promise<void> => {
  logger.info(`${LOG_MSG_RUN_FILE} ${fileUri.fsPath}`);
  const statusMsg = makeRunningStatus(fileUri.fsPath);

  const result = await runCli({
    cliPath: getCliPath(),
    filePath: fileUri.fsPath,
    env: envStatusBar.currentEnv || undefined,
    cwd,
  });

  statusMsg.dispose();

  if (!result.ok) {
    logger.error(`${LOG_MSG_CLI_SPAWN_ERROR} ${result.error}`);
    await vscode.window.showErrorMessage(`Napper CLI error: ${result.error}`);
    return;
  }

  logger.info(`${LOG_MSG_CLI_RESULT_COUNT} ${result.value.length}`);
  for (const r of result.value) {
    explorerProvider.updateResult(r.file, r);
    lastResult = r;
  }

  if (result.value.length === 0) return;
  responsePanel.show(result.value[0], getResponseColumn());
};

const runFile = async (
  arg?: vscode.Uri | { readonly filePath: string }
): Promise<void> => {
  const fileUri = resolveFileUri(arg);
  if (!fileUri) {
    await vscode.window.showWarningMessage(MSG_NO_FILE_SELECTED);
    return;
  }

  const cwd = getWorkspacePath();
  if (!cwd) return;

  const isPlaylist = fileUri.fsPath.endsWith(NAPLIST_EXTENSION);
  if (isPlaylist) {
    await runPlaylistStreaming(fileUri, cwd);
  } else {
    await runSingleFile(fileUri, cwd);
  }
};

const runAll = async (): Promise<void> => {
  const cwd = getWorkspacePath();
  if (!cwd) return;
  await runFile(vscode.Uri.file(cwd));
};

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

const promptFileName = (defaultValue: string): Thenable<string | undefined> =>
  vscode.window.showInputBox({
    prompt: PROMPT_REQUEST_NAME,
    value: defaultValue,
  });

const writeAndOpen = async (
  filePath: string,
  content: string
): Promise<void> => {
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(filePath),
    Buffer.from(content, ENCODING_UTF8)
  );
  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc);
  explorerProvider.refresh();
};

const newRequest = async (): Promise<void> => {
  const method = await promptMethod();
  if (!method) return;
  const url = await promptUrl();
  if (!url) return;
  const cwd = getWorkspacePath();
  if (!cwd) return;
  const name = await promptFileName(`${method.toLowerCase()}-request`);
  if (!name) return;

  const filePath = path.join(cwd, `${name}${NAP_EXTENSION}`);
  await writeAndOpen(filePath, `${method} ${url}\n`);
};

const newPlaylist = async (): Promise<void> => {
  const cwd = getWorkspacePath();
  if (!cwd) return;

  const name = await vscode.window.showInputBox({
    prompt: PROMPT_PLAYLIST_NAME,
    value: DEFAULT_PLAYLIST_NAME,
  });
  if (!name) return;

  const filePath = path.join(cwd, `${name}${NAPLIST_EXTENSION}`);
  const content = `${SECTION_META}\nname = "${name}"\n\n${SECTION_STEPS}\n`;
  await writeAndOpen(filePath, content);
};

const valueAfterFirstEquals = (line: string): string => {
  const eqIndex = line.indexOf("=");
  return eqIndex === -1 ? "" : line.slice(eqIndex + 1).trim();
};

const parseMethodAndUrl = (
  text: string
): { method: string; url: string } => {
  const lines = text.split("\n");
  let method = DEFAULT_METHOD;
  let url = "";

  for (const line of lines) {
    const trimmed = line.trim();
    for (const m of HTTP_METHODS) {
      if (trimmed.startsWith(m + " ")) {
        method = m;
        url = trimmed.slice(m.length + 1).trim();
      }
    }
    if (trimmed.startsWith(NAP_KEY_METHOD) && trimmed.includes("=")) {
      method = valueAfterFirstEquals(trimmed);
    }
    if (trimmed.startsWith(NAP_KEY_URL) && trimmed.includes("=")) {
      url = valueAfterFirstEquals(trimmed);
    }
  }

  return { method, url };
};

const copyAsCurl = async (uri?: vscode.Uri): Promise<void> => {
  const fileUri = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!fileUri) return;

  const doc = await vscode.workspace.openTextDocument(fileUri);
  const { method, url } = parseMethodAndUrl(doc.getText());

  const curl = `curl -X ${method} '${url}'`;
  await vscode.env.clipboard.writeText(curl);
  void vscode.window.showInformationMessage(MSG_COPIED);
};

const importOpenApi = async (): Promise<void> => {
  const specFiles = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { [OPENAPI_FILTER_LABEL]: [...OPENAPI_FILE_EXTENSIONS] },
    title: OPENAPI_PICK_FILE,
  });
  if (!specFiles || specFiles.length === 0) return;

  const outputFolder = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title: OPENAPI_PICK_FOLDER,
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
  });
  if (!outputFolder || outputFolder.length === 0) return;

  const specContent = fs.readFileSync(specFiles[0].fsPath, ENCODING_UTF8);
  const result = generateFromOpenApi(specContent);

  if (!result.ok) {
    void vscode.window.showErrorMessage(
      `${OPENAPI_ERROR_PREFIX}${result.error}`
    );
    return;
  }

  const outDir = outputFolder[0].fsPath;
  const { napFiles, playlist, environment } = result.value;

  fs.writeFileSync(
    path.join(outDir, environment.fileName),
    environment.content,
    ENCODING_UTF8
  );
  for (const nap of napFiles) {
    fs.writeFileSync(
      path.join(outDir, nap.fileName),
      nap.content,
      ENCODING_UTF8
    );
  }
  fs.writeFileSync(
    path.join(outDir, playlist.fileName),
    playlist.content,
    ENCODING_UTF8
  );

  logger.info(`${LOG_MSG_OPENAPI_IMPORT} ${napFiles.length} files`);
  explorerProvider.refresh();

  const playlistPath = path.join(outDir, playlist.fileName);
  const doc = await vscode.workspace.openTextDocument(playlistPath);
  await vscode.window.showTextDocument(doc);

  void vscode.window.showInformationMessage(
    `${OPENAPI_SUCCESS_PREFIX}${napFiles.length}${OPENAPI_SUCCESS_SUFFIX}`
  );
};

const openResponse = async (): Promise<void> => {
  if (lastResult) {
    responsePanel.show(lastResult, getResponseColumn());
  } else {
    await vscode.window.showInformationMessage(MSG_NO_RESPONSE);
  }
};

const registerWatchers = (
  context: vscode.ExtensionContext
): void => {
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

const registerAutoRun = (
  context: vscode.ExtensionContext
): void => {
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      const autoRun = config.get<boolean>(CONFIG_AUTO_RUN, false);
      if (
        autoRun &&
        (doc.fileName.endsWith(NAP_EXTENSION) ||
          doc.fileName.endsWith(NAPLIST_EXTENSION))
      ) {
        void runFile(doc.uri);
      }
    })
  );
};

export interface ExtensionApi {
  readonly explorerProvider: ExplorerAdapter;
}

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  const outputChannel = vscode.window.createOutputChannel(LOG_CHANNEL_NAME);
  context.subscriptions.push(outputChannel);
  logger = createLogger((msg) => outputChannel.appendLine(msg));
  logger.info(LOG_MSG_ACTIVATED);

  bundledCliPath = path.join(
    context.extensionPath,
    CLI_BIN_DIR,
    localBinaryName(process.platform)
  );

  void ensureCliInstalled(context.globalStorageUri);

  explorerProvider = new ExplorerAdapter();
  envStatusBar = new EnvironmentStatusBar();
  responsePanel = new ResponsePanel();
  playlistPanel = new PlaylistPanel();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(VIEW_EXPLORER, explorerProvider)
  );

  const codeLens = new CodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [{ language: LANG_NAP }, { language: LANG_NAPLIST }],
      codeLens
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(CMD_RUN_FILE, runFile),
    vscode.commands.registerCommand(CMD_RUN_ALL, runAll),
    vscode.commands.registerCommand(CMD_NEW_REQUEST, newRequest),
    vscode.commands.registerCommand(CMD_NEW_PLAYLIST, newPlaylist),
    vscode.commands.registerCommand(CMD_SWITCH_ENV, () =>
      envStatusBar.showPicker()
    ),
    vscode.commands.registerCommand(CMD_COPY_CURL, copyAsCurl),
    vscode.commands.registerCommand(CMD_OPEN_RESPONSE, openResponse),
    vscode.commands.registerCommand(CMD_SAVE_REPORT, () => {
      if (lastPlaylistReport) {
        lastPlaylistReport();
      }
    }),
    vscode.commands.registerCommand(CMD_IMPORT_OPENAPI, importOpenApi)
  );

  registerWatchers(context);
  registerAutoRun(context);

  context.subscriptions.push(envStatusBar, responsePanel, playlistPanel);

  return { explorerProvider };
}

export function deactivate(): void {
  logger.info(LOG_MSG_DEACTIVATED);
}
