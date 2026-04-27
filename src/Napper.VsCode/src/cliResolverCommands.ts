// Implements [vscode-cli-acquisition]
// Command tables for the pure CLI resolver.

import {
  CLI_BINARY_NAME,
  CLI_DOTNET_CMD,
  CLI_PLATFORM_DARWIN,
  CLI_PLATFORM_LINUX,
  CLI_RESOLVER_ADD_ARG,
  CLI_RESOLVER_BUCKET_ARG,
  CLI_RESOLVER_CASK_FLAG,
  CLI_RESOLVER_DOTNET_SDK,
  CLI_RESOLVER_EXTRAS_ARG,
  CLI_RESOLVER_PM_BREW,
  CLI_RESOLVER_PM_CHOCO,
  CLI_RESOLVER_PM_SCOOP,
  CLI_RESOLVER_YES_FLAG,
  CLI_TOOL_ARG,
  CLI_TOOL_GLOBAL_FLAG,
  CLI_TOOL_INSTALL_ARG,
  CLI_TOOL_VERSION_FLAG,
  CLI_VERSION_FLAG,
} from './constants';
import type { PackageManager, ResolverPlatform } from './types';

export interface ExecCommand {
  readonly command: string;
  readonly args: readonly string[];
}

export interface ExecResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface PackageManagerCommands {
  readonly packageManager: PackageManager;
  readonly detect: ExecCommand;
  readonly install: readonly ExecCommand[];
}

export function packageManagers({
  platform,
}: {
  readonly platform: ResolverPlatform;
}): readonly PackageManagerCommands[] {
  if (platform === CLI_PLATFORM_DARWIN) {
    return [brewCommands({ cask: true })];
  }
  if (platform === CLI_PLATFORM_LINUX) {
    return [brewCommands({ cask: false })];
  }
  return [scoopCommands(), chocoCommands()];
}

export function versionCommand({ cliPath }: { readonly cliPath: string }): ExecCommand {
  return {
    command: cliPath,
    args: [CLI_VERSION_FLAG],
  };
}

export function dotnetVersionCommand(): ExecCommand {
  return {
    command: CLI_DOTNET_CMD,
    args: [CLI_VERSION_FLAG],
  };
}

export function dotnetToolCommand({
  action,
  version,
}: {
  readonly action: string;
  readonly version: string;
}): ExecCommand {
  return {
    command: CLI_DOTNET_CMD,
    args: [
      CLI_TOOL_ARG,
      action,
      CLI_TOOL_GLOBAL_FLAG,
      CLI_BINARY_NAME,
      CLI_TOOL_VERSION_FLAG,
      version,
    ],
  };
}

function brewCommands({ cask }: { readonly cask: boolean }): PackageManagerCommands {
  return {
    packageManager: CLI_RESOLVER_PM_BREW,
    detect: { command: CLI_RESOLVER_PM_BREW, args: [CLI_VERSION_FLAG] },
    install: [
      {
        command: CLI_RESOLVER_PM_BREW,
        args: cask
          ? [CLI_TOOL_INSTALL_ARG, CLI_RESOLVER_CASK_FLAG, CLI_RESOLVER_DOTNET_SDK]
          : [CLI_TOOL_INSTALL_ARG, CLI_RESOLVER_DOTNET_SDK],
      },
    ],
  };
}

function scoopCommands(): PackageManagerCommands {
  return {
    packageManager: CLI_RESOLVER_PM_SCOOP,
    detect: { command: CLI_RESOLVER_PM_SCOOP, args: [CLI_VERSION_FLAG] },
    install: [
      {
        command: CLI_RESOLVER_PM_SCOOP,
        args: [CLI_RESOLVER_BUCKET_ARG, CLI_RESOLVER_ADD_ARG, CLI_RESOLVER_EXTRAS_ARG],
      },
      { command: CLI_RESOLVER_PM_SCOOP, args: [CLI_TOOL_INSTALL_ARG, CLI_RESOLVER_DOTNET_SDK] },
    ],
  };
}

function chocoCommands(): PackageManagerCommands {
  return {
    packageManager: CLI_RESOLVER_PM_CHOCO,
    detect: { command: CLI_RESOLVER_PM_CHOCO, args: [CLI_VERSION_FLAG] },
    install: [
      {
        command: CLI_RESOLVER_PM_CHOCO,
        args: [CLI_TOOL_INSTALL_ARG, CLI_RESOLVER_DOTNET_SDK, CLI_RESOLVER_YES_FLAG],
      },
    ],
  };
}
