## Too Many Cooks

You are working with many other agents. Make sure there is effective cooperation
- Register on TMC immediately
- Don't edit files that are locked; lock files when editing
- COMMUNICATE REGULARLY AND COORDINATE WITH OTHERS THROUGH MESSAGES

## Coding Rules

- **Zero duplication - TOP PRIORITY** - Always search for existing code before adding. Move; don't copy files. Add assertions to tests rather than duplicating tests. AIM FOR LESS CODE!
- **No string literals** - Named constants only, and it ONE location
- DO NOT USE GIT
- **Functional style** - Prefer pure functions, avoid classes where possible
- **No suppressing warnings** - Fix them properly
- **No REGEX** It is absolutely ⛔️ illegal, and no text matching in general
- **Expressions over assignments** - Prefer const and immutable patterns
- **Named parameters** - Use object params for functions with 3+ args
- **Keep files under 450 LOC and functions under 20 LOC**
- **No commented-out code** - Delete it
- **No placeholders** - If incomplete, leave LOUD compilation error with TODO

### Typescript
- **TypeScript strict mode** - No `any`, no implicit types, turn all lints up to error
- **Regularly run the linter** - Fix lint errors IMMEDIATELY
- **Decouple providers from the VSCODE SDK** - No vscode sdk use within the providers
- **Ignoring lints = ⛔️ illegal** - Fix violations immediately
- **No throwing** - Only return `Result<T,E>`

### F# 
- **Idiomatic F#**

## Testing

⚠️ NEVER KILL VSCODE PROCESSES

#### Rules
- **Prefer e2e tests over unit tests** - only unit tests for isolating bugs
- Separate e2e tests from unit tests by file. They should not be in the same file together.
- Prefer adding assertions to existing tests rather than adding new tests
- Test files in `src/test/suite/*.test.ts`
- Run tests: `npm test`
- NEVER remove assertions
- FAILING TEST = ✅ OK. TEST THAT DOESN'T ENFORCE BEHAVIOR = ⛔️ ILLEGAL
- Unit test = No VSCODE instance needed = isolation only test

### Automated (E2E) Testing

**AUTOMATED TESTING IS BLACK BOX TESTING ONLY**
Only test the UI **THROUGH the UI**. Do not run command etc. to coerce the state. You are testing the UI, not the code.

- Tests run in actual VS Code window via `@vscode/test-electron`
- Automated tests must not modify internal state or call functions that do. They must only use the extension through the UI. 
 * - ❌ Calling internal methods like provider.updateTasks()
 * - ❌ Calling provider.refresh() directly
 * - ❌ Manipulating internal state directly
 * - ❌ Using any method not exposed via VS Code commands
 * - ❌ Using commands that should just happen as part of normal use. e.g.: `await vscode.commands.executeCommand('commandtree.refresh');`
 * - ❌ `executeCommand('commandtree.addToQuick', item)` - TAP the item via the DOM!!!

### Test First Process
- Write test that fails because of bug/missing feature
- Run tests to verify that test fails because of this reason
- Adjust test and repeat until you see failure for the reason above
- Add missing feature or fix bug
- Run tests to verify test passes.
- Repeat and fix until test passes WITHOUT changing the test

**Every test MUST:**
1. Assert on the ACTUAL OBSERVABLE BEHAVIOR (UI state, view contents, return values)
2. Fail if the feature is broken
3. Test the full flow, not just side effects like config files

### ⛔️ FAKE TESTS ARE ILLEGAL

**A "fake test" is any test that passes without actually verifying behavior. These are STRICTLY FORBIDDEN:**

```typescript
// ❌ ILLEGAL - asserts true unconditionally
assert.ok(true, 'Should work');

// ❌ ILLEGAL - no assertion on actual behavior
try { await doSomething(); } catch { }
assert.ok(true, 'Did not crash');

// ❌ ILLEGAL - only checks config file, not actual UI/view behavior
writeConfig({ quick: ['task1'] });
const config = readConfig();
assert.ok(config.quick.includes('task1')); // This doesn't test the FEATURE

// ❌ ILLEGAL - empty catch with success assertion
try { await command(); } catch { /* swallow */ }
assert.ok(true, 'Command ran');
```

## Critical Docs

### Vscode SDK
[VSCode Extension API](https://code.visualstudio.com/api/)
[VSCode Extension Testing API](https://code.visualstudio.com/api/extension-guides/testing)
[VSCODE Language Model API](https://code.visualstudio.com/api/extension-guides/ai/language-model)
[Language Model Tool API](https://code.visualstudio.com/api/extension-guides/ai/tools)
[AI extensibility in VS Cod](https://code.visualstudio.com/api/extension-guides/ai/ai-extensibility-overview)
[AI language models in VS Code](https://code.visualstudio.com/docs/copilot/customization/language-models)

### Website

https://developers.google.com/search/blog/2025/05/succeeding-in-ai-search
https://developers.google.com/search/docs/fundamentals/seo-starter-guide

https://studiohawk.com.au/blog/how-to-optimise-ai-overviews/
https://about.ads.microsoft.com/en/blog/post/october-2025/optimizing-your-content-for-inclusion-in-ai-search-answers