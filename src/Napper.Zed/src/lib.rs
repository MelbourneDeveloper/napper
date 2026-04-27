//! Nap Zed extension — language support for `.nap`, `.naplist`, `.napenv` files.
//!
//! Provides syntax highlighting (via Tree-sitter), runnables, slash commands,
//! and a language server integration point for the Nap Language Server.

use std::{fs, path::Path};
use zed_extension_api::{
    self as zed, process::Output, serde_json, Command, LanguageServerId, SlashCommand,
    SlashCommandArgumentCompletion, SlashCommandOutput, SlashCommandOutputSection, Worktree,
};

/// Named constant for the nap-run slash command.
const NAP_RUN_COMMAND: &str = "nap-run";

/// Named constant for the nap-import-openapi slash command.
const NAP_IMPORT_OPENAPI_COMMAND: &str = "nap-import-openapi";

/// File extension for request files.
const NAP_FILE_EXTENSION: &str = "nap";

/// File extension for playlist files.
const NAPLIST_FILE_EXTENSION: &str = "naplist";

/// Language server ID registered in extension.toml.
const NAP_LSP_ID: &str = "nap-lsp";

/// CLI binary name.
const NAP_CLI: &str = "nap";

/// CLI binary name for the language server.
const NAPPER_LSP_CLI: &str = "napper";

/// Usage message for the nap-run command.
const NAP_RUN_USAGE: &str = "Usage: /nap-run <file.nap>";

/// Usage message for the nap-import-openapi command.
const OPENAPI_IMPORT_USAGE: &str = "Usage: /nap-import-openapi <spec.json|spec.yaml>";

/// Error prefix for CLI launch failures.
const CLI_LAUNCH_ERROR: &str = "Is `nap` installed and on PATH?";

/// Stderr separator in error output.
const STDERR_SEPARATOR: &str = "\n--- stderr ---\n";

/// LSP subcommand argument.
const LSP_SUBCOMMAND: &str = "lsp";

/// Error message when napper binary is not found on PATH.
const NAPPER_NOT_FOUND: &str =
    "napper not found on PATH — install via: dotnet tool install -g napper";

/// Nap Zed extension entry point — implements all Zed extension traits.
pub struct NapExtension;

