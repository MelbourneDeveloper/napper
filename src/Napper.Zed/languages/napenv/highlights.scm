; Comments
(comment) @comment

; Key-value pairs
(pair (key) @property)
(pair "=" @operator)

; Values
(quoted_string "\"" @punctuation.delimiter)
(quoted_string (string_content) @string)
(unquoted_value) @string
