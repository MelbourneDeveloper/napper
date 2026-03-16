; Section headers
(section_header "[" @punctuation.bracket)
(section_header "]" @punctuation.bracket)
(section_header "meta" @keyword)
(section_header "vars" @keyword)
(section_header "steps" @keyword)

; Comments
(comment) @comment

; Key-value pairs
(pair (key) @property)
(pair "=" @operator)

; Values
(quoted_string "\"" @punctuation.delimiter)
(quoted_string (string_content) @string)
(unquoted_value) @string

; Steps (file paths)
(step) @string.special.path
