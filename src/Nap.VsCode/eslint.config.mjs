import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.all,
  tseslint.configs.all,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      // ── Project-specific: stricter than defaults ───────────────
      "complexity": ["error", 8],
      "max-depth": ["error", 3],
      "max-lines": [
        "error",
        { max: 450, skipBlankLines: true, skipComments: true },
      ],
      "max-lines-per-function": [
        "error",
        { max: 20, skipBlankLines: true, skipComments: true },
      ],
      "max-params": ["error", 3],
      "no-magic-numbers": [
        "error",
        {
          enforceConst: true,
          ignore: [0, 1, -1],
          ignoreArrayIndexes: true,
        },
      ],

      // ── Project-specific: differ from ALL for valid reasons ────
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-check": false,
          "ts-expect-error": "allow-with-description",
          "ts-ignore": true,
          "ts-nocheck": true,
        },
      ],
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          format: ["camelCase"],
          leadingUnderscore: "allow",
          selector: "default",
          trailingUnderscore: "forbid",
        },
        {
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
          leadingUnderscore: "allow",
          selector: "variable",
        },
        {
          format: ["camelCase", "PascalCase"],
          selector: "function",
        },
        {
          format: ["PascalCase"],
          selector: "typeLike",
        },
        {
          format: ["PascalCase", "UPPER_CASE"],
          selector: "enumMember",
        },
        {
          format: ["camelCase"],
          leadingUnderscore: "allow",
          selector: "parameter",
        },
        {
          format: null,
          selector: "objectLiteralProperty",
        },
        {
          format: ["camelCase", "PascalCase"],
          selector: "import",
        },
      ],
      "@typescript-eslint/no-inferrable-types": "error",
      "@typescript-eslint/no-use-before-define": [
        "error",
        { functions: false },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      "no-void": ["error", { allowAsStatement: true }],

      // ── Base rules off — TS-ESLint equivalents handle them ─────
      "no-empty-function": "off",
      "no-loop-func": "off",
      "no-magic-numbers": "off",
      "no-return-await": "off",
      "no-shadow": "off",
      "no-throw-literal": "off",
      "no-unused-expressions": "off",
      "no-use-before-define": "off",
      "no-useless-constructor": "off",
      "prefer-promise-reject-errors": "off",
      "require-await": "off",

      // ── Disabled: pointless verbosity or harmful to readability ─
      // Forces combining all const/let into one statement per scope.
      // Destroys readability — can't comment individual declarations.
      "one-var": "off",
      // Alphabetical ordering within combined declarations — pure noise.
      "sort-vars": "off",
      // Alphabetical object keys destroys logical grouping
      // (e.g. width before height, request before response).
      "sort-keys": "off",
      // Alphabetical import order fights with grouping by domain
      // (stdlib, vscode, local). Use import organizer tooling instead.
      "sort-imports": "off",
      // Bans `undefined` — absurd in TypeScript where it's a core
      // language concept and the return type of void functions.
      "no-undefined": "off",
      // Bans all ternary expressions. Ternaries are often MORE readable
      // than verbose if/else blocks for simple conditional values.
      "no-ternary": "off",
      // Forces Readonly<> wrapper on every parameter type including
      // third-party SDK types (vscode.Uri etc). Massive noise,
      // breaks compatibility, and TS already prevents mutation via const.
      "@typescript-eslint/prefer-readonly-parameter-types": "off",
      // Duplicate of base no-magic-numbers which is already configured
      // with project-specific ignore list. Having both fires twice.
      "@typescript-eslint/no-magic-numbers": "off",
      // Forces return type annotations even when TypeScript infers them
      // perfectly. Adds noise without catching any real bugs.
      "@typescript-eslint/explicit-function-return-type": "off",
      // Same as above but specifically for exported functions.
      // TypeScript inference is the whole point of the type system.
      "@typescript-eslint/explicit-module-boundary-types": "off",
      // Forces type annotations on every variable, parameter, and
      // property even when the type is obvious from the initializer.
      // `const x: number = 5` is worse than `const x = 5`.
      "@typescript-eslint/typedef": "off",
      // Forces `public`/`private`/`protected` on every class member.
      // TypeScript defaults to public which is correct for interface
      // implementations (TreeDataProvider, Disposable, etc).
      "@typescript-eslint/explicit-member-accessibility": "off",
      // Forces function expressions (`const f = function()`) over
      // function declarations (`function f()`). Conflicts with
      // `export function activate()` pattern required by vscode API.
      "func-style": "off",
      // Forces block bodies on ALL arrow functions: `() => { return x; }`
      // instead of `() => x`. Expression bodies are more concise and
      // idiomatic for one-liners, callbacks, and pure transforms.
      "arrow-body-style": "off",
      // Flags PascalCase functions as constructor-only. Conflicts with
      // naming-convention rule and factory function patterns.
      "new-cap": "off",
      // Already covered by max-lines-per-function (set to 20).
      // Having both is redundant and confusing.
      "max-statements": "off",
      // Forces every comment to start with a capital letter.
      // Inline notes, disabled code references, and shorthand
      // comments don't need to be grammatically correct.
      "capitalized-comments": "off",
      // Bans comments on the same line as code. Inline comments
      // are often the clearest way to annotate a specific value.
      "no-inline-comments": "off",
      // Bans leading underscores on identifiers. Private fields
      // use _ prefix by convention in TypeScript classes, and the
      // naming-convention rule already handles this properly.
      "no-underscore-dangle": "off",
      // Forces all variable declarations to the top of their scope.
      // Declare-near-use is far more readable and is standard TS style.
      "vars-on-top": "off",
      // Bans `continue` in loops, forcing deeply nested if/else blocks.
      // `continue` is clearer for guard clauses in loop bodies.
      "no-continue": "off",
      // Bans `++` and `--`. Forces `+= 1` which is more verbose
      // with no safety benefit in TypeScript.
      "no-plusplus": "off",
      // Bans ALL type assertions (`as T`). Type assertions are
      // sometimes necessary for narrowing (e.g. API responses,
      // test fixtures). The unsafe-* rules already catch real issues.
      "@typescript-eslint/consistent-type-assertions": "off",
      // Flags class methods that don't use `this`. These are
      // required for interface implementations (TreeDataProvider,
      // CodeLensProvider, FileDecorationProvider).
      "@typescript-eslint/class-methods-use-this": "off",
      "class-methods-use-this": "off",
      // Flags TODO/FIXME comments as errors. TODOs are a normal
      // part of development and should be tracked, not banned.
      "no-warning-comments": "off",
      // Requires `"use strict"` directive. TypeScript modules are
      // always strict — the directive is redundant noise.
      "strict": "off",
      // TS exhaustiveness checking + strict-boolean-expressions
      // already handles these better than the base ESLint rules.
      "consistent-return": "off",
      "default-case": "off",
      // Forces `if (!x)` to be rewritten as `if (x) {} else {}`.
      // Negated conditions are often the most natural way to
      // express guard clauses and early returns.
      "no-negated-condition": "off",
      // Forces destructuring even when a single property access
      // is clearer: `const name = obj.name` vs `const { name } = obj`.
      "prefer-destructuring": "off",
      // Short identifiers like `i`, `r`, `f`, `k`, `v` are clear
      // in context (loop counters, map callbacks, results).
      // naming-convention already governs format.
      "id-length": "off",
      // Forces `hasOwnProperty` check in for-in loops. Irrelevant
      // in TypeScript where objects are typed and for-of is preferred.
      "guard-for-in": "off",
      // Forces named groups in regex. Adds verbosity for simple
      // patterns where positional groups are perfectly clear.
      "prefer-named-capture-group": "off",
      // Forces /u flag on every regex. Adds noise when not
      // dealing with unicode-sensitive patterns.
      "require-unicode-regexp": "off",
      // One class per file is too restrictive when a small helper
      // class (e.g. TreeItem subclass) is tightly coupled to its parent.
      "max-classes-per-file": "off",
      // Requires enum members to have explicit initializers.
      // Auto-incrementing numeric enums are idiomatic TypeScript.
      "@typescript-eslint/prefer-enum-initializers": "off",
      // Member ordering is handled by logical grouping, not
      // alphabetical/visibility sorting. Public API first is fine
      // but the rule is too rigid for real class layouts.
      "@typescript-eslint/member-ordering": "off",
      // Flags type assertions between related types (e.g. narrowing).
      // Already caught by no-unsafe-* rules where it matters.
      "@typescript-eslint/consistent-type-assertions": "off",
      // Setter without getter is a valid pattern for write-only
      // callbacks (e.g. onSaveReport).
      "accessor-pairs": "off",
    },
  },
  {
    files: ["src/test/**/*.ts"],
    rules: {
      // ── Minimal test relaxations (tests are strict too) ────────
      "max-lines-per-function": "off",
      "max-lines": "off",
      "no-magic-numbers": "off",
      "@typescript-eslint/no-magic-numbers": "off",
    },
  },
  {
    ignores: [
      "out/**",
      "dist/**",
      "node_modules/**",
      ".vscode-test/**",
      "src/test/fixtures/**",
      "*.js",
      "*.mjs",
      "*.cjs",
    ],
  },
);
