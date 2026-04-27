# agent-pmo:74cf183
# =============================================================================
# Standard Makefile — Napper
# =============================================================================

.PHONY: build test lint fmt clean ci setup build-zed

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
  ARCH    := $(shell uname -m)
  UNAME_S := $(shell uname -s)
  ifeq ($(UNAME_S),Darwin)
    ifeq ($(ARCH),arm64)
      NAP_RID ?= osx-arm64
    else
      NAP_RID ?= osx-x64
    endif
  else
    NAP_RID ?= linux-x64
  endif
endif

EXT_BIN          := src/Napper.VsCode/bin
LOG_DIR          := .commandtree/logs
FSHARP_COV       := coverage/fsharp
DOTHTTP_COV      := coverage/dothttp
LSP_COV          := coverage/lsp
TS_COV           := coverage/typescript
RUST_COV         := coverage/rust

# =============================================================================
# Standard Targets
# =============================================================================

build: _build_all

test: _test_fsharp _test_rust _test_vsix
	@$(MAKE) _coverage_check

lint:
	@echo "==> F# (warnings as errors)..."
	dotnet build --nologo -warnaserror
	@echo "==> TypeScript (ESLint)..."
	cd src/Napper.VsCode && npm run lint
	@echo "==> Rust (clippy)..."
	cargo clippy --manifest-path src/Napper.Zed/Cargo.toml
	@echo "==> Lint OK"

fmt:
	dotnet fantomas src/
	cd src/Napper.VsCode && npx prettier --write "src/**/*.ts"
	cargo fmt --manifest-path src/Napper.Zed/Cargo.toml

clean:
	$(RM) out/
	$(RM) src/Napper.Core/bin/ src/Napper.Core/obj/
	$(RM) src/Napper.Cli/bin/ src/Napper.Cli/obj/
	$(RM) src/Napper.VsCode/bin/ src/Napper.VsCode/dist/ src/Napper.VsCode/out/
	$(RM) src/Napper.VsCode/*.vsix
	$(RM) coverage/

ci: lint test build

setup:
	dotnet tool restore
	dotnet restore
	cd src/Napper.VsCode && npm ci
	cd website && npm ci
	rustup component add clippy rustfmt 2>/dev/null || true
	dotnet tool install --global dotnet-reportgenerator-globaltool 2>/dev/null || true

# =============================================================================
# Repo-Specific Targets
# =============================================================================

## build-zed: Build Zed extension (WASM) — separate from the main build
build-zed:
	@command -v cargo &>/dev/null || { echo "ERROR: cargo not found"; exit 1; }
	@command -v tree-sitter &>/dev/null || { echo "ERROR: tree-sitter not found. npm install -g tree-sitter-cli"; exit 1; }
	@if ! rustup target list --installed 2>/dev/null | grep -q wasm32-wasi; then \
	  rustup target add wasm32-wasip1; \
	fi
	@for grammar in nap naplist napenv; do \
	  (cd src/Napper.Zed/grammars/tree-sitter-$$grammar && tree-sitter generate); \
	done
	cd src/Napper.Zed && cargo build --release --target wasm32-wasip1
	cd src/Napper.Zed && cargo clippy --target wasm32-wasip1

# =============================================================================
# Private helpers
# =============================================================================

_build_cli:
	dotnet publish src/Napper.Cli/Napper.Cli.fsproj \
	  -r "$(NAP_RID)" --self-contained \
	  -p:PublishTrimmed=true -p:PublishSingleFile=true \
	  -o "out/$(NAP_RID)" --nologo
	@$(MKDIR) "$(EXT_BIN)"
	cp "out/$(NAP_RID)/napper" "$(EXT_BIN)/napper"
	@$(MKDIR) "$(HOME)/.local/bin"
	cp "out/$(NAP_RID)/napper" "$(HOME)/.local/bin/napper"
	chmod +x "$(HOME)/.local/bin/napper"
	@EXPECTED=$$(sed -n 's/.*<Version>\(.*\)<\/Version>.*/\1/p' Directory.Build.props); \
	ACTUAL=$$("out/$(NAP_RID)/napper" --version); \
	[ "$$ACTUAL" = "$$EXPECTED" ] || { echo "ERROR: version mismatch (expected $$EXPECTED got $$ACTUAL)"; exit 1; }
	@echo "==> CLI → out/$(NAP_RID)/  ~/.local/bin/napper  $(EXT_BIN)/napper"

_build_extension:
	cd src/Napper.VsCode && npm ci && npx webpack --mode production

_build_all: clean _build_cli _build_extension
	cd src/Napper.VsCode && npm run compile:tests
	cd src/Napper.VsCode && npx @vscode/vsce package --no-dependencies --skip-license
	@echo "==> Build complete — CLI + VSIX"

