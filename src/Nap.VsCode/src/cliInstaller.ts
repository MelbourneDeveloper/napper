// Specs: vscode-impl
// CLI Installer — installs Napper CLI via dotnet tool install
// Decoupled from vscode SDK — takes config values as parameters

import { execFile } from 'child_process';
import { type Result, err, ok } from './types';
import {
  CLI_BINARY_NAME,
  CLI_DOTNET_CMD,
  CLI_DOTNET_TOOL_INSTALL_TIMEOUT,
  CLI_INSTALL_ERROR_PREFIX,
  CLI_TOOL_ARG,
  CLI_TOOL_INSTALL_ARG,
  CLI_TOOL_GLOBAL_FLAG,
  CLI_TOOL_VERSION_FLAG,
  CLI_TOOL_LIST_ARG,
  CLI_TOOL_UPDATE_ARG,
  CLI_VERSION_CHECK_ERROR,
  CLI_VERSION_CHECK_TIMEOUT,
  CLI_VERSION_FLAG,
} from './constants';

export const getCliVersion = async (cliPath: string): Promise<Result<string, string>> =>
  new Promise((resolve) => {
    execFile(
      cliPath,
      [CLI_VERSION_FLAG],
      { timeout: CLI_VERSION_CHECK_TIMEOUT },
      (error: Error | null, stdout: string) => {
        if (error !== null) {
          resolve(err(`${CLI_VERSION_CHECK_ERROR}${error.message}`));
          return;
        }
        resolve(ok(stdout.trim()));
      },
    );
  });

const parseToolVersion = (stdout: string): Result<string, string> => {
  const line = stdout.split('\n').find((l) => l.toLowerCase().startsWith(CLI_BINARY_NAME));
  if (line === undefined) {
    return err('not installed');
  }
  const parts = line.split(/\s+/);
  return ok(parts[1] ?? '');
};

const isToolInstalled = async (): Promise<Result<string, string>> =>
  new Promise((resolve) => {
    execFile(
      CLI_DOTNET_CMD,
      [CLI_TOOL_ARG, CLI_TOOL_LIST_ARG, CLI_TOOL_GLOBAL_FLAG],
      { timeout: CLI_VERSION_CHECK_TIMEOUT },
      (error: Error | null, stdout: string) => {
        if (error !== null) {
          resolve(err(error.message));
          return;
        }
        resolve(parseToolVersion(stdout));
      },
    );
  });

const runDotnetToolInstall = async (version: string): Promise<Result<void, string>> =>
  new Promise((resolve) => {
    execFile(
      CLI_DOTNET_CMD,
      [CLI_TOOL_ARG, CLI_TOOL_INSTALL_ARG, CLI_TOOL_GLOBAL_FLAG, CLI_BINARY_NAME, CLI_TOOL_VERSION_FLAG, version],
      { timeout: CLI_DOTNET_TOOL_INSTALL_TIMEOUT },
      (error: Error | null, _stdout: string, stderr: string) => {
        if (error !== null) {
          resolve(err(`${CLI_INSTALL_ERROR_PREFIX}${stderr || error.message}`));
          return;
        }
        resolve(ok(undefined));
      },
    );
  });

const runDotnetToolUpdate = async (version: string): Promise<Result<void, string>> =>
  new Promise((resolve) => {
    execFile(
      CLI_DOTNET_CMD,
      [CLI_TOOL_ARG, CLI_TOOL_UPDATE_ARG, CLI_TOOL_GLOBAL_FLAG, CLI_BINARY_NAME, CLI_TOOL_VERSION_FLAG, version],
      { timeout: CLI_DOTNET_TOOL_INSTALL_TIMEOUT },
      (error: Error | null, _stdout: string, stderr: string) => {
        if (error !== null) {
          resolve(err(`${CLI_INSTALL_ERROR_PREFIX}${stderr || error.message}`));
          return;
        }
        resolve(ok(undefined));
      },
    );
  });

export interface InstallResult {
  readonly cliPath: string;
}

export interface InstallCliParams {
  readonly version: string;
}

export const installCli = async (
  params: InstallCliParams,
): Promise<Result<InstallResult, string>> => {
  const existingVersion = await isToolInstalled();

  const installResult = existingVersion.ok
    ? await runDotnetToolUpdate(params.version)
    : await runDotnetToolInstall(params.version);

  if (!installResult.ok) {
    return err(installResult.error);
  }

  return ok({ cliPath: CLI_BINARY_NAME });
};
