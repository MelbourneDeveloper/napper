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

interface RunOptions {
  readonly cliPath: string;
  readonly filePath: string;
  readonly env?: string;
  readonly vars?: readonly string[];
  readonly cwd: string;
}

const buildArgs = (options: RunOptions): readonly string[] => {
  const args: string[] = [
    CLI_CMD_RUN,
    options.filePath,
    CLI_FLAG_OUTPUT,
    CLI_OUTPUT_JSON,
  ];

  if (options.env) {
    args.push(CLI_FLAG_ENV, options.env);
  }

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
    return err(`${CLI_PARSE_FAILED_PREFIX}${stdout.slice(0, 200)}`);
  }
};

const formatSpawnError = (
  cliPath: string,
  error: Error,
  stderr: string
): string => {
  const code = "code" in error ? ` (${String(error.code)})` : "";
  const stderrSuffix = stderr ? ` — ${stderr}` : "";
  return `${CLI_SPAWN_FAILED_PREFIX}${cliPath}${code}${stderrSuffix}`;
};

const spawnCli = (
  cliPath: string,
  args: readonly string[],
  cwd: string
): Promise<Result<readonly RunResult[], string>> =>
  new Promise((resolve) => {
    execFile(
      cliPath,
      args as string[],
      { cwd, timeout: 30_000, env: { ...process.env } },
      (error, stdout, stderr) => {
        if (error && !stdout) {
          resolve(err(formatSpawnError(cliPath, error, stderr)));
          return;
        }
        resolve(parseJsonOutput(stdout));
      }
    );
  });

export const runCli = async (
  options: RunOptions
): Promise<Result<readonly RunResult[], string>> => {
  const cliPath = options.cliPath || DEFAULT_CLI_PATH;
  const args = buildArgs(options);
  return spawnCli(cliPath, args, options.cwd);
};

interface StreamOptions {
  readonly cliPath: string;
  readonly filePath: string;
  readonly env?: string;
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

  if (options.env) {
    args.push(CLI_FLAG_ENV, options.env);
  }

  return args;
};

const parseLine = (line: string): Result<RunResult, string> => {
  try {
    return ok(JSON.parse(line) as RunResult);
  } catch {
    return err(`${CLI_PARSE_FAILED_PREFIX}${line.slice(0, 200)}`);
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

export const streamCli = (options: StreamOptions): void => {
  const cliPath = options.cliPath || DEFAULT_CLI_PATH;
  const args = buildStreamArgs(options);

  const child = spawn(cliPath, args as string[], {
    cwd: options.cwd,
    env: { ...process.env },
  });

  let buffer = "";
  let stderrOutput = "";
  let finished = false;

  child.stdout.on("data", (chunk: Buffer) => {
    buffer = processChunk(buffer, chunk, options.onResult);
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderrOutput += chunk.toString();
  });

  child.on("close", () => {
    if (finished) return;
    finished = true;
    const remaining = buffer.trim();
    if (remaining.length > 0) {
      emitParsedLine(remaining, options.onResult);
    }
    options.onDone(stderrOutput.length > 0 ? stderrOutput : undefined);
  });

  child.on("error", (error) => {
    if (finished) return;
    finished = true;
    options.onDone(`${CLI_SPAWN_FAILED_PREFIX}${cliPath} — ${error.message}`);
  });
};

export const checkFile = (
  cliPath: string,
  filePath: string,
  cwd: string
): Promise<Result<string, string>> =>
  new Promise((resolve) => {
    const cmd = cliPath || DEFAULT_CLI_PATH;
    execFile(
      cmd,
      [CLI_CMD_CHECK, filePath],
      { cwd, timeout: 10_000, env: { ...process.env } },
      (error, stdout, stderr) => {
        if (error) {
          resolve(err(stderr || error.message));
          return;
        }
        resolve(ok(stdout));
      }
    );
  });
