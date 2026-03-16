// Specs: vscode-http-convert, vscode-commands
// .http → .nap conversion — calls CLI `nap convert http` subprocess
// Decoupled from vscode SDK where possible; thin vscode layer for dialogs

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import type { ExplorerAdapter } from './explorerAdapter';
import type { Logger } from './logger';
import { type Result, err, ok } from './types';
import {
  CLI_CMD_CONVERT,
  CLI_FLAG_OUTPUT,
  CLI_FLAG_OUTPUT_DIR,
  CLI_OUTPUT_JSON,
  CLI_SPAWN_FAILED_PREFIX,
  CLI_SUBCMD_HTTP,
  CONFIG_CLI_PATH,
  CONFIG_SECTION,
  CONVERT_HTTP_ERROR_PREFIX,
  CONVERT_HTTP_FILE_EXTENSIONS,
  CONVERT_HTTP_FILTER_LABEL,
  CONVERT_HTTP_NO_FILES,
  CONVERT_HTTP_PICK_DIR,
  CONVERT_HTTP_PICK_FILE,
  CONVERT_HTTP_SUCCESS_PREFIX,
  CONVERT_HTTP_SUCCESS_SUFFIX,
  DEFAULT_CLI_PATH,
  HTTP_FILE_EXTENSION,
  LOG_MSG_CONVERT_HTTP,
  LOG_MSG_CONVERT_HTTP_RESULT,
  REST_FILE_EXTENSION,
} from './constants';

const MAX_PREVIEW_LENGTH = 200;

interface ConvertResult {
  readonly files: number;
  readonly warnings: number;
}

interface ConvertContext {
  readonly explorer: ExplorerAdapter;
  readonly logger: Logger;
}

const resolveCliPath = (): string => {
  const configured = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<string>(CONFIG_CLI_PATH, '');
  return configured.length > 0 ? configured : DEFAULT_CLI_PATH;
};

const buildConvertArgs = (inputPath: string, outDir: string): readonly string[] => [
  CLI_CMD_CONVERT,
  CLI_SUBCMD_HTTP,
  inputPath,
  CLI_FLAG_OUTPUT_DIR,
  outDir,
  CLI_FLAG_OUTPUT,
  CLI_OUTPUT_JSON,
];

const parseConvertOutput = (stdout: string): Result<ConvertResult, string> => {
  try {
    return ok(JSON.parse(stdout) as ConvertResult);
  } catch {
    return err(`${CONVERT_HTTP_ERROR_PREFIX}${stdout.slice(0, MAX_PREVIEW_LENGTH)}`);
  }
};

const isHttpFile = (filePath: string): boolean =>
  filePath.endsWith(HTTP_FILE_EXTENSION) || filePath.endsWith(REST_FILE_EXTENSION);

interface ExecContext {
  readonly cliPath: string;
  readonly logger: Logger;
  readonly resolve: (r: Result<ConvertResult, string>) => void;
}

const resolveExecError = (ctx: ExecContext, stderr: string): void => {
  const msg = stderr.length > 0 ? ` — ${stderr}` : '';
  ctx.logger.error(`${CLI_SPAWN_FAILED_PREFIX}${ctx.cliPath}${msg}`);
  ctx.resolve(err(`${CLI_SPAWN_FAILED_PREFIX}${ctx.cliPath}${msg}`));
};

const resolveExecSuccess = (ctx: ExecContext, stdout: string): void => {
  const result = parseConvertOutput(stdout);
  const logFn = result.ok ? ctx.logger.info : ctx.logger.error;
  logFn(
    `${LOG_MSG_CONVERT_HTTP_RESULT} ${result.ok ? `${result.value.files} files` : result.error}`,
  );
  ctx.resolve(result);
};

const spawnConvert = (inputPath: string, outDir: string, ctx: ExecContext): void => {
  execFile(
    ctx.cliPath,
    [...buildConvertArgs(inputPath, outDir)],
    { timeout: 30_000, env: { ...process.env } },
    (error, stdout, stderr) => {
      if (error !== null && stdout.length === 0) {
        resolveExecError(ctx, stderr);
      } else {
        resolveExecSuccess(ctx, stdout);
      }
    },
  );
};

export const callCliConvert = async (
  inputPath: string,
  outDir: string,
  logger: Logger,
): Promise<Result<ConvertResult, string>> =>
  new Promise((resolve) => {
    const cliPath = resolveCliPath();
    logger.info(`${LOG_MSG_CONVERT_HTTP} ${cliPath} ${inputPath} → ${outDir}`);
    spawnConvert(inputPath, outDir, { cliPath, logger, resolve });
  });

const handleConvertSuccess = (generated: ConvertResult, ctx: ConvertContext): void => {
  ctx.logger.info(`${LOG_MSG_CONVERT_HTTP} ${generated.files} files generated`);
  ctx.explorer.refresh();
  void vscode.window.showInformationMessage(
    `${CONVERT_HTTP_SUCCESS_PREFIX}${generated.files}${CONVERT_HTTP_SUCCESS_SUFFIX}`,
  );
};

const runConvert = async (
  inputPath: string,
  outDir: string,
  ctx: ConvertContext,
): Promise<void> => {
  const result = await callCliConvert(inputPath, outDir, ctx.logger);
  if (!result.ok) {
    await vscode.window.showErrorMessage(`${CONVERT_HTTP_ERROR_PREFIX}${result.error}`);
    return;
  }
  handleConvertSuccess(result.value, ctx);
};

const pickHttpFile = async (): Promise<vscode.Uri | undefined> => {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      [CONVERT_HTTP_FILTER_LABEL]: [...CONVERT_HTTP_FILE_EXTENSIONS],
    },
    title: CONVERT_HTTP_PICK_FILE,
  });
  return picked?.[0];
};

export const convertHttpFile = async (
  explorer: ExplorerAdapter,
  logger: Logger,
  fileUri?: vscode.Uri,
): Promise<void> => {
  const uri = fileUri ?? (await pickHttpFile());
  if (uri === undefined) {
    return;
  }
  if (!isHttpFile(uri.fsPath)) {
    await vscode.window.showWarningMessage(CONVERT_HTTP_NO_FILES);
    return;
  }
  const outDir = path.dirname(uri.fsPath);
  await runConvert(uri.fsPath, outDir, { explorer, logger });
};

const pickHttpDirectory = async (): Promise<vscode.Uri | undefined> => {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title: CONVERT_HTTP_PICK_DIR,
  });
  return picked?.[0];
};

export const convertHttpDirectory = async (
  explorer: ExplorerAdapter,
  logger: Logger,
): Promise<void> => {
  const uri = await pickHttpDirectory();
  if (uri === undefined) {
    return;
  }
  const hasHttpFiles = fs.readdirSync(uri.fsPath).some((f) => isHttpFile(f));
  if (!hasHttpFiles) {
    await vscode.window.showWarningMessage(CONVERT_HTTP_NO_FILES);
    return;
  }
  await runConvert(uri.fsPath, uri.fsPath, { explorer, logger });
};
