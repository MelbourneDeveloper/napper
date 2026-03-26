use crate::*;
use std::{
    fs::{self, File},
    path::Path,
};
use tempfile::TempDir;
use zed_extension_api::Extension;

/// Create a temp dir structure for file collection tests.
fn create_test_dir() -> TempDir {
    let dir = TempDir::new().unwrap();
    let root = dir.path();

    let _ = File::create(root.join("api.nap")).unwrap();
    let _ = File::create(root.join("suite.naplist")).unwrap();
    let _ = File::create(root.join("spec.json")).unwrap();
    let _ = File::create(root.join("spec.yaml")).unwrap();
    let _ = File::create(root.join("readme.txt")).unwrap();
    let _ = File::create(root.join("config.toml")).unwrap();

    let _ = fs::create_dir_all(root.join("pets")).unwrap();
    let _ = File::create(root.join("pets/get-all.nap")).unwrap();
    let _ = File::create(root.join("pets/create.nap")).unwrap();
    let _ = File::create(root.join("pets/openapi.yml")).unwrap();

    let _ = fs::create_dir_all(root.join("pets/v2")).unwrap();
    let _ = File::create(root.join("pets/v2/get-all.nap")).unwrap();

    let _ = fs::create_dir_all(root.join(".hidden")).unwrap();
    let _ = File::create(root.join(".hidden/secret.nap")).unwrap();

    let _ = fs::create_dir_all(root.join("empty")).unwrap();

    dir
}

fn test_slash_command(name: &str) -> SlashCommand {
    SlashCommand {
        name: name.to_string(),
        description: String::new(),
        tooltip_text: String::new(),
        requires_argument: false,
    }
}

// ─── collect_files_recursive ────────────────────────────────

#[test]
fn collects_nap_files_from_root_and_subdirs() {
    let dir = create_test_dir();
    let mut completions = Vec::new();
    let entries = fs::read_dir(dir.path()).unwrap();
    collect_files_recursive(entries, &["nap"], "", &mut completions);

    let labels: Vec<&str> = completions.iter().map(|c| c.label.as_str()).collect();
    assert!(labels.contains(&"api.nap"), "should find root nap file");
    assert!(labels.contains(&"pets/get-all.nap"));
    assert!(labels.contains(&"pets/create.nap"));
    assert!(labels.contains(&"pets/v2/get-all.nap"));
}

#[test]
fn skips_hidden_directories() {
    let dir = create_test_dir();
    let mut completions = Vec::new();
    let entries = fs::read_dir(dir.path()).unwrap();
    collect_files_recursive(entries, &["nap"], "", &mut completions);

    for c in &completions {
        assert!(!c.label.contains(".hidden"), "leaked: {}", c.label);
    }
}

#[test]
fn filters_by_extension() {
    let dir = create_test_dir();
    let mut completions = Vec::new();
    let entries = fs::read_dir(dir.path()).unwrap();
    collect_files_recursive(entries, &["nap"], "", &mut completions);

    for c in &completions {
        assert!(c.label.ends_with(".nap"), "unexpected: {}", c.label);
    }
}

#[test]
fn collects_multiple_extensions() {
    let dir = create_test_dir();
    let mut completions = Vec::new();
    let entries = fs::read_dir(dir.path()).unwrap();
    collect_files_recursive(entries, &["json", "yaml", "yml"], "", &mut completions);

    let labels: Vec<&str> = completions.iter().map(|c| c.label.as_str()).collect();
    assert!(labels.contains(&"spec.json"));
    assert!(labels.contains(&"spec.yaml"));
    assert!(labels.contains(&"pets/openapi.yml"));
    for l in &labels {
        assert!(!l.ends_with(".nap") && !l.ends_with(".txt"), "bad: {l}");
    }
}

#[test]
fn collects_naplist_files() {
    let dir = create_test_dir();
    let mut completions = Vec::new();
    let entries = fs::read_dir(dir.path()).unwrap();
    collect_files_recursive(entries, &["nap", "naplist"], "", &mut completions);

    let labels: Vec<&str> = completions.iter().map(|c| c.label.as_str()).collect();
    assert!(labels.contains(&"suite.naplist"));
    assert!(labels.contains(&"api.nap"));
}

