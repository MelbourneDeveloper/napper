// OpenAPI import command — calls CLI to generate .nap files from spec
// Deterministic generation lives in F# CLI; AI enrichment is optional via Copilot

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { execFile } from "child_process";
import type { ExplorerAdapter } from "./explorerAdapter";
import type { Logger } from "./logger";
import type { Result } from "./types";
import { ok, err } from "./types";
import * as https from "https";
import type { IncomingMessage } from "http";
import {
  OPENAPI_PICK_FILE,
  OPENAPI_PICK_FOLDER,
  OPENAPI_FILTER_LABEL,
  OPENAPI_FILE_EXTENSIONS,
  OPENAPI_SUCCESS_PREFIX,
  OPENAPI_SUCCESS_SUFFIX,
  OPENAPI_ERROR_PREFIX,
  OPENAPI_URL_PROMPT,
  OPENAPI_URL_PLACEHOLDER,
  OPENAPI_DOWNLOAD_FAILED_PREFIX,
  OPENAPI_DOWNLOADING,
  HTTP_STATUS_REDIRECT_MIN,
  HTTP_STATUS_CLIENT_ERROR_MIN,
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
  OPENAPI_AI_CHOICE_TITLE,
  OPENAPI_AI_CHOICE_BASIC,
  OPENAPI_AI_CHOICE_ENHANCED,
  OPENAPI_AI_PROGRESS_TITLE,
  OPENAPI_AI_NO_COPILOT,
  OPENAPI_AI_COPILOT_FAMILY,
  OPENAPI_AI_ENRICHING_ASSERTIONS,
  OPENAPI_AI_ENRICHING_TEST_DATA,
  OPENAPI_AI_REORDERING_PLAYLIST,
  NAP_EXTENSION,
  NAPLIST_EXTENSION,
  SECTION_REQUEST_BODY,
} from "./constants";
import {
  type GeneratedFile,
  type OperationSummary,
  buildAssertionPrompt,
  buildTestDataPrompt,
  buildPlaylistOrderPrompt,
  getAssertionSystemPrompt,
  getTestDataSystemPrompt,
  getPlaylistSystemPrompt,
  parseAssertionResponse,
  parseTestDataResponse,
  parsePlaylistOrderResponse,
  applyAssertionEnrichments,
  applyTestDataEnrichments,
  reorderPlaylistSteps,
} from "./openApiAiEnhancer";

// ─── CLI generate types ─────────────────────────────────────

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

const MAX_PREVIEW_LENGTH = 200;
const NAME_PREFIX = "name = ";
const BODY_PREFIX = "body.";
const EXISTS_SUFFIX = " exists";

// ─── CLI integration ────────────────────────────────────────

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
  CLI_CMD_GENERATE, CLI_SUBCMD_OPENAPI, specPath,
  CLI_FLAG_OUTPUT_DIR, outDir, CLI_FLAG_OUTPUT, CLI_OUTPUT_JSON,
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

const callCliGenerate = async (
  specPath: string,
  outDir: string
): Promise<Result<GenerateResult, string>> =>
  await new Promise((resolve) => {
    const cliPath = resolveCliPath();
    execFile(
      cliPath, buildGenerateArgs(specPath, outDir) as string[],
      { timeout: 30_000, env: { ...process.env } },
      (error, stdout, stderr) => {
        if (error !== null && stdout.length === 0) {
          const msg = stderr.length > 0 ? ` — ${stderr}` : "";
          resolve(err(`${CLI_SPAWN_FAILED_PREFIX}${cliPath}${msg}`));
          return;
        }
        resolve(parseGenerateOutput(stdout));
      }
    );
  });

const handleSuccess = async (
  outDir: string,
  generated: GenerateResult,
  ctx: ImportContext
): Promise<void> => {
  ctx.logger.info(`${LOG_MSG_OPENAPI_IMPORT} ${generated.files}`);
  ctx.explorer.refresh();
  const doc = await vscode.workspace.openTextDocument(path.join(outDir, generated.playlist));
  await vscode.window.showTextDocument(doc);
  await vscode.window.showInformationMessage(
    `${OPENAPI_SUCCESS_PREFIX}${generated.files}${OPENAPI_SUCCESS_SUFFIX}`
  );
};

// ─── AI choice ──────────────────────────────────────────────

const askAiChoice = async (): Promise<string | undefined> => {
  const picked = await vscode.window.showQuickPick(
    [{ label: OPENAPI_AI_CHOICE_BASIC }, { label: OPENAPI_AI_CHOICE_ENHANCED }],
    { title: OPENAPI_AI_CHOICE_TITLE, placeHolder: OPENAPI_AI_CHOICE_TITLE }
  );
  return picked?.label;
};

// ─── Language model helpers ─────────────────────────────────

const selectCopilotModel = async (): Promise<vscode.LanguageModelChat | undefined> => {
  const models = await vscode.lm.selectChatModels({ family: OPENAPI_AI_COPILOT_FAMILY });
  return models[0];
};

