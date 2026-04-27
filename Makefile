# agent-pmo:74cf183
# =============================================================================
# Standard Makefile — Napper
# All primary targets are language-agnostic. Language-specific helpers below.
# =============================================================================

.PHONY: build test lint fmt clean ci setup \
        build-all build-cli build-extension build-vsix build-zed \
        clean-install-vsix dump-cli-help install-binaries package-vsix \
        test-fsharp test-rust test-vsix coverage fmt-check format

# --- Cross-platform support ---
ifeq ($(OS),Windows_NT)
  SHELL := powershell.exe
  .SHELLFLAGS := -NoProfile -Command
  RM = Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  MKDIR = New-Item -ItemType Directory -Force
  HOME ?= $(USERPROFILE)
else
  SHELL := /usr/bin/env bash
  .SHELLFLAGS := -euo pipefail -c
  RM = rm -rf
  MKDIR = mkdir -p
endif

# --- Platform detection for .NET RID ---
ifeq ($(OS),Windows_NT)
  NAP_RID ?= win-x64
else
  ARCH := $(shell uname -m)
  UNAME_S := $(shell uname -s)
  ifeq ($(UNAME_S),Darwin)
    ifeq ($(ARCH),arm64)
      NAP_RID ?= osx-arm64
    else ifeq ($(ARCH),x86_64)
      NAP_RID ?= osx-x64
    else
      $(error Unsupported arch: $(ARCH))
    endif
  else ifeq ($(UNAME_S),Linux)
    NAP_RID ?= linux-x64
  else
    $(error Unsupported OS: $(UNAME_S))
  endif
endif

EXT_BIN := src/Napper.VsCode/bin
LOG_DIR := .commandtree/logs
FSHARP_COVERAGE_DIR := coverage/fsharp
DOTHTTP_COVERAGE_DIR := coverage/dothttp
LSP_COVERAGE_DIR := coverage/lsp
TS_COVERAGE_DIR := coverage/typescript
RUST_COVERAGE_DIR := coverage/rust

# =============================================================================
# Standard Targets
# =============================================================================

## build: Compile/assemble all artifacts
build: build-all

## test: Run full test suite with coverage and threshold enforcement
test: test-fsharp test-rust test-vsix
	@echo ""
	@echo "========================================="
	@echo "  Coverage Reports"
	@echo "========================================="
	@echo "  Napper.Core:   $(FSHARP_COVERAGE_DIR)/report/index.html"
	@echo "  DotHttp:    $(DOTHTTP_COVERAGE_DIR)/report/index.html"
	@echo "  Rust:       $(RUST_COVERAGE_DIR)/report/index.html"
	@echo "  TypeScript: $(TS_COVERAGE_DIR)/report/index.html"
	@echo "========================================="
	@$(MAKE) _coverage_check

## lint: Run all linters (read-only, no formatting)
lint:
	@echo "==> F# build (warnings as errors)..."
	dotnet build --nologo -warnaserror
	@echo "==> TypeScript (ESLint)..."
	cd src/Napper.VsCode && npm run lint
	@echo "==> Rust (clippy)..."
	cargo clippy --manifest-path src/Napper.Zed/Cargo.toml
	@echo "==> All projects linted"

## fmt: Format all code in-place
fmt:
	@echo "==> F# (Fantomas)..."
	dotnet fantomas src/
	@echo "==> TypeScript (Prettier)..."
	cd src/Napper.VsCode && npx prettier --write "src/**/*.ts"
	@echo "==> Rust (cargo fmt)..."
	cargo fmt --manifest-path src/Napper.Zed/Cargo.toml
	@echo "==> All projects formatted"

