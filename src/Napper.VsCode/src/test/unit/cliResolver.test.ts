import * as assert from 'assert';
import type { ExecCommand, ExecResult } from '../../cliResolverCommands';
import { resolveCli, type ResolverExec } from '../../cliResolver';
import {
  CLI_BINARY_NAME,
  CLI_DOTNET_CMD,
  CLI_RESOLVER_PM_BREW,
  CLI_RESOLVER_PM_SCOOP,
  CLI_TOOL_UPDATE_ARG,
  CLI_VERSION_FLAG,
} from '../../constants';
import { ResolverErrorKind } from '../../types';

const VSIX_VERSION = '0.12.0',
  OLD_VERSION = '0.9.0',
  DOTNET_VERSION = '10.0.100',
  EXEC_FAILED: ExecResult = { exitCode: 1, stdout: '', stderr: 'ENOENT' };

interface MockExec {
  readonly exec: ResolverExec;
  readonly calls: ExecCommand[];
}

const success = ({ stdout }: { readonly stdout: string }): ExecResult => ({
  exitCode: 0,
  stdout,
  stderr: '',
});

const failure = ({ stderr }: { readonly stderr: string }): ExecResult => ({
  exitCode: 1,
  stdout: '',
  stderr,
});

const makeExec = ({ responses }: { readonly responses: readonly ExecResult[] }): MockExec => {
  const calls: ExecCommand[] = [];
  let index = 0;
  const exec: ResolverExec = async (command) => {
    calls.push(command);
    const response = responses[index] ?? EXEC_FAILED;
    index += 1;
    await Promise.resolve();
    return response;
  };
  return { exec, calls };
};

const consent =
  ({ value }: { readonly value: boolean }) =>
  async (): Promise<boolean> => {
    await Promise.resolve();
    return value;
  };

const callAt = ({
  calls,
  index,
}: {
  readonly calls: readonly ExecCommand[];
  readonly index: number;
}): ExecCommand => {
  const call = calls[index];
  assert.ok(call);
  return call;
};

suite('cliResolver', () => {
  test('returns configured CLI path when version matches', async () => {
    const mock = makeExec({ responses: [success({ stdout: `${VSIX_VERSION}\n` })] });
    const result = await resolveCli({
      vsixVersion: VSIX_VERSION,
      platform: 'darwin',
      exec: mock.exec,
      confirmDotnetInstall: consent({ value: true }),
    });
    assert.ok(result.ok);
    assert.strictEqual(result.value.cliPath, CLI_BINARY_NAME);
    assert.deepStrictEqual(mock.calls, [{ command: CLI_BINARY_NAME, args: [CLI_VERSION_FLAG] }]);
  });

  test('updates dotnet tool when PATH version mismatches', async () => {
    const mock = makeExec({
      responses: [
        success({ stdout: OLD_VERSION }),
        success({ stdout: DOTNET_VERSION }),
        success({ stdout: '' }),
        success({ stdout: VSIX_VERSION }),
      ],
    });
    const result = await resolveCli({
      vsixVersion: VSIX_VERSION,
      platform: 'darwin',
      exec: mock.exec,
      confirmDotnetInstall: consent({ value: true }),
    });
    assert.strictEqual(result.ok, true);
    const toolCall = callAt({ calls: mock.calls, index: 2 });
    assert.strictEqual(toolCall.command, CLI_DOTNET_CMD);
    assert.ok(toolCall.args.includes(CLI_TOOL_UPDATE_ARG));
  });

  test('installs dotnet through brew before installing napper', async () => {
    const mock = makeExec({
      responses: [
        EXEC_FAILED,
        EXEC_FAILED,
        success({ stdout: 'brew' }),
        success({ stdout: '' }),
        success({ stdout: DOTNET_VERSION }),
        success({ stdout: '' }),
        success({ stdout: VSIX_VERSION }),
      ],
    });
    const result = await resolveCli({
      vsixVersion: VSIX_VERSION,
      platform: 'darwin',
      exec: mock.exec,
      confirmDotnetInstall: consent({ value: true }),
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(callAt({ calls: mock.calls, index: 2 }).command, CLI_RESOLVER_PM_BREW);
    assert.strictEqual(callAt({ calls: mock.calls, index: 3 }).command, CLI_RESOLVER_PM_BREW);
  });

  test('returns pm-missing when no package manager exists', async () => {
    const mock = makeExec({ responses: [EXEC_FAILED, EXEC_FAILED, EXEC_FAILED] });
    const result = await resolveCli({
      vsixVersion: VSIX_VERSION,
      platform: 'linux',
      exec: mock.exec,
      confirmDotnetInstall: consent({ value: true }),
    });
    assert.ok(!result.ok);
    assert.strictEqual(result.error.kind, ResolverErrorKind.PmMissing);
    assert.strictEqual(result.error.os, 'linux');
  });

  test('returns consent-declined when user declines dotnet install', async () => {
    const mock = makeExec({ responses: [EXEC_FAILED, EXEC_FAILED, success({ stdout: 'brew' })] });
    const result = await resolveCli({
      vsixVersion: VSIX_VERSION,
      platform: 'darwin',
      exec: mock.exec,
      confirmDotnetInstall: consent({ value: false }),
    });
    assert.ok(!result.ok);
    assert.strictEqual(result.error.kind, ResolverErrorKind.ConsentDeclined);
  });

  test('returns pm-install-failed when package manager install fails', async () => {
    const mock = makeExec({
      responses: [
        EXEC_FAILED,
        EXEC_FAILED,
        success({ stdout: 'brew' }),
        failure({ stderr: 'no recipe' }),
      ],
    });
    const result = await resolveCli({
      vsixVersion: VSIX_VERSION,
      platform: 'darwin',
      exec: mock.exec,
      confirmDotnetInstall: consent({ value: true }),
    });
    assert.ok(!result.ok);
    assert.strictEqual(result.error.kind, ResolverErrorKind.PmInstallFailed);
  });

  test('uses scoop first on Windows when dotnet is missing', async () => {
    const mock = makeExec({
      responses: [
        EXEC_FAILED,
        EXEC_FAILED,
        success({ stdout: 'scoop' }),
        success({ stdout: '' }),
        success({ stdout: '' }),
        success({ stdout: DOTNET_VERSION }),
        success({ stdout: '' }),
        success({ stdout: VSIX_VERSION }),
      ],
    });
    const result = await resolveCli({
      vsixVersion: VSIX_VERSION,
      platform: 'win32',
      exec: mock.exec,
      confirmDotnetInstall: consent({ value: true }),
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(callAt({ calls: mock.calls, index: 2 }).command, CLI_RESOLVER_PM_SCOOP);
  });
});