#[cfg(not(tarpaulin_include))]
impl zed::Extension for NapExtension {
    fn new() -> Self {
        NapExtension
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Command, String> {
        resolve_language_server(language_server_id.as_ref(), worktree.which(NAPPER_LSP_CLI))
    }

    fn language_server_initialization_options(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Option<serde_json::Value>, String> {
        let _ = (language_server_id, worktree);
        Ok(None)
    }

    fn language_server_workspace_configuration(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Option<serde_json::Value>, String> {
        let _ = (language_server_id, worktree);
        Ok(None)
    }

    fn complete_slash_command_argument(
        &self,
        command: SlashCommand,
        _args: Vec<String>,
    ) -> Result<Vec<SlashCommandArgumentCompletion>, String> {
        let cwd =
            std::env::current_dir().map_err(|e| format!("Failed to get working directory: {e}"))?;
        route_completions(&command.name, &cwd)
    }

    fn run_slash_command(
        &self,
        command: SlashCommand,
        args: Vec<String>,
        _worktree: Option<&Worktree>,
    ) -> Result<SlashCommandOutput, String> {
        match command.name.as_str() {
            NAP_RUN_COMMAND => run_nap_command(&args),
            NAP_IMPORT_OPENAPI_COMMAND => run_import_openapi_command(&args),
            _ => Err(format!("Unknown command: {}", command.name)),
        }
    }
}

/// Resolve language server command by ID.
/// Implements [LSP-ZED-CLIENT]: launches 'napper lsp' over stdio.
fn resolve_language_server(id: &str, napper_path: Option<String>) -> Result<Command, String> {
    if id != NAP_LSP_ID {
        return Err(format!("Unknown language server: {id}"));
    }
    napper_path
        .map(build_language_server_command)
        .ok_or_else(|| NAPPER_NOT_FOUND.to_string())
}

/// Build the command used to launch 'napper lsp'.
fn build_language_server_command(napper: String) -> Command {
    Command {
        command: napper,
        args: vec![LSP_SUBCOMMAND.to_string()],
        env: Vec::default(),
    }
}

/// Route slash command argument completions by command name.
fn route_completions(
    name: &str,
    path: &Path,
) -> Result<Vec<SlashCommandArgumentCompletion>, String> {
    match name {
        NAP_RUN_COMMAND => {
            collect_file_completions(path, &[NAP_FILE_EXTENSION, NAPLIST_FILE_EXTENSION])
        }
        NAP_IMPORT_OPENAPI_COMMAND => collect_file_completions(path, &["json", "yaml", "yml"]),
        _ => Ok(Vec::new()),
    }
}

/// Recursively collect files matching given extensions for slash command argument completion.
fn collect_file_completions(
    path: &Path,
    extensions: &[&str],
) -> Result<Vec<SlashCommandArgumentCompletion>, String> {
    let mut completions = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| format!("Failed to read directory: {e}"))?;
    collect_files_recursive(entries, extensions, "", &mut completions);
    Ok(completions)
}

/// Walk directory tree, adding files with matching extensions to completions.
fn collect_files_recursive(
    entries: fs::ReadDir,
    extensions: &[&str],
    prefix: &str,
    completions: &mut Vec<SlashCommandArgumentCompletion>,
) {
    let valid_entries = entries.flatten().filter_map(|e| {
        e.file_name()
            .into_string()
            .ok()
            .map(|name| (e.path(), name))
    });

    for (path, name) in valid_entries {
        let full_path = build_relative_path(prefix, &name);

        if path.is_dir() && !name.starts_with('.') {
            if let Ok(sub_entries) = fs::read_dir(&path) {
                collect_files_recursive(sub_entries, extensions, &full_path, completions);
            }
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if extensions.contains(&ext) {
                completions.push(SlashCommandArgumentCompletion {
                    label: full_path.clone(),
                    new_text: full_path,
                    run_command: true,
                });
            }
        }
    }
}

/// Build a relative path by joining prefix and name.
fn build_relative_path(prefix: &str, name: &str) -> String {
    if prefix.is_empty() {
        name.to_string()
    } else {
        format!("{prefix}/{name}")
    }
}

/// Format CLI output for a successful nap run.
fn format_run_success(stdout: &[u8]) -> String {
    String::from_utf8_lossy(stdout).to_string()
}

/// Format CLI output for a failed command.
fn format_command_error(stdout: &[u8], stderr: &[u8]) -> String {
    let stdout_str = String::from_utf8_lossy(stdout);
    let stderr_str = String::from_utf8_lossy(stderr);
    format!("{stdout_str}{STDERR_SEPARATOR}{stderr_str}")
}

/// Format CLI output for a successful `OpenAPI` import.
fn format_import_success(spec_path: &str, stdout: &[u8]) -> String {
    let stdout_str = String::from_utf8_lossy(stdout);
    format!("Generated .nap files from {spec_path}:\n{stdout_str}")
}

/// Format CLI output for a failed `OpenAPI` import.
fn format_import_error(stdout: &[u8], stderr: &[u8]) -> String {
    let stdout_str = String::from_utf8_lossy(stdout);
    let stderr_str = String::from_utf8_lossy(stderr);
    format!("OpenAPI import failed:\n{stdout_str}\n{stderr_str}")
}

/// Build a `SlashCommandOutput` with a single section spanning the full text.
fn build_slash_output(text: &str, label: String) -> SlashCommandOutput {
    SlashCommandOutput {
        text: text.to_string(),
        sections: vec![SlashCommandOutputSection {
            range: (0..text.len()).into(),
            label,
        }],
    }
}

/// Process nap run CLI output into a `SlashCommandOutput`.
fn process_run_output(output: &Output, file_path: &str) -> SlashCommandOutput {
    let result = if output.status == Some(0) {
        format_run_success(&output.stdout)
    } else {
        format_command_error(&output.stdout, &output.stderr)
    };
    build_slash_output(&result, format!("nap run {file_path}"))
}

/// Process `OpenAPI` import CLI output into a `SlashCommandOutput`.
fn process_import_output(output: &Output, spec_path: &str) -> SlashCommandOutput {
    let result = if output.status == Some(0) {
        format_import_success(spec_path, &output.stdout)
    } else {
        format_import_error(&output.stdout, &output.stderr)
    };
    build_slash_output(&result, format!("nap generate openapi {spec_path}"))
}

/// Execute `nap run <file>` — thin WASM wrapper over [`process_run_output`].
#[cfg(not(tarpaulin_include))]
fn run_nap_command(args: &[String]) -> Result<SlashCommandOutput, String> {
    let file_path = args.first().ok_or(NAP_RUN_USAGE)?;
    let output = Command::new(NAP_CLI)
        .args(["run", file_path, "--output", "text"])
        .output()
        .map_err(|e| format!("Failed to run nap CLI: {e}. {CLI_LAUNCH_ERROR}"))?;
    Ok(process_run_output(&output, file_path))
}

/// Execute `nap generate openapi` — thin WASM wrapper over [`process_import_output`].
#[cfg(not(tarpaulin_include))]
fn run_import_openapi_command(args: &[String]) -> Result<SlashCommandOutput, String> {
    let spec_path = args.first().ok_or(OPENAPI_IMPORT_USAGE)?;
    let output = Command::new(NAP_CLI)
        .args(["generate", "openapi", "--spec", spec_path])
        .output()
        .map_err(|e| format!("Failed to run nap CLI: {e}. {CLI_LAUNCH_ERROR}"))?;
    Ok(process_import_output(&output, spec_path))
}

mod _register {
    use zed_extension_api as zed;
    zed::register_extension!(super::NapExtension);
}

#[cfg(test)]
mod tests;
