# Nap Scripting Model

Scripts are external files referenced by relative path from the `nap-script` section. This keeps `.nap` files clean and makes scripts independently testable and reusable across many `.nap` files.

- `script-fsx` — F# scripts (`.fsx`) executed via `dotnet fsi`
- `script-csx` — C# scripts (`.csx`) executed via `dotnet script`

---

## `script-context` — Script Context Object

The runtime injects a `NapContext` object into every script. The interface (F# record):

```fsharp
type NapResponse = {
    StatusCode : int
    Headers    : Map<string, string>
    Body       : string          // raw body
    Json       : JsonElement     // parsed if Content-Type is JSON
    Duration   : TimeSpan
}

type NapContext = {
    Vars      : Map<string, string>   // mutable — scripts can set vars for downstream steps
    Request   : HttpRequestMessage    // pre-script only
    Response  : NapResponse           // post-script only (None in pre-script)
    Env       : string                // current environment name
    Fail      : string -> unit        // call to fail the test with a message
    Set       : string -> string -> unit  // set a variable for downstream steps
    Log       : string -> unit        // write to test output
}
```

---

## `script-post` — Example Post-Script (`validate-user.fsx`)

```fsharp
// ctx : NapContext is injected automatically
let user = ctx.Response.Json

if user.GetProperty("id").GetString() <> ctx.Vars["userId"] then
    ctx.Fail "User ID mismatch"

// Extract a token from response and pass it to the next step
let token = user.GetProperty("sessionToken").GetString()
ctx.Set "token" token
```

---

## `script-orchestration` — Script-Driven Execution (Inverse Model)

The relationship between `.nap` files and scripts works **both ways**:

**`.nap` file drives scripts** — a request file references one or more pre/post scripts.

**Script drives `.nap` files** — an `.fsx` file can itself act as the entry point, orchestrating as many requests as needed:

```fsharp
// orchestrate.fsx — F# script as the top-level runner
// ctx : NapContext injected; nap : NapRunner also injected

let loginResult = nap.Run "./auth/01_login.nap"
ctx.Set "token" (loginResult.Response.Json.GetProperty("token").GetString())

for userId in [1; 2; 3] do
    ctx.Set "userId" (string userId)
    let result = nap.Run "./users/get-user.nap"
    if result.Response.StatusCode <> 200 then
        ctx.Fail $"User {userId} not found"
```

### `script-runner` — NapRunner

The `NapRunner` object injected into orchestration scripts:

```fsharp
type NapRunner = {
    Run     : string -> NapResult          // run a .nap file, returns result
    RunList : string -> NapResult list     // run a .naplist file
    Vars    : Map<string, string>          // shared variable bag
}
```

This enables arbitrarily complex test flows — loops, branching, data-driven runs — without any special playlist syntax.

A `.naplist` can reference an `.fsx` orchestration script as a step, the same as any `.nap` file:

```naplist
[steps]
./auth/01_login.nap
./scripts/parametrized-user-tests.fsx    # script drives multiple .nap files
./teardown/cleanup.nap
```

---

## `script-dispatch` — Language Extensibility

The `nap-script` section specifies a file path. The runtime dispatches based on file extension:
- `.fsx` → F# interactive via `dotnet fsi` (`script-fsx`)
- `.csx` → C# scripting via `dotnet script` (`script-csx`)
- Future: `.py`, `.js`, etc. — the architecture allows pluggable runners