const sendLmRequest = async (
  params: LmRequestParams
): Promise<string> => {
  const messages = [
    vscode.LanguageModelChatMessage.User(`${params.systemPrompt}\n\n${params.userPrompt}`),
  ];
  const response = await params.model.sendRequest(messages, {}, params.token);
  const parts: string[] = [];
  for await (const chunk of response.text) { parts.push(chunk); }
  return parts.join("");
};

// ─── File reading helpers ───────────────────────────────────

const collectNapFiles = (
  dir: string,
  baseDir: string,
  out: GeneratedFile[]
): void => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { collectNapFiles(full, baseDir, out); }
    else if (entry.name.endsWith(NAP_EXTENSION)) {
      out.push({ fileName: path.relative(baseDir, full), content: fs.readFileSync(full, "utf-8") });
    }
  }
};

const readGeneratedFiles = (outDir: string): readonly GeneratedFile[] => {
  const files: GeneratedFile[] = [];
  collectNapFiles(outDir, outDir, files);
  return files;
};

// ─── Operation extraction ───────────────────────────────────

const HTTP_METHOD_PREFIXES = ["GET ", "POST ", "PUT ", "PATCH ", "DELETE ", "HEAD ", "OPTIONS "] as const;

const isRequestLine = (line: string): boolean =>
  HTTP_METHOD_PREFIXES.some((prefix) => line.startsWith(prefix));

const extractSummary = (file: GeneratedFile): OperationSummary => {
  const lines = file.content.split("\n");
  const nameLine = lines.find((l) => l.startsWith(NAME_PREFIX));
  const requestLine = lines.find(isRequestLine);
  const name = nameLine?.slice(NAME_PREFIX.length) ?? file.fileName;
  return {
    operationId: name,
    method: requestLine?.split(" ")[0] ?? "GET",
    path: requestLine?.split(" ")[1] ?? "",
    summary: name,
    responseFields: lines
      .filter((l) => l.startsWith(BODY_PREFIX) && l.includes(EXISTS_SUFFIX))
      .map((l) => l.slice(BODY_PREFIX.length, l.indexOf(EXISTS_SUFFIX))),
    hasRequestBody: file.content.includes(SECTION_REQUEST_BODY),
  };
};

// ─── Enrichment steps ───────────────────────────────────────

const enrichAssertionStep = async (
  step: EnrichStepParams,
  logger: Logger
): Promise<readonly GeneratedFile[]> => {
  const response = await sendLmRequest({
    ...step.lm, systemPrompt: getAssertionSystemPrompt(),
    userPrompt: buildAssertionPrompt(step.operations),
  });
  const result = parseAssertionResponse(response);
  if (!result.ok) { logger.info(result.error); return step.files; }
  return applyAssertionEnrichments(step.files, result.value);
};

const enrichTestDataStep = async (
  step: EnrichStepParams,
  logger: Logger
): Promise<readonly GeneratedFile[]> => {
  const prompt = buildTestDataPrompt(step.operations);
  if (prompt.length === 0) { return step.files; }
  const response = await sendLmRequest({
    ...step.lm, systemPrompt: getTestDataSystemPrompt(), userPrompt: prompt,
  });
  const result = parseTestDataResponse(response);
  if (!result.ok) { logger.info(result.error); return step.files; }
  return applyTestDataEnrichments(step.files, result.value);
};

const reorderPlaylistStep = async (
  params: LmRequestParams,
  outDir: string,
  fileNames: readonly string[]
): Promise<void> => {
  const naplists = fs.readdirSync(outDir).filter((f) => f.endsWith(NAPLIST_EXTENSION));
  const first = naplists[0];
  if (first === undefined) { return; }
  const playlistPath = path.join(outDir, first);
  const response = await sendLmRequest({
    ...params, systemPrompt: getPlaylistSystemPrompt(),
    userPrompt: buildPlaylistOrderPrompt(fileNames),
  });
  const result = parsePlaylistOrderResponse(response);
  if (!result.ok) { return; }
  fs.writeFileSync(playlistPath, reorderPlaylistSteps(
    fs.readFileSync(playlistPath, "utf-8"), result.value
  ), "utf-8");
};

const writeEnrichedFiles = (
  outDir: string,
  files: readonly GeneratedFile[]
): void => {
  for (const file of files) {
    fs.writeFileSync(path.join(outDir, file.fileName), file.content, "utf-8");
  }
};

// ─── AI enrichment orchestrator ─────────────────────────────

