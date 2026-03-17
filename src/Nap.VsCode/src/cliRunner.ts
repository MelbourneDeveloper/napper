// Specs: vscode-impl
// Runs the Napper CLI as a subprocess and parses JSON results
// Decoupled from vscode SDK — takes config values as parameters

import { execFile, spawn } from 'child_process';
import {
  CLI_CMD_CHECK,
  CLI_CMD_RUN,
  CLI_FLAG_ENV,
  CLI_FLAG_OUTPUT,
  CLI_OUTPUT_JSON,
  CLI_OUTPUT_NDJSON,
  CLI_PARSE_FAILED_PREFIX,
  CLI_SPAWN_FAILED_PREFIX,
  DEFAULT_CLI_PATH,
} from './constants';
import { type Result, type RunResult, err, ok } from './types';

const MAX_PREVIEW_LENGTH = 200;

interface RunOptions {
  readonly cliPath: string;
  readonly filePath: string;
  readonly env?: string | undefined;
  readonly vars?: readonly string[];
  readonly cwd: string;
}

const appendEnvArgs = (args: string[], env: string | undefined): void => {
    if (env !== undefined && env !== '') {
      args.push(CLI_FLAG_ENV, env);
    }
  },
  buildArgs = (options: RunOptions): readonly string[] => {
    const args: string[] = [CLI_CMD_RUN, options.filePath, CLI_FLAG_OUTPUT, CLI_OUTPUT_JSON];
    appendEnvArgs(args, options.env);
    return args;
  },
  parseJsonOutput = (stdout: string): Result<readonly RunResult[], string> => {
    try {
      const parsed: unknown = JSON.parse(stdout);
      if (Array.isArray(parsed)) {
        // validated: JSON.parse produced an array; elements typed at consumption
        return ok(parsed);
      }
      return ok([parsed as RunResult]);
    } catch {
      return err(`${CLI_PARSE_FAILED_PREFIX}${stdout.slice(0, MAX_PREVIEW_LENGTH)}`);
    }
  },
  formatSpawnError = (cliPath: string, error: Error, stderr: string): string => {
    const code = 'code' in error ? ` (${String(error.code)})` : '',
      stderrSuffix = stderr.length > 0 ? ` — ${stderr}` : '';
    return `${CLI_SPAWN_FAILED_PREFIX}${cliPath}${code}${stderrSuffix}`;
  },
  spawnCli = async (
    cliPath: string,
    args: readonly string[],
    cwd: string,
  ): Promise<Result<readonly RunResult[], string>> =>
    new Promise((resolve) => {
      execFile(
        cliPath,
        [...args],
        { cwd, timeout: 30_000, env: { ...process.env } },
        (error, stdout, stderr) => {
          if (error !== null && stdout.length === 0) {
            resolve(err(formatSpawnError(cliPath, error, stderr)));
            return;
          }
          resolve(parseJsonOutput(stdout));
        },
      );
    }),
  resolveCliPath = (cliPath: string): string => (cliPath.length > 0 ? cliPath : DEFAULT_CLI_PATH);

export const runCli = async (
  options: RunOptions,
): Promise<Result<readonly RunResult[], string>> => {
  const cliPath = resolveCliPath(options.cliPath),
    args = buildArgs(options);
  return spawnCli(cliPath, args, options.cwd);
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
    const args: string[] = [CLI_CMD_RUN, options.filePath, CLI_FLAG_OUTPUT, CLI_OUTPUT_NDJSON];
    appendEnvArgs(args, options.env);
    return args;
  },
  parseLine = (line: string): Result<RunResult, string> => {
    try {
      return ok(JSON.parse(line));
    } catch {
      return err(`${CLI_PARSE_FAILED_PREFIX}${line.slice(0, MAX_PREVIEW_LENGTH)}`);
    }
  },
  emitParsedLine = (trimmed: string, onResult: (result: RunResult) => void): void => {
    const parsed = parseLine(trimmed);
    if (parsed.ok) {
      onResult(parsed.value);
    }
  },
  processChunk = (buffer: string, chunk: Buffer, onResult: (result: RunResult) => void): string => {
    const combined = buffer + chunk.toString(),
      lines = combined.split('\n'),
      remainder = lines.pop() ?? '';
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
    ctx.child.stdout?.on('data', (chunk: Buffer) => {
      ctx.state.buffer = processChunk(ctx.state.buffer, chunk, ctx.options.onResult);
    });
    ctx.child.stderr?.on('data', (chunk: Buffer) => {
      ctx.state.stderrOutput += chunk.toString();
    });
  },
  handleClose = (ctx: StreamListenerContext): void => {
    if (ctx.state.finished) {
      return;
    }
    ctx.state.finished = true;
    flushAndFinish({
      buffer: ctx.state.buffer,
      onResult: ctx.options.onResult,
      stderrOutput: ctx.state.stderrOutput,
      onDone: ctx.options.onDone,
    });
  },
  handleError = (ctx: StreamListenerContext, error: Error): void => {
    if (ctx.state.finished) {
      return;
    }
    ctx.state.finished = true;
    ctx.options.onDone(`${CLI_SPAWN_FAILED_PREFIX}${ctx.cliPath} — ${error.message}`);
  },
  attachLifecycleListeners = (ctx: StreamListenerContext): void => {
    ctx.child.on('close', () => {
      handleClose(ctx);
    });
    ctx.child.on('error', (error) => {
      handleError(ctx, error);
    });
  };

export const streamCli = (options: StreamOptions): void => {
  const cliPath = resolveCliPath(options.cliPath),
    args = buildStreamArgs(options),
    child = spawn(cliPath, [...args], {
      cwd: options.cwd,
      env: { ...process.env },
    }),
    state: StreamState = { buffer: '', stderrOutput: '', finished: false },
    ctx: StreamListenerContext = { child, state, options, cliPath };
  attachDataListeners(ctx);
  attachLifecycleListeners(ctx);
};

export const checkFile = async (
  cliPath: string,
  filePath: string,
  cwd: string,
): Promise<Result<string, string>> =>
  new Promise((resolve) => {
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
      },
    );
  });
