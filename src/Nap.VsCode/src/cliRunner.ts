// Runs the Napper CLI as a subprocess and parses JSON results
// Decoupled from vscode SDK — takes config values as parameters

import { execFile, spawn } from "child_process";
import {
  CLI_CMD_RUN,
  CLI_CMD_CHECK,
  CLI_FLAG_ENV,
  CLI_FLAG_OUTPUT,
  CLI_OUTPUT_JSON,
  CLI_OUTPUT_NDJSON,
  CLI_SPAWN_FAILED_PREFIX,
  CLI_PARSE_FAILED_PREFIX,
  DEFAULT_CLI_PATH,
} from "./constants";
import { type RunResult, type Result, ok, err } from "./types";

const MAX_PREVIEW_LENGTH = 200;

interface RunOptions {
  readonly cliPath: string;
  readonly filePath: string;
  readonly env?: string | undefined;
  readonly vars?: readonly string[];
  readonly cwd: string;
}

const appendEnvArgs = (
  args: string[],
  env: string | undefined
): void => {
  if (env !== undefined && env !== "") {
    args.push(CLI_FLAG_ENV, env);
  }
};

const buildArgs = (options: RunOptions): readonly string[] => {
  const args: string[] = [
    CLI_CMD_RUN,
    options.filePath,
    CLI_FLAG_OUTPUT,
    CLI_OUTPUT_JSON,
  ];
  appendEnvArgs(args, options.env);
  return args;
};

const parseJsonOutput = (
  stdout: string
): Result<readonly RunResult[], string> => {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (Array.isArray(parsed)) {
      return ok(parsed as readonly RunResult[]);
    }
    return ok([parsed as RunResult]);
  } catch {
    return err(`${CLI_PARSE_FAILED_PREFIX}${stdout.slice(0, MAX_PREVIEW_LENGTH)}`);
  }
};

const formatSpawnError = (
  cliPath: string,
  error: Error,
  stderr: string
): string => {
  const code = "code" in error ? ` (${String(error.code)})` : "";
  const stderrSuffix = stderr.length > 0 ? ` — ${stderr}` : "";
  return `${CLI_SPAWN_FAILED_PREFIX}${cliPath}${code}${stderrSuffix}`;
};

const spawnCli = async (
  cliPath: string,
  args: readonly string[],
  cwd: string
): Promise<Result<readonly RunResult[], string>> =>
  await new Promise((resolve) => {
    execFile(
      cliPath,
      args as string[],
      { cwd, timeout: 30_000, env: { ...process.env } },
      (error, stdout, stderr) => {
        if (error !== null && stdout.length === 0) {
          resolve(err(formatSpawnError(cliPath, error, stderr)));
          return;
        }
        resolve(parseJsonOutput(stdout));
      }
    );
  });

const resolveCliPath = (cliPath: string): string =>
  cliPath.length > 0 ? cliPath : DEFAULT_CLI_PATH;

export const runCli = async (
  options: RunOptions
): Promise<Result<readonly RunResult[], string>> => {
  const cliPath = resolveCliPath(options.cliPath);
  const args = buildArgs(options);
  return await spawnCli(cliPath, args, options.cwd);
};

interface StreamOptions {
  readonly cliPath: string;
  readonly filePath: string;
  readonly env?: string | undefined;
  readonly cwd: string;
  readonly onResult: (result: RunResult) => void;
  readonly onDone: (error?: string) => void;
}

const buildStreamArgs = (options: StreamOptions): readonly string[] => {
  const args: string[] = [
    CLI_CMD_RUN,
    options.filePath,
    CLI_FLAG_OUTPUT,
    CLI_OUTPUT_NDJSON,
  ];
  appendEnvArgs(args, options.env);
  return args;
};

const parseLine = (line: string): Result<RunResult, string> => {
  try {
    return ok(JSON.parse(line) as RunResult);
  } catch {
    return err(`${CLI_PARSE_FAILED_PREFIX}${line.slice(0, MAX_PREVIEW_LENGTH)}`);
  }
};

const emitParsedLine = (
  trimmed: string,
  onResult: (result: RunResult) => void
): void => {
  const parsed = parseLine(trimmed);
  if (parsed.ok) {
    onResult(parsed.value);
  }
};

const processChunk = (
  buffer: string,
  chunk: Buffer,
  onResult: (result: RunResult) => void
): string => {
  const combined = buffer + chunk.toString();
  const lines = combined.split("\n");
  const remainder = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      emitParsedLine(trimmed, onResult);
    }
  }
  return remainder;
};

interface FlushContext {
  readonly buffer: string;
  readonly onResult: (result: RunResult) => void;
  readonly stderrOutput: string;
  readonly onDone: (error?: string) => void;
}

const flushAndFinish = (ctx: FlushContext): void => {
  const remaining = ctx.buffer.trim();
  if (remaining.length > 0) {
    emitParsedLine(remaining, ctx.onResult);
  }
  ctx.onDone(ctx.stderrOutput.length > 0 ? ctx.stderrOutput : undefined);
};

interface StreamState {
  buffer: string;
  stderrOutput: string;
  finished: boolean;
}

interface StreamListenerContext {
  readonly child: ReturnType<typeof spawn>;
  readonly state: StreamState;
  readonly options: StreamOptions;
  readonly cliPath: string;
}

const attachDataListeners = (ctx: StreamListenerContext): void => {
  ctx.child.stdout?.on("data", (chunk: Buffer) => {
    ctx.state.buffer = processChunk(ctx.state.buffer, chunk, ctx.options.onResult);
  });
  ctx.child.stderr?.on("data", (chunk: Buffer) => {
    ctx.state.stderrOutput += chunk.toString();
  });
};

const attachLifecycleListeners = (ctx: StreamListenerContext): void => {
  ctx.child.on("close", () => {
    if (ctx.state.finished) { return; }
    ctx.state.finished = true;
    flushAndFinish({ buffer: ctx.state.buffer, onResult: ctx.options.onResult, stderrOutput: ctx.state.stderrOutput, onDone: ctx.options.onDone });
  });
  ctx.child.on("error", (error) => {
    if (ctx.state.finished) { return; }
    ctx.state.finished = true;
    ctx.options.onDone(`${CLI_SPAWN_FAILED_PREFIX}${ctx.cliPath} — ${error.message}`);
  });
};

export const streamCli = (options: StreamOptions): void => {
  const cliPath = resolveCliPath(options.cliPath);
  const args = buildStreamArgs(options);
  const child = spawn(cliPath, args as string[], {
    cwd: options.cwd,
    env: { ...process.env },
  });
  const state: StreamState = { buffer: "", stderrOutput: "", finished: false };
  const ctx: StreamListenerContext = { child, state, options, cliPath };
  attachDataListeners(ctx);
  attachLifecycleListeners(ctx);
};

export const checkFile = async (
  cliPath: string,
  filePath: string,
  cwd: string
): Promise<Result<string, string>> =>
  await new Promise((resolve) => {
    const cmd = resolveCliPath(cliPath);
    execFile(
      cmd,
      [CLI_CMD_CHECK, filePath],
      { cwd, timeout: 10_000, env: { ...process.env } },
      (error, stdout, stderr) => {
        if (error !== null) {
          resolve(err(stderr.length > 0 ? stderr : error.message));
          return;
        }
        resolve(ok(stdout));
      }
    );
  });
