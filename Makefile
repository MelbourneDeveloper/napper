# =============================================================================
# Standard Makefile — Napper
# All primary targets are language-agnostic. Language-specific helpers below.
# =============================================================================

.PHONY: build test lint fmt fmt-check clean check ci coverage coverage-check \
        build-all build-cli build-extension build-vsix build-zed bump-version \
        clean-install-vsix dump-cli-help install-binaries package-vsix \
        test-fsharp test-rust test-vsix format

SHELL := /usr/bin/env bash
.SHELLFLAGS := -euo pipefail -c

# --- Platform detection ---
ARCH := $(shell uname -m)
OS := $(shell uname -s)

ifeq ($(OS),Darwin)
  ifeq ($(ARCH),arm64)
    NAP_RID ?= osx-arm64
  else ifeq ($(ARCH),x86_64)
    NAP_RID ?= osx-x64
  else
    $(error Unsupported arch: $(ARCH))
  endif
else ifeq ($(OS),Linux)
  NAP_RID ?= linux-x64
else
  $(error Unsupported OS: $(OS))
endif

EXT_BIN := src/Napper.VsCode/bin
LOG_DIR := .commandtree/logs
FSHARP_COVERAGE_DIR := coverage/fsharp
DOTHTTP_COVERAGE_DIR := coverage/dothttp
LSP_COVERAGE_DIR := coverage/lsp
TS_COVERAGE_DIR := coverage/typescript
RUST_COVERAGE_DIR := coverage/rust

# Coverage threshold (override in CI via env var or per-repo)
COVERAGE_THRESHOLD ?= 90

# =============================================================================
# PRIMARY TARGETS (uniform interface — do not rename)
# =============================================================================

## build: Compile/assemble all artifacts
build: build-all

## test: Run full test suite with coverage
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

## lint: Run all linters (fails on any warning)
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

## fmt-check: Check formatting without modifying (used in CI)
fmt-check:
	@echo "==> Checking F# formatting (Fantomas)..."
	dotnet fantomas --check src/
	@echo "==> Checking TypeScript formatting (Prettier)..."
	cd src/Napper.VsCode && npx prettier --check "src/**/*.ts"
	@echo "==> Checking Rust formatting (cargo fmt)..."
	cargo fmt --manifest-path src/Napper.Zed/Cargo.toml -- --check
	@echo "==> All format checks passed"

## clean: Remove all build artifacts
clean:
	@echo "==> Cleaning all build artifacts..."
	rm -rf out/
	rm -rf src/Napper.Core/bin/ src/Napper.Core/obj/
	rm -rf src/Napper.Cli/bin/ src/Napper.Cli/obj/
	rm -rf tests/Napper.Core.Tests/bin/ tests/Napper.Core.Tests/obj/
	rm -rf src/Napper.VsCode/bin/
	rm -rf src/Napper.VsCode/dist/
	rm -rf src/Napper.VsCode/out/
	rm -f  src/Napper.VsCode/*.vsix
	rm -rf coverage/
	@echo "==> Clean complete"

## check: lint + test (pre-commit)
check: lint test

## ci: lint + test + build (full CI simulation)
ci: lint test build

## coverage: Generate and open coverage report
coverage: test
	@echo "==> Opening coverage reports..."
ifeq ($(OS),Darwin)
	@open "$(FSHARP_COVERAGE_DIR)/report/index.html" 2>/dev/null || true
	@open "$(TS_COVERAGE_DIR)/report/index.html" 2>/dev/null || true
else
	@xdg-open "$(FSHARP_COVERAGE_DIR)/report/index.html" 2>/dev/null || true
	@xdg-open "$(TS_COVERAGE_DIR)/report/index.html" 2>/dev/null || true
endif

## coverage-check: Assert thresholds (exits non-zero if below)
coverage-check:
	@echo "==> Checking coverage thresholds..."
	@echo "--- F# Napper.Core ---"
	@if [ -f "$(FSHARP_COVERAGE_DIR)/report/Summary.txt" ]; then \
	  COV=$$(grep -oP 'Line coverage: \K[0-9.]+' "$(FSHARP_COVERAGE_DIR)/report/Summary.txt" 2>/dev/null || echo "0"); \
	  echo "  Line coverage: $${COV}% (threshold: $(COVERAGE_THRESHOLD)%)"; \
	  if [ $$(echo "$${COV} < $(COVERAGE_THRESHOLD)" | bc -l) -eq 1 ]; then \
	    echo "  FAIL: $${COV}% < $(COVERAGE_THRESHOLD)%"; exit 1; \
	  else echo "  OK"; fi; \
	else echo "  No coverage data found — run 'make test' first"; fi
	@echo "--- F# DotHttp ---"
	@if [ -f "$(DOTHTTP_COVERAGE_DIR)/report/Summary.txt" ]; then \
	  COV=$$(grep -oP 'Line coverage: \K[0-9.]+' "$(DOTHTTP_COVERAGE_DIR)/report/Summary.txt" 2>/dev/null || echo "0"); \
	  echo "  Line coverage: $${COV}% (threshold: $(COVERAGE_THRESHOLD)%)"; \
	  if [ $$(echo "$${COV} < $(COVERAGE_THRESHOLD)" | bc -l) -eq 1 ]; then \
	    echo "  FAIL: $${COV}% < $(COVERAGE_THRESHOLD)%"; exit 1; \
	  else echo "  OK"; fi; \
	else echo "  No coverage data found — run 'make test' first"; fi
	@echo "--- Rust ---"
	@if [ -f "$(RUST_COVERAGE_DIR)/report/cobertura.xml" ]; then \
	  LINE_RATE=$$(sed -n 's/.*line-rate="\([0-9.]*\)".*/\1/p' "$(RUST_COVERAGE_DIR)/report/cobertura.xml" 2>/dev/null | head -1); \
	  COV=$$(echo "$${LINE_RATE:-0} * 100" | bc -l | xargs printf "%.1f"); \
	  echo "  Line coverage: $${COV}% (threshold: $(COVERAGE_THRESHOLD)%)"; \
	  if [ $$(echo "$${COV} < $(COVERAGE_THRESHOLD)" | bc -l) -eq 1 ]; then \
	    echo "  FAIL: $${COV}% < $(COVERAGE_THRESHOLD)%"; exit 1; \
	  else echo "  OK"; fi; \
	else echo "  No coverage data found — run 'make test' first"; fi

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
	@mkdir -p "$(EXT_BIN)"
	cp "out/$(NAP_RID)/napper" "$(EXT_BIN)/napper"
	@echo "==> Copied CLI → $(EXT_BIN)/"
	@mkdir -p "$(HOME)/.local/bin"
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
# Version management
# ============================================================

