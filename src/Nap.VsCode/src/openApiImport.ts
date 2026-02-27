// OpenAPI import command — importOpenApi
// Extracted from extension.ts to keep files under 450 LOC

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import type { ExplorerAdapter } from "./explorerAdapter";
import type { GeneratedFile, GenerationResult } from "./openApiGenerator";
import { generateFromOpenApi } from "./openApiGenerator";
import type { Logger } from "./logger";
import {
  ENCODING_UTF8,
  OPENAPI_PICK_FILE,
  OPENAPI_PICK_FOLDER,
  OPENAPI_FILTER_LABEL,
  OPENAPI_FILE_EXTENSIONS,
  OPENAPI_SUCCESS_PREFIX,
  OPENAPI_SUCCESS_SUFFIX,
  OPENAPI_ERROR_PREFIX,
  LOG_MSG_OPENAPI_IMPORT,
} from "./constants";

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

const writeGeneratedFile = (
  outDir: string,
  file: GeneratedFile
): void => {
  fs.writeFileSync(
    path.join(outDir, file.fileName),
    file.content,
    ENCODING_UTF8
  );
};

const writeAllFiles = (
  outDir: string,
  generated: GenerationResult
): void => {
  writeGeneratedFile(outDir, generated.environment);
  for (const nap of generated.napFiles) {
    writeGeneratedFile(outDir, nap);
  }
  writeGeneratedFile(outDir, generated.playlist);
};

interface ImportContext {
  readonly explorer: ExplorerAdapter;
  readonly logger: Logger;
}

const handleSuccess = async (
  outDir: string,
  generated: GenerationResult,
  ctx: ImportContext
): Promise<void> => {
  writeAllFiles(outDir, generated);
  ctx.logger.info(`${LOG_MSG_OPENAPI_IMPORT} ${generated.napFiles.length}`);
  ctx.explorer.refresh();

  const playlistPath = path.join(outDir, generated.playlist.fileName);
  const doc = await vscode.workspace.openTextDocument(playlistPath);
  await vscode.window.showTextDocument(doc);
  await vscode.window.showInformationMessage(
    `${OPENAPI_SUCCESS_PREFIX}${generated.napFiles.length}${OPENAPI_SUCCESS_SUFFIX}`
  );
};

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

export const importOpenApi = async (
  explorer: ExplorerAdapter,
  logger: Logger
): Promise<void> => {
  const paths = await pickPaths();
  if (paths === undefined) { return; }

  const specContent = fs.readFileSync(paths.specFile.fsPath, ENCODING_UTF8);
  const result = generateFromOpenApi(specContent);

  if (!result.ok) {
    await vscode.window.showErrorMessage(`${OPENAPI_ERROR_PREFIX}${result.error}`);
    return;
  }

  const ctx: ImportContext = { explorer, logger };
  await handleSuccess(paths.outFolder.fsPath, result.value, ctx);
};
