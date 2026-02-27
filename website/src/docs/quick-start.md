---
layout: layouts/docs.njk
title: Quick Start
description: "Get started with Napper in 5 minutes. Create your first request, add assertions, and run a test suite."
keywords: "quick start, tutorial, first request, API testing tutorial"
eleventyNavigation:
  key: Quick Start
  order: 3
---

# Quick Start

Get up and running with Napper in under 5 minutes.

## 1. Create your first request

Create a file called `hello.nap`:

```
GET https://jsonplaceholder.typicode.com/posts/1
```

Run it:

```bash
napper run ./hello.nap
```

You should see the JSON response printed to your terminal.

## 2. Add assertions

Edit `hello.nap` to verify the response:

```
[request]
GET https://jsonplaceholder.typicode.com/posts/1

[assert]
status = 200
body.userId = 1
body.title exists
```

Run it again. Napper will report whether each assertion passed or failed.

## 3. Use variables

Create a `.napenv` file in the same directory:

```
baseUrl = https://jsonplaceholder.typicode.com
```

Update your request to use the variable:

{% raw %}
```
[request]
GET {{baseUrl}}/posts/1

[assert]
status = 200
```
{% endraw %}

## 4. Create a test suite

Create a `smoke.naplist` file:

```
[meta]
name = Smoke Tests

[steps]
./hello.nap
./users/get-users.nap
./users/create-user.nap
```

Run the entire suite:

```bash
napper run ./smoke.naplist
```

## 5. Use in CI/CD

Output JUnit XML for your pipeline:

```bash
napper run ./smoke.naplist --output junit > results.xml
```

## Why Napper?

### vs Postman

Postman is a GUI-first tool that requires an account, stores collections in JSON, and locks advanced features behind a paywall. Napper is free, open source, CLI-first, and stores everything in plain text files that belong in your repo.

### vs Bruno

Bruno is a great open-source alternative to Postman, but it's still GUI-first. Napper puts the CLI first and gives you the full power of F# scripting instead of sandboxed JavaScript.

### vs .http files

`.http` files are simple and built into VS Code, but they have no assertions, no test suites, no variables, no scripting, and no CLI. Napper gives you all of that while keeping the same plain-text simplicity.

## Next steps

- Learn the [.nap file format](/docs/nap-files/) in detail
- Build test suites with [.naplist files](/docs/naplist-files/)
- Set up [environments](/docs/environments/) for different targets