const executeEnrichmentSteps = async (
  ctx: EnrichmentContext
): Promise<void> => {
  const files = readGeneratedFiles(ctx.outDir);
  const operations = files.map(extractSummary);

  ctx.progress.report({ message: OPENAPI_AI_ENRICHING_ASSERTIONS });
  let enriched = await enrichAssertionStep({ lm: ctx.baseParams, operations, files }, ctx.logger);

  ctx.progress.report({ message: OPENAPI_AI_ENRICHING_TEST_DATA });
  enriched = await enrichTestDataStep({ lm: ctx.baseParams, operations, files: enriched }, ctx.logger);

  ctx.progress.report({ message: OPENAPI_AI_REORDERING_PLAYLIST });
  await reorderPlaylistStep(ctx.baseParams, ctx.outDir, enriched.map((f) => f.fileName));

  writeEnrichedFiles(ctx.outDir, enriched);
};

export const runAiEnrichment = async (
  outDir: string,
  logger: Logger
): Promise<void> => {
  const model = await selectCopilotModel();
  if (model === undefined) {
    await vscode.window.showWarningMessage(OPENAPI_AI_NO_COPILOT);
    return;
  }
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: OPENAPI_AI_PROGRESS_TITLE, cancellable: true },
    async (progress, token) => {
      const baseParams: LmRequestParams = { model, systemPrompt: "", userPrompt: "", token };
      await executeEnrichmentSteps({ progress, baseParams, outDir, logger });
    }
  );
};

// ─── URL download ───────────────────────────────────────────

const isRedirect = (code: number): boolean =>
  code >= HTTP_STATUS_REDIRECT_MIN && code < HTTP_STATUS_CLIENT_ERROR_MIN;

const isClientError = (code: number): boolean =>
  code >= HTTP_STATUS_CLIENT_ERROR_MIN;

const collectBody = (
  res: IncomingMessage,
  resolve: (r: Result<string, string>) => void
): void => {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => { chunks.push(chunk); });
  res.on("end", () => { resolve(ok(Buffer.concat(chunks).toString("utf-8"))); });
  res.on("error", (e) => { resolve(err(`${OPENAPI_DOWNLOAD_FAILED_PREFIX}${e.message}`)); });
};

// Use function declaration for hoisting (recursive redirect)
export async function downloadSpec(url: string): Promise<Result<string, string>> {
  return await new Promise((resolve) => {
    https.get(url, (res) => {
      const status = res.statusCode ?? 0;
      if (isRedirect(status) && res.headers.location !== undefined) {
        downloadSpec(res.headers.location).then(resolve).catch(() => {
          resolve(err(`${OPENAPI_DOWNLOAD_FAILED_PREFIX}redirect`));
        });
        return;
      }
      if (isClientError(status)) { resolve(err(`${OPENAPI_DOWNLOAD_FAILED_PREFIX}HTTP ${status}`)); return; }
      collectBody(res, resolve);
    }).on("error", (e) => { resolve(err(`${OPENAPI_DOWNLOAD_FAILED_PREFIX}${e.message}`)); });
  });
}

const askForUrl = async (): Promise<string | undefined> =>
  await vscode.window.showInputBox({
    prompt: OPENAPI_URL_PROMPT,
    placeHolder: OPENAPI_URL_PLACEHOLDER,
    ignoreFocusOut: true,
  });

export const saveTempSpec = (content: string, outDir: string): string => {
  const specPath = path.join(outDir, ".openapi-spec.json");
  fs.writeFileSync(specPath, content, "utf-8");
  return specPath;
};

// ─── Shared generate + enrich flow ──────────────────────────

const generateAndEnrich = async (
  specPath: string,
  outDir: string,
  ctx: ImportContext
): Promise<void> => {
  const choice = await askAiChoice();
  if (choice === undefined) { return; }
  const result = await callCliGenerate(specPath, outDir);
  if (!result.ok) {
    await vscode.window.showErrorMessage(`${OPENAPI_ERROR_PREFIX}${result.error}`);
    return;
  }
  if (choice === OPENAPI_AI_CHOICE_ENHANCED) {
    await runAiEnrichment(outDir, ctx.logger);
  }
  await handleSuccess(outDir, result.value, ctx);
};

// ─── Main entry points ──────────────────────────────────────

export const importOpenApiFromUrl = async (
  explorer: ExplorerAdapter,
  logger: Logger
): Promise<void> => {
  const url = await askForUrl();
  if (url === undefined || url.length === 0) { return; }
  const outFolder = await pickOutputFolder();
  const outDir = outFolder?.[0]?.fsPath;
  if (outDir === undefined) { return; }
  const specResult = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: OPENAPI_DOWNLOADING, cancellable: false },
    async () => await downloadSpec(url)
  );
  if (!specResult.ok) {
    await vscode.window.showErrorMessage(`${OPENAPI_ERROR_PREFIX}${specResult.error}`);
    return;
  }
  const specPath = saveTempSpec(specResult.value, outDir);
  await generateAndEnrich(specPath, outDir, { explorer, logger });
};

export const importOpenApiFromFile = async (
  explorer: ExplorerAdapter,
  logger: Logger
): Promise<void> => {
  const paths = await pickPaths();
  if (paths === undefined) { return; }
  await generateAndEnrich(paths.specFile.fsPath, paths.outFolder.fsPath, { explorer, logger });
};
