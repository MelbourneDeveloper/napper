// Specs: vscode-openapi, vscode-openapi-import, vscode-openapi-ai, vscode-commands
// OpenAPI import command — calls CLI to generate .nap files from spec
// Deterministic generation lives in F# CLI; AI enrichment is optional via Copilot

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import type { ExplorerAdapter } from './explorerAdapter';
import type { Logger } from './logger';
import { type Result, err, ok } from './types';
import {
  CLI_CMD_GENERATE,
  CLI_FLAG_OUTPUT,
  CLI_FLAG_OUTPUT_DIR,
  CLI_OUTPUT_JSON,
  CLI_PARSE_FAILED_PREFIX,
  CLI_SPAWN_FAILED_PREFIX,
  CLI_SUBCMD_OPENAPI,
  LOG_MSG_OPENAPI_AI_CHOICE,
  LOG_MSG_OPENAPI_AI_MODEL_SELECTED,
  LOG_MSG_OPENAPI_AI_NO_MODEL,
  LOG_MSG_OPENAPI_GENERATE_CLI,
  LOG_MSG_OPENAPI_IMPORT,
  LOG_MSG_OPENAPI_SPEC_SAVED,
  LOG_MSG_OPENAPI_URL_DOWNLOAD_FAIL,
  LOG_MSG_OPENAPI_URL_DOWNLOAD_OK,
  LOG_MSG_OPENAPI_URL_FETCH,
  NAPLIST_EXTENSION,
  OPENAPI_AI_CHOICE_BASIC,
  OPENAPI_AI_CHOICE_ENHANCED,
  OPENAPI_AI_CHOICE_TITLE,
  OPENAPI_AI_COPILOT_FAMILY,
  OPENAPI_AI_ENRICHING_ASSERTIONS,
  OPENAPI_AI_ENRICHING_TEST_DATA,
  OPENAPI_AI_NO_COPILOT,
  OPENAPI_AI_PROGRESS_TITLE,
  OPENAPI_AI_REORDERING_PLAYLIST,
  OPENAPI_DOWNLOADING,
  OPENAPI_ERROR_PREFIX,
  OPENAPI_FILE_EXTENSIONS,
  OPENAPI_FILTER_LABEL,
  OPENAPI_PICK_FILE,
  OPENAPI_PICK_FOLDER,
  OPENAPI_SUCCESS_PREFIX,
  OPENAPI_SUCCESS_SUFFIX,
  OPENAPI_URL_PLACEHOLDER,
  OPENAPI_URL_PROMPT,
} from './constants';
import { downloadSpec, saveTempSpec } from './openApiDownloader';
import {
  type GeneratedFile,
  type OperationSummary,
  applyAssertionEnrichments,
  applyTestDataEnrichments,
  buildAssertionPrompt,
  buildPlaylistOrderPrompt,
  buildTestDataPrompt,
  extractSummary,
  getAssertionSystemPrompt,
  getPlaylistSystemPrompt,
  getTestDataSystemPrompt,
  parseAssertionResponse,
  parsePlaylistOrderResponse,
  parseTestDataResponse,
  readGeneratedFiles,
  reorderPlaylistSteps,
} from './openApiAiEnhancer';

interface GenerateResult {
  readonly files: number;
  readonly playlist: string;
}
interface PickedPaths {
  readonly specFile: vscode.Uri;
  readonly outFolder: vscode.Uri;
}
interface ImportContext {
  readonly explorer: ExplorerAdapter;
  readonly logger: Logger;
  readonly getCliPath: () => string;
}

interface LmRequestParams {
  readonly model: vscode.LanguageModelChat;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly token: vscode.CancellationToken;
}

interface EnrichStepParams {
  readonly lm: LmRequestParams;
  readonly operations: readonly OperationSummary[];
  readonly files: readonly GeneratedFile[];
}

interface EnrichmentContext {
  readonly progress: vscode.Progress<{ message?: string }>;
  readonly baseParams: LmRequestParams;
  readonly outDir: string;
  readonly logger: Logger;
}

