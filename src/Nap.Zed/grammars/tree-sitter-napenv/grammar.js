/// <reference types="tree-sitter-cli/dsl" />

module.exports = grammar({
  name: "napenv",

  extras: ($) => [/[ \t]/],

  rules: {
    source_file: ($) =>
      repeat(
        choice(
          $.pair,
          $.comment,
          $.newline,
        ),
      ),

    newline: (_) => /\r?\n/,

    comment: (_) => seq("#", /[^\r\n]*/),

    pair: ($) =>
      seq($.key, "=", choice($.quoted_string, $.unquoted_value)),

    key: (_) => /[a-zA-Z_][a-zA-Z0-9_\-]*/,

    unquoted_value: (_) => /[^\r\n]+/,

    quoted_string: ($) =>
      seq('"', optional($.string_content), '"'),

    string_content: (_) => /[^"\\\r\n]+|\\./,
  },
});
