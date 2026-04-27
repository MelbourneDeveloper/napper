// Types mirroring the F# domain model and JSON output

export interface AssertionResult {
  readonly target: string;
  readonly passed: boolean;
  readonly expected: string;
  readonly actual: string;
}

export interface RunResult {
  readonly file: string;
  readonly passed: boolean;
  readonly error?: string;
  readonly statusCode?: number;
  readonly duration?: number;
  readonly bodyLength?: number;
  readonly body?: string;
  readonly requestMethod?: string;
  readonly requestUrl?: string;
  readonly requestHeaders?: Readonly<Record<string, string>>;
  readonly requestBody?: string;
  readonly requestBodyContentType?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly assertions: readonly AssertionResult[];
  readonly log?: readonly string[];
}

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({
  ok: true,
  value,
});

export const err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

export const enum ResolverErrorKind {
  PathMismatch = 'path-mismatch',
  DotnetMissing = 'dotnet-missing',
  ConsentDeclined = 'consent-declined',
  PmMissing = 'pm-missing',
  PmInstallFailed = 'pm-install-failed',
  ToolInstallFailed = 'tool-install-failed',
  RestartRequired = 'restart-required',
}

export type ResolverPlatform = 'darwin' | 'linux' | 'win32';

export type PackageManager = 'brew' | 'scoop' | 'choco';

export type ResolverError =
  | {
      readonly kind: ResolverErrorKind.PathMismatch;
      readonly expected: string;
      readonly actual: string;
    }
  | { readonly kind: ResolverErrorKind.DotnetMissing }
  | { readonly kind: ResolverErrorKind.ConsentDeclined }
  | { readonly kind: ResolverErrorKind.PmMissing; readonly os: ResolverPlatform }
  | {
      readonly kind: ResolverErrorKind.PmInstallFailed;
      readonly pm: PackageManager;
      readonly stderr: string;
      readonly exitCode: number;
    }
  | {
      readonly kind: ResolverErrorKind.ToolInstallFailed;
      readonly stderr: string;
      readonly exitCode: number;
    }
  | { readonly kind: ResolverErrorKind.RestartRequired };

export const enum RunState {
  Idle,
  Running,
  Passed,
  Failed,
  Error,
}