_test_fsharp:
	$(MKDIR) "$(LOG_DIR)"
	$(RM) "$(FSHARP_COV)" && $(MKDIR) "$(FSHARP_COV)"
	dotnet test src/Napper.Core.Tests --nologo \
	  --settings src/Napper.Core.Tests/coverage.runsettings \
	  --results-directory "$(FSHARP_COV)/raw" \
	  --logger "console;verbosity=detailed" \
	  -- RunConfiguration.FailFastEnabled=true 2>&1 | tee "$(LOG_DIR)/test-fsharp-core.log"
	reportgenerator \
	  -reports:"$(FSHARP_COV)/raw/*/coverage.cobertura.xml" \
	  -targetdir:"$(FSHARP_COV)/report" \
	  -reporttypes:"Html;TextSummary;Cobertura;lcov"
	$(RM) "$(DOTHTTP_COV)" && $(MKDIR) "$(DOTHTTP_COV)"
	dotnet test src/DotHttp.Tests --nologo \
	  --settings src/DotHttp.Tests/coverage.runsettings \
	  --results-directory "$(DOTHTTP_COV)/raw" \
	  --logger "console;verbosity=detailed" \
	  -- RunConfiguration.FailFastEnabled=true 2>&1 | tee "$(LOG_DIR)/test-dothttp.log"
	reportgenerator \
	  -reports:"$(DOTHTTP_COV)/raw/*/coverage.cobertura.xml" \
	  -targetdir:"$(DOTHTTP_COV)/report" \
	  -reporttypes:"Html;TextSummary;Cobertura;lcov"
	$(RM) "$(LSP_COV)" && $(MKDIR) "$(LSP_COV)"
	dotnet test src/Napper.Lsp.Tests --nologo \
	  --settings src/Napper.Lsp.Tests/coverage.runsettings \
	  --results-directory "$(LSP_COV)/raw" \
	  --logger "console;verbosity=detailed" \
	  -- RunConfiguration.FailFastEnabled=true 2>&1 | tee "$(LOG_DIR)/test-lsp.log"
	reportgenerator \
	  -reports:"$(LSP_COV)/raw/*/coverage.cobertura.xml" \
	  -targetdir:"$(LSP_COV)/report" \
	  -reporttypes:"Html;TextSummary;Cobertura;lcov"

_test_rust:
	$(MKDIR) "$(LOG_DIR)"
	$(RM) "$(RUST_COV)" && $(MKDIR) "$(RUST_COV)"
	cd src/Napper.Zed && cargo tarpaulin \
	  --out html lcov xml \
	  --output-dir "../../$(RUST_COV)/report" \
	  --skip-clean 2>&1 | tee "../../$(LOG_DIR)/test-rust.log"

_test_vsix: _build_cli _build_extension
	$(MKDIR) "$(LOG_DIR)"
	$(RM) "$(TS_COV)" && $(MKDIR) "$(TS_COV)"
	cd src/Napper.VsCode && npm run compile && npm run compile:tests
	cd src/Napper.VsCode && NODE_V8_COVERAGE="../../$(TS_COV)/tmp" \
	  npx mocha out/test/unit/**/*.test.js --ui tdd --timeout 5000 \
	  2>&1 | tee "../../$(LOG_DIR)/test-vsix-unit.log"
	cd src/Napper.VsCode && NODE_V8_COVERAGE="../../$(TS_COV)/tmp" \
	  npx vscode-test 2>&1 | tee "../../$(LOG_DIR)/test-vsix-e2e.log"
	cd src/Napper.VsCode && npx c8 report \
	  --temp-directory "../../$(TS_COV)/tmp" \
	  --report-dir "../../$(TS_COV)/report" \
	  --reporter html --reporter text --reporter lcov \
	  2>&1 | tee "../../$(LOG_DIR)/test-vsix-coverage.log"

_coverage_check:
	@echo "==> Coverage thresholds (coverage-thresholds.json)..."
	@_check() { \
	  local key="$$1" file="$$2" label="$$3"; \
	  local t=$$(jq ".projects[\"$$key\"].threshold // .default_threshold" coverage-thresholds.json); \
	  if [ -f "$$file" ]; then \
	    local c=$$(grep -oP 'Line coverage: \K[0-9.]+' "$$file" 2>/dev/null || echo "0"); \
	    echo "  $$label: $${c}% (threshold $${t}%)"; \
	    [ $$(echo "$${c} < $${t}" | bc -l) -eq 1 ] && { echo "  FAIL"; exit 1; } || echo "  OK"; \
	  else echo "  $$label: no data"; fi; \
	}; \
	_check "src/Napper.Core.Tests" "$(FSHARP_COV)/report/Summary.txt" "Napper.Core"; \
	_check "src/DotHttp.Tests"     "$(DOTHTTP_COV)/report/Summary.txt" "DotHttp"; \
	_check "src/Napper.Lsp.Tests"  "$(LSP_COV)/report/Summary.txt"    "Napper.Lsp"
	@THRESHOLD=$$(jq '.projects["src/Napper.Zed"].threshold // .default_threshold' coverage-thresholds.json); \
	if [ -f "$(RUST_COV)/report/cobertura.xml" ]; then \
	  LR=$$(sed -n 's/.*line-rate="\([0-9.]*\)".*/\1/p' "$(RUST_COV)/report/cobertura.xml" | head -1); \
	  COV=$$(echo "$${LR:-0} * 100" | bc -l | xargs printf "%.1f"); \
	  echo "  Rust: $${COV}% (threshold $${THRESHOLD}%)"; \
	  [ $$(echo "$${COV} < $${THRESHOLD}" | bc -l) -eq 1 ] && { echo "  FAIL"; exit 1; } || echo "  OK"; \
	else echo "  Rust: no data"; fi
	@THRESHOLD=$$(jq '.projects["src/Napper.VsCode"].threshold // .default_threshold' coverage-thresholds.json); \
	if [ -f "$(TS_COV)/report/index.html" ]; then \
	  COV=$$(cd src/Napper.VsCode && npx c8 report --reporter text 2>/dev/null | grep 'All files' | awk '{print $$4}' | tr -d '%' || echo "0"); \
	  echo "  TypeScript: $${COV}% (threshold $${THRESHOLD}%)"; \
	  [ $$(echo "$${COV} < $${THRESHOLD}" | bc -l) -eq 1 ] && { echo "  FAIL"; exit 1; } || echo "  OK"; \
	else echo "  TypeScript: no data"; fi
	@echo "==> Coverage OK"
