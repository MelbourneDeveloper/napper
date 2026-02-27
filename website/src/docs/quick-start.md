---
layout: layouts/docs.njk
title: Quick Start
description: "Get started with Napper in 5 minutes. Create your first HTTP request, add assertions, set up environments, and run a full test suite from the CLI."
keywords: "quick start, tutorial, first request, API testing tutorial, getting started"
eleventyNavigation:
  key: Quick Start
  order: 3
---

# Quick Start

Get up and running with Napper in under 5 minutes.

## How do I create my first request?

Create a file called `hello.nap`:

```
GET https://jsonplaceholder.typicode.com/posts/1
```

Run it:

```bash
napper run ./hello.nap
```

You should see the JSON response printed to your terminal.

## How do I add assertions?

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

## How do I use variables and environments?

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

## How do I create a test suite?

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

## How do I use Napper in CI/CD?

Output JUnit XML for your pipeline:

```bash
napper run ./smoke.naplist --output junit > results.xml
```

Napper exits with code 0 when all assertions pass, 1 when any assertion fails, and 2 on runtime errors. This integrates naturally with any CI platform that fails on non-zero exit codes.

## Next steps

- Learn the [.nap file format](/docs/nap-files/) in detail
- Build test suites with [.naplist files](/docs/naplist-files/)
- Set up [environments](/docs/environments/) for different targets
