---
layout: layouts/docs.njk
title: CI Integration
description: "Run Napper tests in CI/CD pipelines. GitHub Actions, GitLab CI, and other platforms."
keywords: "CI/CD, GitHub Actions, GitLab CI, continuous integration, test automation"
eleventyNavigation:
  key: CI Integration
  order: 10
---

# CI Integration

Napper is built for CI/CD. The CLI binary is self-contained with no runtime dependencies, and outputs standard formats like JUnit XML.

## GitHub Actions

```yaml
name: API Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Download Napper CLI
        run: |
          curl -L -o napper https://github.com/MelbourneDeveloper/napper/releases/latest/download/napper-linux-x64
          chmod +x napper
          sudo mv napper /usr/local/bin/

      - name: Run API tests
        run: napper run ./tests/ --env ci --output junit > results.xml

      - name: Upload results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: api-test-results
          path: results.xml
```

## GitLab CI

```yaml
api-tests:
  stage: test
  image: mcr.microsoft.com/dotnet/runtime:10.0
  before_script:
    - curl -L -o /usr/local/bin/napper https://github.com/MelbourneDeveloper/napper/releases/latest/download/napper-linux-x64
    - chmod +x /usr/local/bin/napper
  script:
    - napper run ./tests/ --env ci --output junit > results.xml
  artifacts:
    reports:
      junit: results.xml
```

## Environment variables

Create a `.napenv.ci` file for CI-specific configuration:

```
baseUrl = https://staging.api.example.com
timeout = 10000
```

Override secrets via CLI flags:

```bash
napper run ./tests/ --env ci --var token=$API_TOKEN
```

## Output formats

| Format | Use case |
|--------|----------|
| `junit` | Most CI platforms (GitHub Actions, GitLab, Jenkins, Azure DevOps) |
| `tap` | TAP consumers, some CI tools |
| `json` | Custom processing, dashboards |
| `ndjson` | Streaming to log aggregators |

## Exit codes

Napper exits with code `0` when all assertions pass, `1` when any assertion fails, and `2` on runtime errors. This integrates naturally with CI pipelines that fail on non-zero exit codes.
