import {
  CLI_BINARY_NAME,
  CLI_RESOLVER_UNKNOWN_ERROR,
  CLI_TOOL_INSTALL_ARG,
  CLI_TOOL_UPDATE_ARG,
  DEFAULT_CLI_PATH,
} from './constants';
import {
  dotnetToolCommand,
  dotnetVersionCommand,
  packageManagers,
  type ExecCommand,
  type ExecResult,
  type PackageManagerCommands,
  versionCommand,
} from './cliResolverCommands';
import {
  err,
  ok,
  type PackageManager,
  type ResolverError,
  ResolverErrorKind,
  type ResolverPlatform,
  type Result,
} from './types';

export type ResolverExec = (command: ExecCommand) => Promise<ExecResult>;

export type ConfirmDotnetInstall = (args: {
  readonly packageManager: PackageManager;
}) => Promise<boolean>;

export interface ResolveCliArgs {
  readonly vsixVersion: string;
  readonly configuredCliPath?: string;
  readonly platform: ResolverPlatform;
  readonly exec: ResolverExec;
  readonly confirmDotnetInstall: ConfirmDotnetInstall;
}

interface ResolverContext extends ResolveCliArgs {
  readonly initialCliPath: string;
}

type VersionProbe =
  | { readonly kind: 'match' | 'missing' }
  | { readonly kind: 'mismatch'; readonly actual: string };

export async function resolveCli(
  args: ResolveCliArgs,
): Promise<Result<{ readonly cliPath: string }, ResolverError>> {
  const context = buildContext({ args });
  const pathProbe = await probeCli({ context, cliPath: context.initialCliPath });
  if (pathProbe.kind === 'match') {
    return ok({ cliPath: context.initialCliPath });
  }
  const dotnet = await ensureDotnet({ context });
  return dotnet.ok ? ensureNapperTool({ context, pathProbe }) : err(dotnet.error);
}

function buildContext({ args }: { readonly args: ResolveCliArgs }): ResolverContext {
  return {
    ...args,
    initialCliPath: resolveInitialCliPath({ configuredCliPath: args.configuredCliPath }),
  };
}

function resolveInitialCliPath({
  configuredCliPath,
}: {
  readonly configuredCliPath: string | undefined;
}): string {
  return configuredCliPath === undefined || configuredCliPath.length === 0
    ? DEFAULT_CLI_PATH
    : configuredCliPath;
}

async function ensureDotnet({
  context,
}: {
  readonly context: ResolverContext;
}): Promise<Result<void, ResolverError>> {
  const dotnetProbe = await runExec({ exec: context.exec, command: dotnetVersionCommand() });
  if (isSuccess({ result: dotnetProbe })) {
    return ok(undefined);
  }
  const commands = packageManagers({ platform: context.platform });
  const pm = await detectPackageManager({ context, commands });
  if (!pm.ok) {
    return err(pm.error);
  }
  const consent = await context.confirmDotnetInstall({ packageManager: pm.value.packageManager });
  return consent
    ? installDotnet({ context, commands: pm.value })
    : err({ kind: ResolverErrorKind.ConsentDeclined });
}

async function installDotnet({
  context,
  commands,
}: {
  readonly context: ResolverContext;
  readonly commands: PackageManagerCommands;
}): Promise<Result<void, ResolverError>> {
  const install = await runInstallCommands({ context, commands });
  if (!install.ok) {
    return err(install.error);
  }
  const dotnetProbe = await runExec({ exec: context.exec, command: dotnetVersionCommand() });
  return isSuccess({ result: dotnetProbe })
    ? ok(undefined)
    : err({ kind: ResolverErrorKind.RestartRequired });
}

async function ensureNapperTool({
  context,
  pathProbe,
}: {
  readonly context: ResolverContext;
  readonly pathProbe: VersionProbe;
}): Promise<Result<{ readonly cliPath: string }, ResolverError>> {
  const tool = await runExec({
    exec: context.exec,
    command: dotnetToolCommand({
      action: pathProbe.kind === 'mismatch' ? CLI_TOOL_UPDATE_ARG : CLI_TOOL_INSTALL_ARG,
      version: context.vsixVersion,
    }),
  });
  return isSuccess({ result: tool })
    ? probeInstalledCli({ context })
    : err(toolInstallFailed({ result: tool }));
}

async function probeInstalledCli({
  context,
}: {
  readonly context: ResolverContext;
}): Promise<Result<{ readonly cliPath: string }, ResolverError>> {
  const probe = await probeCli({ context, cliPath: CLI_BINARY_NAME });
  if (probe.kind === 'match') {
    return ok({ cliPath: CLI_BINARY_NAME });
  }
  return probe.kind === 'mismatch'
    ? err(pathMismatch({ context, actual: probe.actual }))
    : err({ kind: ResolverErrorKind.RestartRequired });
}

async function probeCli({
  context,
  cliPath,
}: {
  readonly context: ResolverContext;
  readonly cliPath: string;
}): Promise<VersionProbe> {
  const result = await runExec({ exec: context.exec, command: versionCommand({ cliPath }) });
  if (!isSuccess({ result })) {
    return { kind: 'missing' };
  }
  const actual = result.stdout.trim();
  return actual === context.vsixVersion ? { kind: 'match' } : { kind: 'mismatch', actual };
}

async function detectPackageManager({
  context,
  commands,
}: {
  readonly context: ResolverContext;
  readonly commands: readonly PackageManagerCommands[];
}): Promise<Result<PackageManagerCommands, ResolverError>> {
  const command = commands[0];
  if (command === undefined) {
    return err({ kind: ResolverErrorKind.PmMissing, os: context.platform });
  }
  const result = await runExec({ exec: context.exec, command: command.detect });
  return isSuccess({ result })
    ? ok(command)
    : detectPackageManager({ context, commands: commands.slice(1) });
}

async function runInstallCommands({
  context,
  commands,
}: {
  readonly context: ResolverContext;
  readonly commands: PackageManagerCommands;
}): Promise<Result<void, ResolverError>> {
  const command = commands.install[0];
  if (command === undefined) {
    return ok(undefined);
  }
  const result = await runExec({ exec: context.exec, command });
  return isSuccess({ result })
    ? runInstallCommands({ context, commands: { ...commands, install: commands.install.slice(1) } })
    : err(pmInstallFailed({ commands, result }));
}

async function runExec({
  exec,
  command,
}: {
  readonly exec: ResolverExec;
  readonly command: ExecCommand;
}): Promise<ExecResult> {
  try {
    return await exec(command);
  } catch (error: unknown) {
    const stderr = error instanceof Error ? error.message : CLI_RESOLVER_UNKNOWN_ERROR;
    return { exitCode: 1, stdout: '', stderr };
  }
}

function isSuccess({ result }: { readonly result: ExecResult }): boolean {
  return result.exitCode === 0;
}

function pathMismatch({
  context,
  actual,
}: {
  readonly context: ResolverContext;
  readonly actual: string;
}): ResolverError {
  return { kind: ResolverErrorKind.PathMismatch, expected: context.vsixVersion, actual };
}

function pmInstallFailed({
  commands,
  result,
}: {
  readonly commands: PackageManagerCommands;
  readonly result: ExecResult;
}): ResolverError {
  return {
    kind: ResolverErrorKind.PmInstallFailed,
    pm: commands.packageManager,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

function toolInstallFailed({ result }: { readonly result: ExecResult }): ResolverError {
  return {
    kind: ResolverErrorKind.ToolInstallFailed,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}