const MAX_PREVIEW_LENGTH = 200,
  pickSpecFile = (): Thenable<readonly vscode.Uri[] | undefined> =>
    vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { [OPENAPI_FILTER_LABEL]: [...OPENAPI_FILE_EXTENSIONS] },
      title: OPENAPI_PICK_FILE,
    }),
  pickOutputFolder = (): Thenable<readonly vscode.Uri[] | undefined> => {
    const uri = vscode.workspace.workspaceFolders?.[0]?.uri,
      base = uri !== undefined ? { defaultUri: uri } : {};
    return vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: OPENAPI_PICK_FOLDER,
      ...base,
    });
  },
  pickPaths = async (): Promise<PickedPaths | undefined> => {
    const specFile = (await pickSpecFile())?.[0];
    if (specFile === undefined) {
      return undefined;
    }
    const outFolder = (await pickOutputFolder())?.[0];
    return outFolder !== undefined ? { specFile, outFolder } : undefined;
  },
  buildGenerateArgs = (specPath: string, outDir: string): readonly string[] => [
    CLI_CMD_GENERATE,
    CLI_SUBCMD_OPENAPI,
    specPath,
    CLI_FLAG_OUTPUT_DIR,
    outDir,
    CLI_FLAG_OUTPUT,
    CLI_OUTPUT_JSON,
  ],
  parseGenerateOutput = (stdout: string): Result<GenerateResult, string> => {
    try {
      return ok(JSON.parse(stdout) as GenerateResult);
    } catch {
      return err(`${CLI_PARSE_FAILED_PREFIX}${stdout.slice(0, MAX_PREVIEW_LENGTH)}`);
    }
  },
  buildCliErrorMsg = (cliPath: string, stderr: string): string => {
    const suffix = stderr.length > 0 ? ` — ${stderr}` : '';
    return `${CLI_SPAWN_FAILED_PREFIX}${cliPath}${suffix}`;
  },
  spawnGenerate = (
    cliPath: string,
    args: readonly string[],
    resolve: (r: Result<GenerateResult, string>) => void,
  ): void => {
    execFile(
      cliPath,
      [...args],
      { timeout: 30_000, env: { ...process.env } },
      (error, stdout, stderr) => {
        if (error !== null && stdout.length === 0) {
          resolve(err(buildCliErrorMsg(cliPath, stderr)));
          return;
        }
        resolve(parseGenerateOutput(stdout));
      },
    );
  },
  callCliGenerate = async (
    specPath: string,
    outDir: string,
    ctx: ImportContext,
  ): Promise<Result<GenerateResult, string>> => {
    const cliPath = ctx.getCliPath(),
      args = buildGenerateArgs(specPath, outDir);
    ctx.logger.info(`${LOG_MSG_OPENAPI_GENERATE_CLI} ${cliPath} ${specPath} → ${outDir}`);
    return new Promise((resolve) => {
      spawnGenerate(cliPath, args, resolve);
    });
  },
  handleSuccess = async (
    outDir: string,
    generated: GenerateResult,
    ctx: ImportContext,
  ): Promise<void> => {
    ctx.logger.info(`${LOG_MSG_OPENAPI_IMPORT} ${generated.files}`);
    ctx.explorer.refresh();
    await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(path.join(outDir, generated.playlist)),
    );
    void vscode.window.showInformationMessage(
      `${OPENAPI_SUCCESS_PREFIX}${generated.files}${OPENAPI_SUCCESS_SUFFIX}`,
    );
  },
  askAiChoice = async (): Promise<string | undefined> => {
    const picked = await vscode.window.showQuickPick(
      [{ label: OPENAPI_AI_CHOICE_BASIC }, { label: OPENAPI_AI_CHOICE_ENHANCED }],
      { title: OPENAPI_AI_CHOICE_TITLE, placeHolder: OPENAPI_AI_CHOICE_TITLE },
    );
    return picked?.label;
  },
  selectCopilotModel = async (): Promise<vscode.LanguageModelChat | undefined> => {
    const models = await vscode.lm.selectChatModels({ family: OPENAPI_AI_COPILOT_FAMILY });
    return models[0];
  },
  sendLmRequest = async (params: LmRequestParams): Promise<string> => {
    const messages = [
        vscode.LanguageModelChatMessage.User(`${params.systemPrompt}\n\n${params.userPrompt}`),
      ],
      response = await params.model.sendRequest(messages, {}, params.token),
      parts: string[] = [];
    for await (const chunk of response.text) {
      parts.push(chunk);
    }
    return parts.join('');
  },
  enrichAssertionStep = async (
    step: EnrichStepParams,
    logger: Logger,
  ): Promise<readonly GeneratedFile[]> => {
    const response = await sendLmRequest({
        ...step.lm,
        systemPrompt: getAssertionSystemPrompt(),
        userPrompt: buildAssertionPrompt(step.operations),
      }),
      result = parseAssertionResponse(response);
    if (!result.ok) {
      logger.info(result.error);
      return step.files;
    }
    return applyAssertionEnrichments(step.files, result.value);
  },
  enrichTestDataStep = async (
    step: EnrichStepParams,
    logger: Logger,
  ): Promise<readonly GeneratedFile[]> => {
    const prompt = buildTestDataPrompt(step.operations);
    if (prompt.length === 0) {
      return step.files;
    }
    const response = await sendLmRequest({
        ...step.lm,
        systemPrompt: getTestDataSystemPrompt(),
        userPrompt: prompt,
      }),
      result = parseTestDataResponse(response);
    if (!result.ok) {
      logger.info(result.error);
      return step.files;
    }
    return applyTestDataEnrichments(step.files, result.value);
  },
  findFirstNaplist = (outDir: string): string | undefined => {
    const naplists = fs.readdirSync(outDir).filter((f) => f.endsWith(NAPLIST_EXTENSION));
    return naplists[0];
  },
  fetchPlaylistOrder = async (
    params: LmRequestParams,
    fileNames: readonly string[],
  ): Promise<Result<readonly string[], string>> => {
    const response = await sendLmRequest({
      ...params,
      systemPrompt: getPlaylistSystemPrompt(),
      userPrompt: buildPlaylistOrderPrompt(fileNames),
    });
    return parsePlaylistOrderResponse(response);
  },
  reorderPlaylistStep = async (
    params: LmRequestParams,
    outDir: string,
    fileNames: readonly string[],
  ): Promise<void> => {
    const first = findFirstNaplist(outDir);
    if (first === undefined) {
      return;
    }
    const playlistPath = path.join(outDir, first),
      result = await fetchPlaylistOrder(params, fileNames);
    if (!result.ok) {
      return;
    }
    const content = reorderPlaylistSteps(fs.readFileSync(playlistPath, 'utf-8'), result.value);
    fs.writeFileSync(playlistPath, content, 'utf-8');
  },
  writeEnrichedFiles = (outDir: string, files: readonly GeneratedFile[]): void => {
    for (const file of files) {
      fs.writeFileSync(path.join(outDir, file.fileName), file.content, 'utf-8');
    }
  },
  executeEnrichmentSteps = async (ctx: EnrichmentContext): Promise<void> => {
    const files = readGeneratedFiles(ctx.outDir),
      operations = files.map(extractSummary);

    ctx.progress.report({ message: OPENAPI_AI_ENRICHING_ASSERTIONS });
    let enriched = await enrichAssertionStep({ lm: ctx.baseParams, operations, files }, ctx.logger);

    ctx.progress.report({ message: OPENAPI_AI_ENRICHING_TEST_DATA });
    enriched = await enrichTestDataStep(
      { lm: ctx.baseParams, operations, files: enriched },
      ctx.logger,
    );

    ctx.progress.report({ message: OPENAPI_AI_REORDERING_PLAYLIST });
    await reorderPlaylistStep(
      ctx.baseParams,
      ctx.outDir,
      enriched.map((f) => f.fileName),
    );

    writeEnrichedFiles(ctx.outDir, enriched);
  };

