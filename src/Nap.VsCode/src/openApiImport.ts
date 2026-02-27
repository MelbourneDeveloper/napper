// OpenAPI import command — calls CLI to generate .nap files from spec
// Deterministic generation lives in F# CLI; this is just the VS Code UI wrapper

import * as vscode from "vscode";
import * as path from "path";
import { execFile } from "child_process";
import type { ExplorerAdapter } from "./explorerAdapter";
import type { Logger } from "./logger";
import type { Result } from "./types";
import { ok, err } from "./types";
import {
  OPENAPI_PICK_FILE,
  OPENAPI_PICK_FOLDER,
  OPENAPI_FILTER_LABEL,
  OPENAPI_FILE_EXTENSIONS,
  OPENAPI_SUCCESS_PREFIX,
  OPENAPI_SUCCESS_SUFFIX,
  OPENAPI_ERROR_PREFIX,
  LOG_MSG_OPENAPI_IMPORT,
  DEFAULT_CLI_PATH,
  CONFIG_SECTION,
  CONFIG_CLI_PATH,
  CLI_CMD_GENERATE,
  CLI_SUBCMD_OPENAPI,
  CLI_FLAG_OUTPUT,
  CLI_OUTPUT_JSON,
  CLI_FLAG_OUTPUT_DIR,
  CLI_SPAWN_FAILED_PREFIX,
  CLI_PARSE_FAILED_PREFIX,
} from "./constants";

interface GenerateResult {
  readonly files: number;
  readonly playlist: string;
}

const MAX_PREVIEW_LENGTH = 200;

const resolveCliPath = (): string => {
  const configured = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<string>(CONFIG_CLI_PATH, "");
  return configured.length > 0 ? configured : DEFAULT_CLI_PATH;
};

const pickSpecFile = (): Thenable<readonly vscode.Uri[] | undefined> =>
  vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { [OPENAPI_FILTER_LABEL]: [...OPENAPI_FILE_EXTENSIONS] },
    title: OPENAPI_PICK_FILE,
  });

const defaultWorkspaceUri = (): { readonly defaultUri: vscode.Uri } | Record<string, never> => {
  const uri = vscode.workspace.workspaceFolders?.[0]?.uri;
  return uri !== undefined ? { defaultUri: uri } : {};
};

const pickOutputFolder = (): Thenable<readonly vscode.Uri[] | undefined> =>
  vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title: OPENAPI_PICK_FOLDER,
    ...defaultWorkspaceUri(),
  });

interface PickedPaths {
  readonly specFile: vscode.Uri;
  readonly outFolder: vscode.Uri;
}

const pickPaths = async (): Promise<PickedPaths | undefined> => {
  const specFiles = await pickSpecFile();
  const specFile = specFiles?.[0];
  if (specFile === undefined) { return undefined; }
  const outputFolder = await pickOutputFolder();
  const outFolder = outputFolder?.[0];
  if (outFolder === undefined) { return undefined; }
  return { specFile, outFolder };
};

const buildGenerateArgs = (
  specPath: string,
  outDir: string
): readonly string[] => [
  CLI_CMD_GENERATE,
  CLI_SUBCMD_OPENAPI,
  specPath,
  CLI_FLAG_OUTPUT_DIR,
  outDir,
  CLI_FLAG_OUTPUT,
  CLI_OUTPUT_JSON,
];

const parseGenerateOutput = (
  stdout: string
): Result<GenerateResult, string> => {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return ok(parsed as GenerateResult);
  } catch {
    return err(`${CLI_PARSE_FAILED_PREFIX}${stdout.slice(0, MAX_PREVIEW_LENGTH)}`);
  }
};

const formatSpawnError = (
  cliPath: string,
  stderr: string
): string => {
  const stderrMsg = stderr.length > 0 ? ` — ${stderr}` : "";
  return `${CLI_SPAWN_FAILED_PREFIX}${cliPath}${stderrMsg}`;
};

const callCliGenerate = async (
  specPath: string,
  outDir: string
): Promise<Result<GenerateResult, string>> =>
  await new Promise((resolve) => {
    const cliPath = resolveCliPath();
    const args = buildGenerateArgs(specPath, outDir);
    execFile(
      cliPath,
      args as string[],
      { timeout: 30_000, env: { ...process.env } },
      (error, stdout, stderr) => {
        if (error !== null && stdout.length === 0) {
          resolve(err(formatSpawnError(cliPath, stderr)));
          return;
        }
        resolve(parseGenerateOutput(stdout));
      }
    );
  });

interface ImportContext {
  readonly explorer: ExplorerAdapter;
  readonly logger: Logger;
}

const handleSuccess = async (
  outDir: string,
  generated: GenerateResult,
  ctx: ImportContext
): Promise<void> => {
  ctx.logger.info(`${LOG_MSG_OPENAPI_IMPORT} ${generated.files}`);
  ctx.explorer.refresh();

  const playlistPath = path.join(outDir, generated.playlist);
  const doc = await vscode.workspace.openTextDocument(playlistPath);
  await vscode.window.showTextDocument(doc);
  await vscode.window.showInformationMessage(
    `${OPENAPI_SUCCESS_PREFIX}${generated.files}${OPENAPI_SUCCESS_SUFFIX}`
  );
};

export const importOpenApi = async (
  explorer: ExplorerAdapter,
  logger: Logger
): Promise<void> => {
  const paths = await pickPaths();
  if (paths === undefined) { return; }

  const result = await callCliGenerate(
    paths.specFile.fsPath,
    paths.outFolder.fsPath
  );

  if (!result.ok) {
    await vscode.window.showErrorMessage(`${OPENAPI_ERROR_PREFIX}${result.error}`);
    return;
  }

  const ctx: ImportContext = { explorer, logger };
  await handleSuccess(paths.outFolder.fsPath, result.value, ctx);
};