# Usage: make bump-version VERSION=0.2.0 [COMMIT=true]
bump-version:
ifndef VERSION
	$(error Usage: make bump-version VERSION=x.y.z [COMMIT=true])
endif
	@echo "==> Bumping all projects to v$(VERSION)"
	sed -i.bak 's|<Version>.*</Version>|<Version>$(VERSION)</Version>|' Directory.Build.props
	rm -f Directory.Build.props.bak
	@echo "    Directory.Build.props → $(VERSION)"
	cd src/Napper.VsCode && npm version "$(VERSION)" --no-git-tag-version --allow-same-version
	@echo "    src/Napper.VsCode/package.json → $(VERSION)"
	@if [ -f Cargo.toml ]; then \
	  sed -i.bak 's/^version = ".*"/version = "$(VERSION)"/' Cargo.toml; \
	  rm -f Cargo.toml.bak; \
	  echo "    Cargo.toml → $(VERSION)"; \
	fi
	@echo "==> All projects bumped to v$(VERSION)"
ifeq ($(COMMIT),true)
	@echo "==> Committing and pushing version bump..."
	@if [ -n "$${CI:-}" ]; then \
	  git config user.name "github-actions[bot]"; \
	  git config user.email "github-actions[bot]@users.noreply.github.com"; \
	fi
	git add Directory.Build.props src/Napper.VsCode/package.json src/Napper.VsCode/package-lock.json
	@[ -f Cargo.toml ] && git add Cargo.toml || true
	git commit -m "release: update version to v$(VERSION)"
	git push
	@echo "==> Committed and pushed v$(VERSION)"
endif

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
	mkdir -p "$(LOG_DIR)"
	rm -rf "$(FSHARP_COVERAGE_DIR)"
	mkdir -p "$(FSHARP_COVERAGE_DIR)"
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
	rm -rf "$(DOTHTTP_COVERAGE_DIR)"
	mkdir -p "$(DOTHTTP_COVERAGE_DIR)"
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
	rm -rf "$(LSP_COVERAGE_DIR)"
	mkdir -p "$(LSP_COVERAGE_DIR)"
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
	mkdir -p "$(LOG_DIR)"
	rm -rf "$(RUST_COVERAGE_DIR)"
	mkdir -p "$(RUST_COVERAGE_DIR)"
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
	mkdir -p "$(LOG_DIR)"
	rm -rf "$(TS_COVERAGE_DIR)"
	mkdir -p "$(TS_COVERAGE_DIR)"
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
	mkdir -p docs; \
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
	@echo "Available targets:"
	@echo "  build          - Compile/assemble all artifacts"
	@echo "  test           - Run full test suite with coverage"
	@echo "  lint           - Run all linters (errors mode)"
	@echo "  fmt            - Format all code in-place"
	@echo "  fmt-check      - Check formatting (no modification)"
	@echo "  clean          - Remove build artifacts"
	@echo "  check          - lint + test (pre-commit)"
	@echo "  ci             - lint + test + build (full CI)"
	@echo "  coverage       - Generate and open coverage report"
	@echo "  coverage-check - Assert coverage thresholds"
	@echo "  build-cli      - Build CLI binary only"
	@echo "  build-vsix     - Build CLI + extension + package VSIX"
	@echo "  build-zed      - Build Zed extension (WASM)"
	@echo "  test-fsharp    - Run F# tests only"
	@echo "  test-rust      - Run Rust tests only"
	@echo "  test-vsix      - Run TypeScript tests only"