export const runAiEnrichment = async (outDir: string, logger: Logger): Promise<void> => {
  const model = await selectCopilotModel();
  if (model === undefined) {
    logger.warn(LOG_MSG_OPENAPI_AI_NO_MODEL);
    await vscode.window.showWarningMessage(OPENAPI_AI_NO_COPILOT);
    return;
  }
  logger.info(`${LOG_MSG_OPENAPI_AI_MODEL_SELECTED} ${model.name}`);
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: OPENAPI_AI_PROGRESS_TITLE,
      cancellable: true,
    },
    async (progress, token) => {
      const baseParams: LmRequestParams = { model, systemPrompt: '', userPrompt: '', token };
      await executeEnrichmentSteps({ progress, baseParams, outDir, logger });
    },
  );
};

export { downloadSpec, saveTempSpec } from './openApiDownloader';

const askForUrl = async (): Promise<string | undefined> =>
  vscode.window.showInputBox({
    prompt: OPENAPI_URL_PROMPT,
    placeHolder: OPENAPI_URL_PLACEHOLDER,
    ignoreFocusOut: true,
  });

const generateAndEnrich = async (
  specPath: string,
  outDir: string,
  ctx: ImportContext,
): Promise<void> => {
  const choice = await askAiChoice();
  if (choice === undefined) {
    return;
  }
  ctx.logger.info(`${LOG_MSG_OPENAPI_AI_CHOICE} ${choice}`);
  const result = await callCliGenerate(specPath, outDir, ctx);
  if (!result.ok) {
    await vscode.window.showErrorMessage(`${OPENAPI_ERROR_PREFIX}${result.error}`);
    return;
  }
  if (choice === OPENAPI_AI_CHOICE_ENHANCED) {
    await runAiEnrichment(outDir, ctx.logger);
  }
  await handleSuccess(outDir, result.value, ctx);
};