## clean: Remove all build artifacts
clean:
	@echo "==> Cleaning all build artifacts..."
	$(RM) out/
	$(RM) src/Napper.Core/bin/ src/Napper.Core/obj/
	$(RM) src/Napper.Cli/bin/ src/Napper.Cli/obj/
	$(RM) tests/Napper.Core.Tests/bin/ tests/Napper.Core.Tests/obj/
	$(RM) src/Napper.VsCode/bin/
	$(RM) src/Napper.VsCode/dist/
	$(RM) src/Napper.VsCode/out/
	$(RM) src/Napper.VsCode/*.vsix
	$(RM) coverage/
	@echo "==> Clean complete"

## ci: lint + test + build (full CI simulation)
ci: lint test build

## setup: Install all dev tools and dependencies
setup:
	@echo "==> Installing .NET tools..."
	dotnet tool restore
	dotnet restore
	@echo "==> Installing Node dependencies (VSCode extension)..."
	cd src/Napper.VsCode && npm ci
	@echo "==> Installing Node dependencies (website)..."
	cd website && npm ci
	@echo "==> Installing Rust toolchain components..."
	rustup component add clippy rustfmt 2>/dev/null || true
	@echo "==> Installing reportgenerator..."
	dotnet tool install --global dotnet-reportgenerator-globaltool 2>/dev/null || true
	@echo "==> Setup complete"

# =============================================================================
# Internal helpers (not in .PHONY — private)
# =============================================================================

_coverage_check:
	@echo "==> Checking coverage thresholds (coverage-thresholds.json)..."
	@THRESHOLD=$$(jq '.projects["src/Napper.Core.Tests"].threshold // .default_threshold' coverage-thresholds.json); \
	echo "--- F# Napper.Core (threshold: $${THRESHOLD}%) ---"; \
	if [ -f "$(FSHARP_COVERAGE_DIR)/report/Summary.txt" ]; then \
	  COV=$$(grep -oP 'Line coverage: \K[0-9.]+' "$(FSHARP_COVERAGE_DIR)/report/Summary.txt" 2>/dev/null || echo "0"); \
	  echo "  Line coverage: $${COV}%"; \
	  if [ $$(echo "$${COV} < $${THRESHOLD}" | bc -l) -eq 1 ]; then \
	    echo "  FAIL: $${COV}% < $${THRESHOLD}%"; exit 1; \
	  else echo "  OK"; fi; \
	else echo "  No coverage data found — run 'make test' first"; fi
	@THRESHOLD=$$(jq '.projects["src/DotHttp.Tests"].threshold // .default_threshold' coverage-thresholds.json); \
	echo "--- F# DotHttp (threshold: $${THRESHOLD}%) ---"; \
	if [ -f "$(DOTHTTP_COVERAGE_DIR)/report/Summary.txt" ]; then \
	  COV=$$(grep -oP 'Line coverage: \K[0-9.]+' "$(DOTHTTP_COVERAGE_DIR)/report/Summary.txt" 2>/dev/null || echo "0"); \
	  echo "  Line coverage: $${COV}%"; \
	  if [ $$(echo "$${COV} < $${THRESHOLD}" | bc -l) -eq 1 ]; then \
	    echo "  FAIL: $${COV}% < $${THRESHOLD}%"; exit 1; \
	  else echo "  OK"; fi; \
	else echo "  No coverage data found — run 'make test' first"; fi
	@THRESHOLD=$$(jq '.projects["src/Napper.Lsp.Tests"].threshold // .default_threshold' coverage-thresholds.json); \
	echo "--- F# Napper.Lsp (threshold: $${THRESHOLD}%) ---"; \
	if [ -f "$(LSP_COVERAGE_DIR)/report/Summary.txt" ]; then \
	  COV=$$(grep -oP 'Line coverage: \K[0-9.]+' "$(LSP_COVERAGE_DIR)/report/Summary.txt" 2>/dev/null || echo "0"); \
	  echo "  Line coverage: $${COV}%"; \
	  if [ $$(echo "$${COV} < $${THRESHOLD}" | bc -l) -eq 1 ]; then \
	    echo "  FAIL: $${COV}% < $${THRESHOLD}%"; exit 1; \
	  else echo "  OK"; fi; \
	else echo "  No coverage data found — run 'make test' first"; fi
	@THRESHOLD=$$(jq '.projects["src/Napper.VsCode"].threshold // .default_threshold' coverage-thresholds.json); \
	echo "--- TypeScript (threshold: $${THRESHOLD}%) ---"; \
	if [ -f "$(TS_COVERAGE_DIR)/report/index.html" ]; then \
	  COV=$$(cd src/Napper.VsCode && npx c8 report --reporter text 2>/dev/null | grep 'All files' | awk '{print $$4}' | tr -d '%' || echo "0"); \
	  echo "  Line coverage: $${COV}%"; \
	  if [ $$(echo "$${COV} < $${THRESHOLD}" | bc -l) -eq 1 ]; then \
	    echo "  FAIL: $${COV}% < $${THRESHOLD}%"; exit 1; \
	  else echo "  OK"; fi; \
	else echo "  No TypeScript coverage data found — run 'make test' first"; fi
	@THRESHOLD=$$(jq '.projects["src/Napper.Zed"].threshold // .default_threshold' coverage-thresholds.json); \
	echo "--- Rust (threshold: $${THRESHOLD}%) ---"; \
	if [ -f "$(RUST_COVERAGE_DIR)/report/cobertura.xml" ]; then \
	  LINE_RATE=$$(sed -n 's/.*line-rate="\([0-9.]*\)".*/\1/p' "$(RUST_COVERAGE_DIR)/report/cobertura.xml" 2>/dev/null | head -1); \
	  COV=$$(echo "$${LINE_RATE:-0} * 100" | bc -l | xargs printf "%.1f"); \
	  echo "  Line coverage: $${COV}%"; \
	  if [ $$(echo "$${COV} < $${THRESHOLD}" | bc -l) -eq 1 ]; then \
	    echo "  FAIL: $${COV}% < $${THRESHOLD}%"; exit 1; \
	  else echo "  OK"; fi; \
	else echo "  No Rust coverage data found — run 'make test' first"; fi
	@echo "==> Coverage thresholds OK"

