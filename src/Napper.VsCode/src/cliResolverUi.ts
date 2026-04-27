// Implements [vscode-cli-acquisition]
// VSCode SDK glue for the CLI resolver: consent modal, progress, tank notification.
// Decoupled from resolver logic — calls resolveCli with a real exec backed by child_process.

import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { resolveCli, type ResolverExec } from './cliResolver';
import type { ExecCommand, ExecResult } from './cliResolverCommands';
import {
  CLI_CONSENT_CANCEL_BTN,
  CLI_CONSENT_INSTALL_BTN,
  CLI_CONSENT_MSG_PREFIX,
  CLI_CONSENT_MSG_SUFFIX,
  CLI_INSTALL_MSG,
  CLI_PROGRESS_DOTNET_PREFIX,
  CLI_PROGRESS_DOTNET_SUFFIX,
  CLI_TANK_BREW_URL,
  CLI_TANK_CHOCO_URL,
  CLI_TANK_MSG_MISMATCH_MIDDLE,
  CLI_TANK_MSG_MISMATCH_PREFIX,
  CLI_TANK_MSG_MISMATCH_SUFFIX,
  CLI_TANK_MSG_PM_FAILED_PREFIX,
  CLI_TANK_MSG_PM_FAILED_SUFFIX,
  CLI_TANK_MSG_PM_MISSING_PREFIX,
  CLI_TANK_MSG_PM_MISSING_SUFFIX,
  CLI_TANK_MSG_RESTART,
  CLI_TANK_MSG_TOOL_FAILED,
  CLI_TANK_OPEN_BREW,
  CLI_TANK_OPEN_CHOCO,
  CLI_TANK_OPEN_SCOOP,
  CLI_TANK_RELOAD,
  CLI_TANK_SCOOP_URL,
} from './constants';
import { ResolverErrorKind, type PackageManager, type ResolverError, type ResolverPlatform } from './types';

export interface EnsureCliArgs {
  readonly vsixVersion: string;
  readonly configuredCliPath?: string | undefined;
  readonly platform: ResolverPlatform;
  readonly outputChannel: vscode.OutputChannel;
}

export async function ensureCli(args: EnsureCliArgs): Promise<string | undefined> {
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: CLI_INSTALL_MSG, cancellable: false },
    async (progress) =>
      resolveCli({
        vsixVersion: args.vsixVersion,
        configuredCliPath: args.configuredCliPath,
        platform: args.platform,
        exec: makeExec(args.outputChannel),
        confirmDotnetInstall: makeConsentFn(progress),
      }),
  );
  if (result.ok) {
    return result.value.cliPath;
  }
  showTank(result.error, args.vsixVersion, args.outputChannel);
  return undefined;
}

async function spawnExec(command: ExecCommand, outputChannel: vscode.OutputChannel): Promise<ExecResult> {
  return new Promise<ExecResult>((resolve) => {
    execFile(command.command, [...command.args], { timeout: 120000 }, (error, stdout, stderr) => {
      outputChannel.appendLine(`> ${command.command} ${command.args.join(' ')}`);
      if (stdout.length > 0) { outputChannel.appendLine(stdout); }
      if (stderr.length > 0) { outputChannel.appendLine(stderr); }
      const exitCode = error !== null ? exitCodeOf(error) : 0;
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function exitCodeOf(error: Error): number {
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'number' ? code : 1;
}

function makeExec(outputChannel: vscode.OutputChannel): ResolverExec {
  return async (command: ExecCommand) => spawnExec(command, outputChannel);
}

function makeConsentFn(
  progress: vscode.Progress<{ readonly message?: string }>,
): (args: { readonly packageManager: PackageManager }) => Promise<boolean> {
  return async ({ packageManager }) => {
    const choice = await vscode.window.showInformationMessage(
      `${CLI_CONSENT_MSG_PREFIX}${packageManager}${CLI_CONSENT_MSG_SUFFIX}`,
      CLI_CONSENT_INSTALL_BTN,
      CLI_CONSENT_CANCEL_BTN,
    );
    if (choice === CLI_CONSENT_INSTALL_BTN) {
      progress.report({ message: `${CLI_PROGRESS_DOTNET_PREFIX}${packageManager}${CLI_PROGRESS_DOTNET_SUFFIX}` });
      return true;
    }
    return false;
  };
}

function showTank(error: ResolverError, vsixVersion: string, outputChannel: vscode.OutputChannel): void {
  outputChannel.appendLine(`CLI resolver failed: ${error.kind}`);
  switch (error.kind) {
    case ResolverErrorKind.PmMissing: showPmMissingTank(error.os); break;
    case ResolverErrorKind.PmInstallFailed: showPmFailedTank(error.pm, error.stderr); break;
    case ResolverErrorKind.ToolInstallFailed: void vscode.window.showErrorMessage(CLI_TANK_MSG_TOOL_FAILED); break;
    case ResolverErrorKind.RestartRequired: showRestartTank(); break;
    case ResolverErrorKind.PathMismatch:
      void vscode.window.showErrorMessage(
        `${CLI_TANK_MSG_MISMATCH_PREFIX}${vsixVersion}${CLI_TANK_MSG_MISMATCH_MIDDLE}${error.actual}${CLI_TANK_MSG_MISMATCH_SUFFIX}`,
      );
      break;
    case ResolverErrorKind.ConsentDeclined: break;
    case ResolverErrorKind.DotnetMissing: break;
  }
}

function showPmMissingTankWin(): void {
  const msg = `${CLI_TANK_MSG_PM_MISSING_PREFIX}Scoop or Chocolatey${CLI_TANK_MSG_PM_MISSING_SUFFIX}`;
  void vscode.window.showErrorMessage(msg, CLI_TANK_OPEN_SCOOP, CLI_TANK_OPEN_CHOCO).then((c) => {
    if (c === CLI_TANK_OPEN_SCOOP) { void vscode.env.openExternal(vscode.Uri.parse(CLI_TANK_SCOOP_URL)); }
    else if (c === CLI_TANK_OPEN_CHOCO) { void vscode.env.openExternal(vscode.Uri.parse(CLI_TANK_CHOCO_URL)); }
  });
}

function showPmMissingTankUnix(): void {
  const msg = `${CLI_TANK_MSG_PM_MISSING_PREFIX}Homebrew${CLI_TANK_MSG_PM_MISSING_SUFFIX}`;
  void vscode.window.showErrorMessage(msg, CLI_TANK_OPEN_BREW).then((c) => {
    if (c === CLI_TANK_OPEN_BREW) { void vscode.env.openExternal(vscode.Uri.parse(CLI_TANK_BREW_URL)); }
  });
}

function showPmMissingTank(os: ResolverPlatform): void {
  if (os === 'win32') { showPmMissingTankWin(); } else { showPmMissingTankUnix(); }
}

function showPmFailedTank(pm: PackageManager, stderr: string): void {
  void vscode.window.showErrorMessage(
    `${CLI_TANK_MSG_PM_FAILED_PREFIX}${pm}${CLI_TANK_MSG_PM_FAILED_SUFFIX}\n${stderr}`,
  );
}

function showRestartTank(): void {
  void vscode.window.showWarningMessage(CLI_TANK_MSG_RESTART, CLI_TANK_RELOAD).then((c) => {
    if (c === CLI_TANK_RELOAD) { void vscode.commands.executeCommand('workbench.action.reloadWindow'); }
  });
}
