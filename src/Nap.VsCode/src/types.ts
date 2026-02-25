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

export const enum RunState {
  Idle = 0,
  Running = 1,
  Passed = 2,
  Failed = 3,
  Error = 4,
}