# =============================================================================
# Repo-Specific Targets
# =============================================================================

## coverage: Generate and open coverage report (calls test first)
coverage: test
	@echo "==> Opening coverage reports..."
ifeq ($(OS),Windows_NT)
	@start "$(FSHARP_COVERAGE_DIR)/report/index.html" 2>$$null || true
else ifeq ($(shell uname -s),Darwin)
	@open "$(FSHARP_COVERAGE_DIR)/report/index.html" 2>/dev/null || true
	@open "$(TS_COVERAGE_DIR)/report/index.html" 2>/dev/null || true
else
	@xdg-open "$(FSHARP_COVERAGE_DIR)/report/index.html" 2>/dev/null || true
	@xdg-open "$(TS_COVERAGE_DIR)/report/index.html" 2>/dev/null || true
endif

## fmt-check: Check formatting without modifying (used in CI)
fmt-check:
	@echo "==> Checking F# formatting (Fantomas)..."
	dotnet fantomas --check src/
	@echo "==> Checking TypeScript formatting (Prettier)..."
	cd src/Napper.VsCode && npx prettier --check "src/**/*.ts"
	@echo "==> Checking Rust formatting (cargo fmt)..."
	cargo fmt --manifest-path src/Napper.Zed/Cargo.toml -- --check
	@echo "==> All format checks passed"

# Keep `format` as an alias for backward compatibility
format: fmt

# ============================================================
# Build targets
# ============================================================

build-cli:
	@echo "==> Building CLI for $(NAP_RID)..."
	dotnet publish src/Napper.Cli/Napper.Cli.fsproj \
	  -r "$(NAP_RID)" \
	  --self-contained \
	  -p:PublishTrimmed=true \
	  -p:PublishSingleFile=true \
	  -o "out/$(NAP_RID)" \
	  --nologo
	@echo "==> CLI built → out/$(NAP_RID)/"
	@$(MKDIR) "$(EXT_BIN)"
	cp "out/$(NAP_RID)/napper" "$(EXT_BIN)/napper"
	@echo "==> Copied CLI → $(EXT_BIN)/"
	@$(MKDIR) "$(HOME)/.local/bin"
	cp "out/$(NAP_RID)/napper" "$(HOME)/.local/bin/napper"
	chmod +x "$(HOME)/.local/bin/napper"
	@echo "==> Installed CLI → ~/.local/bin/napper"
	@EXPECTED_VERSION=$$(sed -n 's/.*<Version>\(.*\)<\/Version>.*/\1/p' Directory.Build.props); \
	ACTUAL_VERSION=$$("out/$(NAP_RID)/napper" --version); \
	if [ "$$ACTUAL_VERSION" != "$$EXPECTED_VERSION" ]; then \
	  echo "ERROR: Version mismatch — expected $$EXPECTED_VERSION, got $$ACTUAL_VERSION"; \
	  exit 1; \
	fi; \
	echo "==> CLI version verified: $$ACTUAL_VERSION"