const downloadWithProgress = async (url: string): Promise<Result<string, string>> =>
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: OPENAPI_DOWNLOADING,
        cancellable: false,
      },
      async () => downloadSpec(url),
    ),
  handleDownloadResult = async (
    specResult: Result<string, string>,
    outDir: string,
    logger: Logger,
  ): Promise<string | undefined> => {
    if (!specResult.ok) {
      logger.error(`${LOG_MSG_OPENAPI_URL_DOWNLOAD_FAIL} ${specResult.error}`);
      await vscode.window.showErrorMessage(`${OPENAPI_ERROR_PREFIX}${specResult.error}`);
      return undefined;
    }
    logger.info(`${LOG_MSG_OPENAPI_URL_DOWNLOAD_OK} ${specResult.value.length}`);
    const specPath = saveTempSpec(specResult.value, outDir);
    logger.info(`${LOG_MSG_OPENAPI_SPEC_SAVED} ${specPath}`);
    return specPath;
  },
  fetchAndSaveSpec = async (
    url: string,
    outDir: string,
    logger: Logger,
  ): Promise<string | undefined> => {
    logger.info(`${LOG_MSG_OPENAPI_URL_FETCH} ${url}`);
    const specResult = await downloadWithProgress(url);
    return handleDownloadResult(specResult, outDir, logger);
  };

export const importOpenApiFromUrl = async (
  explorer: ExplorerAdapter,
  logger: Logger,
  getCliPath: () => string,
): Promise<void> => {
  const url = await askForUrl();
  if (url === undefined || url.length === 0) {
    return;
  }
  const outFolder = await pickOutputFolder(),
    outDir = outFolder?.[0]?.fsPath;
  if (outDir === undefined) {
    return;
  }
  const specPath = await fetchAndSaveSpec(url, outDir, logger);
  if (specPath === undefined) {
    return;
  }
  await generateAndEnrich(specPath, outDir, { explorer, logger, getCliPath });
};

export const importOpenApiFromFile = async (
  explorer: ExplorerAdapter,
  logger: Logger,
  getCliPath: () => string,
): Promise<void> => {
  const paths = await pickPaths();
  if (paths === undefined) {
    return;
  }
  await generateAndEnrich(paths.specFile.fsPath, paths.outFolder.fsPath, {
    explorer,
    logger,
    getCliPath,
  });
};
