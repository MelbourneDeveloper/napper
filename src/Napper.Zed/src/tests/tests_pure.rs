use crate::*;
use zed_extension_api::{process::Output, Extension};

// ─── build_relative_path ────────────────────────────────────

#[test]
fn relative_path_empty_prefix_returns_name() {
    assert_eq!(build_relative_path("", "file.nap"), "file.nap");
}

#[test]
fn relative_path_with_prefix_joins_with_slash() {
    assert_eq!(build_relative_path("subdir", "file.nap"), "subdir/file.nap");
}

#[test]
fn relative_path_nested_prefix() {
    assert_eq!(build_relative_path("a/b/c", "deep.nap"), "a/b/c/deep.nap");
}

// ─── format_run_success ─────────────────────────────────────

#[test]
fn run_success_returns_stdout_as_string() {
    let stdout = b"HTTP/1.1 200 OK\r\nContent-Type: application/json";
    assert_eq!(
        format_run_success(stdout),
        "HTTP/1.1 200 OK\r\nContent-Type: application/json"
    );
}

#[test]
fn run_success_handles_empty_stdout() {
    assert_eq!(format_run_success(b""), "");
}

#[test]
fn run_success_handles_non_utf8_bytes() {
    let stdout = vec![0xFF, 0xFE, b'O', b'K'];
    let result = format_run_success(&stdout);
    assert!(result.contains("OK"));
    assert!(result.contains('\u{FFFD}'));
}

// ─── format_command_error ───────────────────────────────────

#[test]
fn command_error_combines_stdout_and_stderr() {
    let result = format_command_error(b"partial output", b"connection refused");
    assert!(result.contains("partial output"));
    assert!(result.contains(STDERR_SEPARATOR));
    assert!(result.contains("connection refused"));
}

#[test]
fn command_error_with_empty_stderr() {
    let result = format_command_error(b"output", b"");
    assert!(result.contains("output"));
    assert!(result.contains(STDERR_SEPARATOR));
}

#[test]
fn command_error_with_empty_stdout() {
    let result = format_command_error(b"", b"error happened");
    assert!(result.contains(STDERR_SEPARATOR));
    assert!(result.contains("error happened"));
}

// ─── format_import_success / error ──────────────────────────

#[test]
fn import_success_includes_spec_path_and_stdout() {
    let result = format_import_success("petstore.json", b"Created pets.nap\nCreated users.nap");
    assert!(result.starts_with("Generated .nap files from petstore.json:"));
    assert!(result.contains("Created pets.nap"));
    assert!(result.contains("Created users.nap"));
}

#[test]
fn import_success_empty_stdout() {
    let result = format_import_success("empty.yaml", b"");
    assert!(result.contains("Generated .nap files from empty.yaml:"));
}

#[test]
fn import_error_includes_both_streams() {
    let result = format_import_error(b"partial", b"invalid spec");
    assert!(result.starts_with("OpenAPI import failed:"));
    assert!(result.contains("partial"));
    assert!(result.contains("invalid spec"));
}

// ─── build_slash_output ─────────────────────────────────────

#[test]
fn slash_output_text_matches() {
    let output = build_slash_output("hello world", "test".to_string());
    assert_eq!(output.text, "hello world");
}

#[test]
fn slash_output_has_single_section() {
    let output = build_slash_output("hello world", "test".to_string());
    assert_eq!(output.sections.len(), 1);
}

#[test]
fn slash_output_section_label() {
    let output = build_slash_output("content", "my label".to_string());
    assert_eq!(output.sections[0].label, "my label");
}

#[test]
fn slash_output_section_range_spans_full_text() {
    let text = "some response text";
    let output = build_slash_output(text, "label".to_string());
    let range = &output.sections[0].range;
    assert_eq!(range.start, 0);
    assert_eq!(range.end as usize, text.len());
}

#[test]
fn slash_output_empty_text() {
    let output = build_slash_output("", "empty".to_string());
    assert_eq!(output.text, "");
    assert_eq!(output.sections[0].range.start, 0u32);
    assert_eq!(output.sections[0].range.end, 0u32);
}

// ─── Constants ──────────────────────────────────────────────

#[test]
fn nap_run_usage_mentions_file() {
    assert!(NAP_RUN_USAGE.contains("file.nap"));
}

#[test]
fn openapi_usage_mentions_spec() {
    assert!(OPENAPI_IMPORT_USAGE.contains("spec.json"));
    assert!(OPENAPI_IMPORT_USAGE.contains("spec.yaml"));
}

#[test]
fn cli_launch_error_mentions_nap() {
    assert!(CLI_LAUNCH_ERROR.contains("nap"));
}

#[test]
fn lsp_id_constant_is_nap_lsp() {
    assert_eq!(NAP_LSP_ID, "nap-lsp");
}

#[test]
fn cli_constant_is_nap() {
    assert_eq!(NAP_CLI, "nap");
}

#[test]
fn lsp_cli_constant_is_napper() {
    assert_eq!(NAPPER_LSP_CLI, "napper");
}