#[test]
fn empty_directory_returns_no_completions() {
    let dir = TempDir::new().unwrap();
    let mut completions = Vec::new();
    let entries = fs::read_dir(dir.path()).unwrap();
    collect_files_recursive(entries, &["nap"], "", &mut completions);
    assert!(completions.is_empty());
}

#[test]
fn no_matching_extensions_returns_empty() {
    let dir = create_test_dir();
    let mut completions = Vec::new();
    let entries = fs::read_dir(dir.path()).unwrap();
    collect_files_recursive(entries, &["rs", "py", "go"], "", &mut completions);
    assert!(completions.is_empty());
}

#[test]
fn completions_have_run_command_true() {
    let dir = create_test_dir();
    let mut completions = Vec::new();
    let entries = fs::read_dir(dir.path()).unwrap();
    collect_files_recursive(entries, &["nap"], "", &mut completions);
    for c in &completions {
        assert!(c.run_command);
    }
}

#[test]
fn completion_label_matches_new_text() {
    let dir = create_test_dir();
    let mut completions = Vec::new();
    let entries = fs::read_dir(dir.path()).unwrap();
    collect_files_recursive(entries, &["nap"], "", &mut completions);
    for c in &completions {
        assert_eq!(c.label, c.new_text);
    }
}

#[test]
fn prefix_is_applied_to_all_paths() {
    let dir = create_test_dir();
    let mut completions = Vec::new();
    let entries = fs::read_dir(dir.path()).unwrap();
    collect_files_recursive(entries, &["nap"], "workspace", &mut completions);
    for c in &completions {
        assert!(c.label.starts_with("workspace/"), "bad: {}", c.label);
    }
}

#[test]
#[cfg(target_os = "linux")]
fn skips_non_utf8_filenames() {
    use std::ffi::OsStr;
    use std::os::unix::ffi::OsStrExt;

    let dir = TempDir::new().unwrap();
    let root = dir.path();
    let _ = File::create(root.join("valid.nap")).unwrap();
    let invalid_name = OsStr::from_bytes(&[0xFF, 0xFE, b'.', b'n', b'a', b'p']);
    let _ = File::create(root.join(invalid_name)).unwrap();

    let mut completions = Vec::new();
    let entries = fs::read_dir(root).unwrap();
    collect_files_recursive(entries, &["nap"], "", &mut completions);

    assert_eq!(completions.len(), 1);
    assert_eq!(completions[0].label, "valid.nap");
}

// ─── collect_file_completions ───────────────────────────────

#[test]
fn collect_file_completions_from_real_dir() {
    let dir = create_test_dir();

    let completions = collect_file_completions(dir.path(), &["nap", "naplist"]).unwrap();
    assert!(!completions.is_empty());
    assert!(completions.iter().any(|c| c.label.ends_with(".nap")));
}

// ─── route_completions ──────────────────────────────────────

#[test]
fn route_completions_nap_run_finds_nap_files() {
    let dir = create_test_dir();

    let result = route_completions(NAP_RUN_COMMAND, dir.path()).unwrap();
    assert!(result.iter().any(|c| c.label.ends_with(".nap")));
    assert!(result.iter().any(|c| c.label.ends_with(".naplist")));
    for c in &result {
        assert!(c.label.ends_with(".nap") || c.label.ends_with(".naplist"));
    }
}

#[test]
fn route_completions_openapi_finds_spec_files() {
    let dir = create_test_dir();

    let result = route_completions(NAP_IMPORT_OPENAPI_COMMAND, dir.path()).unwrap();
    assert!(result.iter().any(|c| c.label.ends_with(".json")));
    assert!(result
        .iter()
        .any(|c| c.label.ends_with(".yaml") || c.label.ends_with(".yml")));
}

#[test]
fn route_completions_unknown_returns_empty() {
    let result = route_completions("unknown", Path::new(".")).unwrap();
    assert!(result.is_empty());
}

#[test]
fn complete_unknown_command_returns_empty() {
    let ext = NapExtension;
    let result = ext
        .complete_slash_command_argument(test_slash_command("nonexistent"), vec![])
        .unwrap();
    assert!(result.is_empty());
}

#[test]
fn run_unknown_command_returns_error() {
    let ext = NapExtension;
    let err = ext
        .run_slash_command(test_slash_command("bogus"), vec![], None)
        .unwrap_err();
    assert!(err.contains("Unknown command"));
    assert!(err.contains("bogus"));
}
