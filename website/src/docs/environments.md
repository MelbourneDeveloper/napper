---
layout: layouts/docs.njk
title: Environments
description: "Manage environment variables with .napenv files. Local secrets, named environments, and variable resolution."
keywords: "environment variables, .napenv, secrets, configuration"
eleventyNavigation:
  key: Environments
  order: 6
---

# Environments

Napper uses `.napenv` files for environment-specific configuration. These are simple key-value files that define variables for your requests.

## .napenv files

### Base environment

Create a `.napenv` file in your project root:

```
baseUrl = https://api.example.com
timeout = 5000
```

This file should be committed to version control.

### Named environments

Create environment-specific files like `.napenv.staging` or `.napenv.production`:

```
# .napenv.staging
baseUrl = https://staging.api.example.com
```

```
# .napenv.production
baseUrl = https://api.example.com
```

Switch environments with the `--env` flag:

```bash
napper run ./tests/ --env staging
```

Or use the environment switcher in the VS Code status bar.

### Local secrets

Create a `.napenv.local` file for secrets that should never be committed:

```
# .napenv.local — add to .gitignore!
token = sk-live-abc123
adminPassword = supersecret
```

The VS Code extension masks values from `.napenv.local` in hover tooltips.

## Resolution order

Variables are resolved from highest to lowest priority:

1. **CLI flags**: `--var key=value`
2. **`.napenv.local`**: Local secrets (gitignored)
3. **`.napenv.<name>`**: Named environment
4. **`.napenv`**: Base environment
5. **`[vars]` block**: Defaults in `.nap` or `.naplist` files

This means CLI flags always win, and file-level defaults are the fallback.

## Usage in requests

Reference variables with double curly braces:

{% raw %}
```
[request]
GET {{baseUrl}}/users

[request.headers]
Authorization = Bearer {{token}}
```
{% endraw %}

Variables can appear in URLs, header values, and body content.