#[test]
fn lsp_subcommand_constant_is_lsp() {
    assert_eq!(LSP_SUBCOMMAND, "lsp");
}

#[test]
fn command_constants_match_extension_toml() {
    assert_eq!(NAP_RUN_COMMAND, "nap-run");
    assert_eq!(NAP_IMPORT_OPENAPI_COMMAND, "nap-import-openapi");
}

#[test]
fn file_extension_constants() {
    assert_eq!(NAP_FILE_EXTENSION, "nap");
    assert_eq!(NAPLIST_FILE_EXTENSION, "naplist");
}

// ─── resolve_language_server ────────────────────────────────

#[test]
fn resolve_known_lsp_returns_napper_lsp_command() {
    let napper_path = "/usr/local/bin/napper".to_string();
    let result = resolve_language_server(NAP_LSP_ID, Some(napper_path.clone())).unwrap();
    assert_eq!(result.command, napper_path);
    assert_eq!(result.args, vec![LSP_SUBCOMMAND.to_string()]);
    assert!(result.env.is_empty());
}

#[test]
fn resolve_known_lsp_without_path_returns_install_error() {
    let result = resolve_language_server(NAP_LSP_ID, None);
    let err = result.unwrap_err();
    assert_eq!(err, NAPPER_NOT_FOUND);
}

#[test]
fn resolve_unknown_lsp_returns_error_with_id() {
    let result = resolve_language_server("some-other-lsp", Some(NAPPER_LSP_CLI.to_string()));
    let err = result.unwrap_err();
    assert!(err.contains("Unknown language server"));
    assert!(err.contains("some-other-lsp"));
}

// ─── run_nap_command / run_import_openapi_command args ──────

#[test]
fn run_nap_command_empty_args_returns_usage_error() {
    let result = run_nap_command(&[]);
    let err = result.unwrap_err();
    assert_eq!(err, NAP_RUN_USAGE);
}

#[test]
fn run_import_openapi_empty_args_returns_usage_error() {
    let result = run_import_openapi_command(&[]);
    let err = result.unwrap_err();
    assert_eq!(err, OPENAPI_IMPORT_USAGE);
}

// ─── Extension::new ─────────────────────────────────────────

#[test]
fn extension_new_creates_instance() {
    let _ext = <NapExtension as Extension>::new();
}

// ─── process_run_output ─────────────────────────────────────

fn make_output(status: i32, stdout: &[u8], stderr: &[u8]) -> Output {
    Output {
        status: Some(status),
        stdout: stdout.to_vec(),
        stderr: stderr.to_vec(),
    }
}

#[test]
fn process_run_output_success_uses_stdout() {
    let output = make_output(0, b"HTTP/1.1 200 OK", b"");
    let result = process_run_output(&output, "api.nap");
    assert_eq!(result.text, "HTTP/1.1 200 OK");
    assert_eq!(result.sections[0].label, "nap run api.nap");
}

#[test]
fn process_run_output_failure_combines_streams() {
    let output = make_output(1, b"partial", b"connection refused");
    let result = process_run_output(&output, "api.nap");
    assert!(result.text.contains("partial"));
    assert!(result.text.contains(STDERR_SEPARATOR));
    assert!(result.text.contains("connection refused"));
}

#[test]
fn process_run_output_section_range() {
    let output = make_output(0, b"response body", b"");
    let result = process_run_output(&output, "test.nap");
    assert_eq!(result.sections.len(), 1);
    assert_eq!(result.sections[0].range.start, 0);
    assert_eq!(result.sections[0].range.end as usize, result.text.len());
}

#[test]
fn process_run_output_none_status_treated_as_error() {
    let output = Output {
        status: None,
        stdout: b"partial".to_vec(),
        stderr: b"terminated".to_vec(),
    };
    let result = process_run_output(&output, "test.nap");
    assert!(result.text.contains(STDERR_SEPARATOR));
    assert!(result.text.contains("terminated"));
}

// ─── process_import_output ──────────────────────────────────

#[test]
fn process_import_output_success_prepends_message() {
    let output = make_output(0, b"pets.nap\nusers.nap", b"");
    let result = process_import_output(&output, "petstore.json");
    assert!(result
        .text
        .starts_with("Generated .nap files from petstore.json:"));
    assert!(result.text.contains("pets.nap"));
    assert_eq!(
        result.sections[0].label,
        "nap generate openapi petstore.json"
    );
}

#[test]
fn process_import_output_failure_shows_error() {
    let output = make_output(1, b"", b"invalid spec format");
    let result = process_import_output(&output, "bad.yaml");
    assert!(result.text.starts_with("OpenAPI import failed:"));
    assert!(result.text.contains("invalid spec format"));
}

#[test]
fn process_import_output_none_status_treated_as_error() {
    let output = Output {
        status: None,
        stdout: b"killed".to_vec(),
        stderr: b"signal".to_vec(),
    };
    let result = process_import_output(&output, "spec.json");
    assert!(result.text.starts_with("OpenAPI import failed:"));
}