build-extension:
	@echo "==> Compiling VSCode extension..."
	cd src/Napper.VsCode && npm ci && npx webpack --mode production
	@echo "==> Extension compiled"

build-vsix: build-cli build-extension
	@echo "==> Packaging universal VSIX..."
	cd src/Napper.VsCode && npx @vscode/vsce package --no-dependencies --skip-license
	@echo "==> VSIX packaged (universal — no CLI bundled)"
	@VSIX_FILE=$$(ls -1 src/Napper.VsCode/*.vsix 2>/dev/null | head -1); \
	[ -n "$$VSIX_FILE" ] && echo "    VSIX: $$VSIX_FILE"; \
	echo "    CLI installed at: ~/.local/bin/napper (for local use)"

package-vsix: build-extension
	@echo "==> Packaging universal VSIX..."
	cd src/Napper.VsCode && npx @vscode/vsce package --no-dependencies --skip-license
	@echo "==> VSIX packaged"

build-all: clean build-cli
	@echo "==> Building VS Code extension..."
	cd src/Napper.VsCode && npm ci && npx webpack --mode production && npm run compile:tests
	@echo "==> Extension compiled"
	@echo "==> Packaging VSIX (universal)..."
	cd src/Napper.VsCode && npx @vscode/vsce package --no-dependencies --skip-license
	@VSIX_FILE=$$(ls -1 src/Napper.VsCode/*.vsix 2>/dev/null | head -1); \
	echo ""; \
	echo "==> BUILD COMPLETE"; \
	echo "    CLI:  ~/.local/bin/napper"; \
	echo "    CLI:  $(EXT_BIN)/napper"; \
	[ -n "$$VSIX_FILE" ] && echo "    VSIX: $$VSIX_FILE"; \
	echo ""; \
	napper --help | head -1

build-zed:
	@echo "==> Checking prerequisites..."
	@command -v cargo &>/dev/null || { echo "ERROR: cargo not found. Install Rust: https://rustup.rs"; exit 1; }
	@command -v tree-sitter &>/dev/null || { echo "ERROR: tree-sitter CLI not found. Install: npm install -g tree-sitter-cli"; exit 1; }
	@if ! rustup target list --installed 2>/dev/null | grep -q wasm32-wasi; then \
	  echo "==> Adding wasm32-wasip1 target..."; \
	  rustup target add wasm32-wasip1; \
	fi
	@echo "==> Generating Tree-sitter parsers..."
	@for grammar in nap naplist napenv; do \
	  echo "    $$grammar"; \
	  (cd src/Napper.Zed/grammars/tree-sitter-$$grammar && tree-sitter generate); \
	done
	@echo "==> Building Rust extension (WASM)..."
	cd src/Napper.Zed && cargo build --release --target wasm32-wasip1
	@echo "==> Running clippy..."
	cd src/Napper.Zed && cargo clippy --target wasm32-wasip1
	@echo "==> Build complete"
	@echo ""
	@echo "To test in Zed:"
	@echo "  1. Open Zed"
	@echo "  2. Run: zed: install dev extension"
	@echo "  3. Select: $$(pwd)/src/Napper.Zed"

# ============================================================
# Install
# ============================================================

install-binaries: build-cli
	@echo "==> Binaries installed:"
	@echo "    CLI: ~/.local/bin/napper"
	@echo "    CLI: $(EXT_BIN)/napper"

clean-install-vsix: build-all
	@VSIX_FILE=$$(ls -1 src/Napper.VsCode/*.vsix 2>/dev/null | head -1); \
	if [ -z "$$VSIX_FILE" ]; then \
	  echo "ERROR: No VSIX file found after build"; \
	  exit 1; \
	fi; \
	echo "==> Installing VSIX: $$VSIX_FILE"; \
	code --install-extension "src/Napper.VsCode/$$VSIX_FILE" --force
	@echo ""
	@echo "==> DONE — restart VS Code to load the new extension"

# ============================================================
# Test targets
# ============================================================

test-fsharp:
	@echo "========================================="
	@echo "  Napper.Core Tests + Coverage"
	@echo "========================================="
	$(MKDIR) "$(LOG_DIR)"
	$(RM) "$(FSHARP_COVERAGE_DIR)"
	$(MKDIR) "$(FSHARP_COVERAGE_DIR)"
	@echo "==> Running Napper.Core tests with coverage..."
	dotnet test src/Napper.Core.Tests --nologo \
	  --settings src/Napper.Core.Tests/coverage.runsettings \
	  --results-directory "$(FSHARP_COVERAGE_DIR)/raw" \
	  --logger "console;verbosity=detailed" \
	  -- RunConfiguration.FailFastEnabled=true 2>&1 | tee "$(LOG_DIR)/test-fsharp-core.log"
	@echo "==> Generating Napper.Core coverage report..."
	reportgenerator \
	  -reports:"$(FSHARP_COVERAGE_DIR)/raw/*/coverage.cobertura.xml" \
	  -targetdir:"$(FSHARP_COVERAGE_DIR)/report" \
	  -reporttypes:"Html;TextSummary;Cobertura;lcov"
	@echo ""
	@echo "=== Napper.Core Coverage Summary ==="
	@cat "$(FSHARP_COVERAGE_DIR)/report/Summary.txt"
	@echo ""
	@echo "========================================="
	@echo "  DotHttp Tests + Coverage"
	@echo "========================================="
	$(RM) "$(DOTHTTP_COVERAGE_DIR)"
	$(MKDIR) "$(DOTHTTP_COVERAGE_DIR)"
	@echo "==> Running DotHttp tests with coverage..."
	dotnet test src/DotHttp.Tests --nologo \
	  --settings src/DotHttp.Tests/coverage.runsettings \
	  --results-directory "$(DOTHTTP_COVERAGE_DIR)/raw" \
	  --logger "console;verbosity=detailed" \
	  -- RunConfiguration.FailFastEnabled=true 2>&1 | tee "$(LOG_DIR)/test-dothttp.log"
	@echo "==> Generating DotHttp coverage report..."
	reportgenerator \
	  -reports:"$(DOTHTTP_COVERAGE_DIR)/raw/*/coverage.cobertura.xml" \
	  -targetdir:"$(DOTHTTP_COVERAGE_DIR)/report" \
	  -reporttypes:"Html;TextSummary;Cobertura;lcov"
	@echo ""
	@echo "=== DotHttp Coverage Summary ==="
	@cat "$(DOTHTTP_COVERAGE_DIR)/report/Summary.txt"
	@echo ""
	@echo "========================================="
	@echo "  Napper.Lsp Tests + Coverage"
	@echo "========================================="
	$(RM) "$(LSP_COVERAGE_DIR)"
	$(MKDIR) "$(LSP_COVERAGE_DIR)"
	@echo "==> Running Napper.Lsp tests with coverage..."
	dotnet test src/Napper.Lsp.Tests --nologo \
	  --settings src/Napper.Lsp.Tests/coverage.runsettings \
	  --results-directory "$(LSP_COVERAGE_DIR)/raw" \
	  --logger "console;verbosity=detailed" \
	  -- RunConfiguration.FailFastEnabled=true 2>&1 | tee "$(LOG_DIR)/test-lsp.log"
	@echo "==> Generating Napper.Lsp coverage report..."
	reportgenerator \
	  -reports:"$(LSP_COVERAGE_DIR)/raw/*/coverage.cobertura.xml" \
	  -targetdir:"$(LSP_COVERAGE_DIR)/report" \
	  -reporttypes:"Html;TextSummary;Cobertura;lcov"
	@echo ""
	@echo "=== Napper.Lsp Coverage Summary ==="
	@cat "$(LSP_COVERAGE_DIR)/report/Summary.txt"

test-rust:
	@echo "========================================="
	@echo "  Rust Tests + Coverage (Napper.Zed)"
	@echo "========================================="
	$(MKDIR) "$(LOG_DIR)"
	$(RM) "$(RUST_COVERAGE_DIR)"
	$(MKDIR) "$(RUST_COVERAGE_DIR)"
	@echo "==> Running Rust checks..."
	cargo fmt --manifest-path src/Napper.Zed/Cargo.toml -- --check 2>&1 | tee "$(LOG_DIR)/test-rust-fmt.log"
	cargo clippy --manifest-path src/Napper.Zed/Cargo.toml 2>&1 | tee "$(LOG_DIR)/test-rust-clippy.log"
	@echo "==> Running Rust tests with coverage..."
	cd src/Napper.Zed && cargo tarpaulin --out html lcov xml --output-dir "../../$(RUST_COVERAGE_DIR)/report" --skip-clean 2>&1 | tee "../../$(LOG_DIR)/test-rust.log"
	@echo ""
	@echo "=== Rust Coverage Summary ==="
	@LINE_RATE=$$(sed -n 's/.*line-rate="\([0-9.]*\)".*/\1/p' "$(RUST_COVERAGE_DIR)/report/cobertura.xml" 2>/dev/null | head -1); \
	LINE_RATE=$${LINE_RATE:-0}; \
	echo "  Line coverage: $$(echo "$$LINE_RATE * 100" | bc -l | xargs printf "%.1f")%"

test-vsix: build-cli build-extension
	@echo "========================================="
	@echo "  TypeScript Tests + Coverage"
	@echo "========================================="
	$(MKDIR) "$(LOG_DIR)"
	$(RM) "$(TS_COVERAGE_DIR)"
	$(MKDIR) "$(TS_COVERAGE_DIR)"
	cd src/Napper.VsCode && npm run compile && npm run compile:tests
	@echo "==> Running unit tests..."
	cd src/Napper.VsCode && NODE_V8_COVERAGE="../../$(TS_COVERAGE_DIR)/tmp" \
	  npx mocha out/test/unit/**/*.test.js --ui tdd --timeout 5000 2>&1 | tee "../../$(LOG_DIR)/test-vsix-unit.log"
	@echo "==> Running e2e tests..."
	cd src/Napper.VsCode && NODE_V8_COVERAGE="../../$(TS_COVERAGE_DIR)/tmp" \
	  npx vscode-test 2>&1 | tee "../../$(LOG_DIR)/test-vsix-e2e.log"
	@echo "==> Generating combined TypeScript coverage report..."
	cd src/Napper.VsCode && npx c8 report \
	  --temp-directory "../../$(TS_COVERAGE_DIR)/tmp" \
	  --report-dir "../../$(TS_COVERAGE_DIR)/report" \
	  --reporter html --reporter text --reporter lcov 2>&1 | tee "../../$(LOG_DIR)/test-vsix-coverage.log"

# ============================================================
# Docs
# ============================================================

dump-cli-help:
	@CLI_PATH=$$(command -v napper 2>/dev/null || true); \
	if [ -z "$$CLI_PATH" ]; then \
	  echo "napper not found on PATH — building first..."; \
	  $(MAKE) build-cli; \
	  CLI_PATH="$(HOME)/.local/bin/napper"; \
	fi; \
	echo "==> Capturing CLI help output from $$CLI_PATH..."; \
	HELP_OUTPUT=$$($$CLI_PATH help 2>&1); \
	$(MKDIR) docs; \
	{ \
	  echo '# Nap CLI Reference'; \
	  echo ''; \
	  echo '> Auto-generated from `nap help`. Run `make dump-cli-help` to regenerate.'; \
	  echo ''; \
	  echo '## Help Output'; \
	  echo ''; \
	  echo '```'; \
	  echo "$$HELP_OUTPUT"; \
	  echo '```'; \
	  echo ''; \
	  echo '## Commands'; \
	  echo ''; \
	  echo '### `nap run <file|folder>`'; \
	  echo ''; \
	  echo 'Run a `.nap` file, `.naplist` playlist, or an entire folder of requests.'; \
	  echo ''; \
	  echo '```sh'; \
	  echo '# Single request'; \
	  echo 'nap run ./users/get-user.nap'; \
	  echo ''; \
	  echo '# With variable overrides'; \
	  echo 'nap run ./users/get-user.nap --var userId=99'; \
	  echo ''; \
	  echo '# Run all .nap files in a folder (sorted by filename)'; \
	  echo 'nap run ./users/'; \
	  echo ''; \
	  echo '# Run a playlist'; \
	  echo 'nap run ./smoke.naplist'; \
	  echo ''; \
	  echo '# With a named environment'; \
	  echo 'nap run ./smoke.naplist --env staging'; \
	  echo ''; \
	  echo '# Output as JUnit XML (for CI)'; \
	  echo 'nap run ./smoke.naplist --output junit'; \
	  echo ''; \
	  echo '# Output as JSON'; \
	  echo 'nap run ./smoke.naplist --output json'; \
	  echo '```'; \
	  echo ''; \
	  echo '### `nap check <file>`'; \
	  echo ''; \
	  echo 'Validate the syntax of a `.nap` or `.naplist` file without executing it.'; \
	  echo ''; \
	  echo '```sh'; \
	  echo 'nap check ./users/get-user.nap'; \
	  echo 'nap check ./smoke.naplist'; \
	  echo '```'; \
	  echo ''; \
	  echo '### `nap generate openapi <spec> --output-dir <dir>`'; \
	  echo ''; \
	  echo 'Generate `.nap` files from an OpenAPI specification.'; \
	  echo ''; \
	  echo '```sh'; \
	  echo 'nap generate openapi ./openapi.json --output-dir ./tests'; \
	  echo 'nap generate openapi ./openapi.json --output-dir ./tests --output json'; \
	  echo '```'; \
	  echo ''; \
	  echo '### `nap help`'; \
	  echo ''; \
	  echo 'Display the help message. Also available as `--help` or `-h`.'; \
	  echo ''; \
	  echo '## Options'; \
	  echo ''; \
	  echo '| Option              | Description                                       |'; \
	  echo '|---------------------|---------------------------------------------------|'; \
	  echo '| `--env <name>`      | Load a named environment file (`.napenv.<name>`)  |'; \
	  echo '| `--var <key=value>` | Override a variable (repeatable)                  |'; \
	  echo '| `--output <format>` | Output format: `pretty` (default), `junit`, `json`, `ndjson` |'; \
	  echo '| `--output-dir <dir>`| Output directory for generate command             |'; \
	  echo '| `--verbose`         | Enable debug-level logging                        |'; \
	  echo ''; \
	  echo '## Exit Codes'; \
	  echo ''; \
	  echo '| Code | Meaning                                          |'; \
	  echo '|------|--------------------------------------------------|'; \
	  echo '| 0    | All assertions passed                            |'; \
	  echo '| 1    | One or more assertions failed                    |'; \
	  echo '| 2    | Runtime error (network, script error, parse error) |'; \
	} > docs/cli-reference.md; \
	echo "==> Written to docs/cli-reference.md"

# ============================================================
# HELP
# ============================================================
help:
	@echo "Standard targets:"
	@echo "  build          - Compile/assemble all artifacts"
	@echo "  test           - Run full test suite with coverage + threshold enforcement"
	@echo "  lint           - Run all linters (read-only, no formatting)"
	@echo "  fmt            - Format all code in-place"
	@echo "  clean          - Remove build artifacts"
	@echo "  ci             - lint + test + build (full CI simulation)"
	@echo "  setup          - Install dev tools and dependencies"
	@echo ""
	@echo "Repo-specific targets:"
	@echo "  coverage       - Generate and open coverage report"
	@echo "  fmt-check      - Check formatting (no modification)"
	@echo "  build-cli      - Build CLI binary only"
	@echo "  build-vsix     - Build CLI + extension + package VSIX"
	@echo "  build-zed      - Build Zed extension (WASM)"
	@echo "  test-fsharp    - Run F# tests only"
	@echo "  test-rust      - Run Rust tests only"
	@echo "  test-vsix      - Run TypeScript tests only"
