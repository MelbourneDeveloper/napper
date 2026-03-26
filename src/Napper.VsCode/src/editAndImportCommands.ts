// Specs: vscode-commands
// Edit, HTTP convert, and OpenAPI import command registrations

import * as vscode from 'vscode';
import * as path from 'path';
import type { ExplorerAdapter } from './explorerAdapter';
import type { EnvironmentStatusBar } from './environmentAdapter';
import type { Logger } from './logger';
import { newPlaylist, newRequest } from './fileCreation';
import { copyAsCurl } from './curlCopy';
import { importOpenApiFromFile, importOpenApiFromUrl, runAiEnrichment } from './openApiImport';
import { type ConvertContext, convertHttpFile, convertHttpDirectory } from './httpConvert';
import {
  CMD_CONVERT_HTTP_DIR,
  CMD_CONVERT_HTTP_FILE,
  CMD_COPY_CURL,
  CMD_ENRICH_AI,
  CMD_IMPORT_OPENAPI_FILE,
  CMD_IMPORT_OPENAPI_URL,
  CMD_NEW_PLAYLIST,
  CMD_NEW_REQUEST,
  CMD_SWITCH_ENV,
} from './constants';

interface CommandDeps {
  readonly explorer: ExplorerAdapter;
  readonly envStatusBar: EnvironmentStatusBar;
  readonly logger: Logger;
  readonly getCliPath: () => string;
}

const handleEnrichAi = async (
  arg: { readonly filePath?: string } | undefined,
  explorer: ExplorerAdapter,
  logger: Logger,
): Promise<void> => {
  const fp = arg?.filePath;
  if (fp === undefined) {
    return;
  }
  await runAiEnrichment(path.dirname(fp), logger);
  explorer.refresh();
};

export const registerEditCommands = (context: vscode.ExtensionContext, deps: CommandDeps): void => {
  context.subscriptions.push(
    vscode.commands.registerCommand(CMD_NEW_REQUEST, async () => {
      await newRequest(deps.explorer);
    }),
    vscode.commands.registerCommand(CMD_NEW_PLAYLIST, async () => {
      await newPlaylist(deps.explorer);
    }),
    vscode.commands.registerCommand(CMD_SWITCH_ENV, async () => {
      await deps.envStatusBar.showPicker();
    }),
    vscode.commands.registerCommand(CMD_COPY_CURL, copyAsCurl),
  );
};

const toConvertContext = (deps: CommandDeps): ConvertContext => ({
  explorer: deps.explorer,
  logger: deps.logger,
  getCliPath: deps.getCliPath,
});

export const registerHttpConvertCommands = (
  context: vscode.ExtensionContext,
  deps: CommandDeps,
): void => {
  const ctx = toConvertContext(deps);
  context.subscriptions.push(
    vscode.commands.registerCommand(CMD_CONVERT_HTTP_FILE, async (uri?: vscode.Uri) => {
      await convertHttpFile(ctx, uri);
    }),
    vscode.commands.registerCommand(CMD_CONVERT_HTTP_DIR, async () => {
      await convertHttpDirectory(ctx);
    }),
  );
};

export const registerOpenApiCommands = (
  context: vscode.ExtensionContext,
  deps: CommandDeps,
): void => {
  context.subscriptions.push(
    vscode.commands.registerCommand(CMD_IMPORT_OPENAPI_URL, async () => {
      await importOpenApiFromUrl(deps.explorer, deps.logger, deps.getCliPath);
    }),
    vscode.commands.registerCommand(CMD_IMPORT_OPENAPI_FILE, async () => {
      await importOpenApiFromFile(deps.explorer, deps.logger, deps.getCliPath);
    }),
    vscode.commands.registerCommand(CMD_ENRICH_AI, async (arg?: { readonly filePath?: string }) => {
      await handleEnrichAi(arg, deps.explorer, deps.logger);
    }),
  );
};
