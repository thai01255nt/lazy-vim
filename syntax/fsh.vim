" Vim syntax file
" Language: FHIR Shorthand (FSH)
" Ported from vscode-fsh (syntaxes/fsh.tmLanguage.json) and vim-integration

if exists("b:current_syntax")
  finish
endif

syn case match

" ---------------------------------------------------------------------------
" Comments (must be first so they override other patterns)
" ---------------------------------------------------------------------------
syn keyword fshTodo contained TODO FIXME XXX NOTE HACK
syn match  fshLineComment   "\/\/.*$"            contains=fshTodo,@Spell
syn region fshBlockComment  start="\/\*" end="\*\/" contains=fshTodo,@Spell

" ---------------------------------------------------------------------------
" Strings
" ---------------------------------------------------------------------------
syn region fshTripleString  start=+"""+ end=+"""+
syn region fshString        start=+"+ skip=+\\"+ end=+"+ contains=fshStringEscape
syn match  fshStringEscape  contained +\\.+

" UCUM units (single-quoted)
syn region fshUcum          start=+'+ end=+'+

" Bracketed raw strings used inside insert(...)
syn region fshBracketString start=+\[\[+ end=+\]\]+

" ---------------------------------------------------------------------------
" URLs and aliases
" ---------------------------------------------------------------------------
syn match  fshUrl           /\<https\?:\/\/\S\+/
syn match  fshAlias         /\$[^ \t#]\+/

" ---------------------------------------------------------------------------
" Numbers, cardinality, booleans
" ---------------------------------------------------------------------------
syn match  fshCardinality   /\<\d*\.\.\%(\d\+\|\*\)\>/
syn match  fshNumber        /\<-\=\d\+\%(\.\d\+\)\?\>/
syn keyword fshBoolean      true false

" ---------------------------------------------------------------------------
" Codes: #code, #"quoted code"
" ---------------------------------------------------------------------------
syn match  fshQuotedCode    /#"\%(\\.\|[^"\\]\)*"/
syn match  fshCode          /#[^ \t,]\+/

" Caret paths (like ^experimental = true)
syn match  fshCaretPath     /\^\S\+/

" ---------------------------------------------------------------------------
" Tokens / punctuation
" ---------------------------------------------------------------------------
syn match  fshRuleStar      /^\s*\*/
syn match  fshArrow         /->/
syn match  fshTokenChar     /[=+:]/

" ---------------------------------------------------------------------------
" Metadata keywords that end with ':'
" ---------------------------------------------------------------------------
syn match  fshMeta          /\<\%(Alias\|Characteristics\|Context\|Description\|Expression\|Mixins\|Severity\|Target\|Title\|Usage\|XPath\)\>\ze\s*:/

" ---------------------------------------------------------------------------
" Definition keywords (name follows)
"   Profile: Foo  →  'Profile' = keyword, 'Foo' = type name
" ---------------------------------------------------------------------------
syn match  fshDefKeyword    /\<\%(CodeSystem\|Extension\|Id\|Instance\|InstanceOf\|Invariant\|Logical\|Mapping\|Parent\|Profile\|Resource\|RuleSet\|Source\|ValueSet\)\>\ze\s*:/  nextgroup=fshEntityName skipwhite
syn match  fshEntityName    contained /:\s*\zs[A-Za-z0-9$_.:/-]\+/

" ---------------------------------------------------------------------------
" Reserved rule keywords (used inside rules, not terminated by ':')
" ---------------------------------------------------------------------------
syn match fshReserved /\<\%(and\|codes\|contains\|descendent-of\|exclude\|exists\|generalizes\|include\|in\|is-a\|is-not-a\|named\|not-in\|or\|regex\|system\|units\|valueset\|where\|D\|MS\|N\|SU\|TU\)\>/
syn match fshReserved /?!/

" Binding strength inside parentheses: (exactly|example|extensible|preferred|required)
syn match fshBindingStrength /(\s*\%(exactly\|example\|extensible\|preferred\|required\)\s*)/ contains=fshBindingStrengthInner
syn match fshBindingStrengthInner contained /\<\%(exactly\|example\|extensible\|preferred\|required\)\>/

" Reference / Canonical / CodeableReference(...)
syn keyword fshRefType Reference Canonical CodeableReference

" Primitive / type names
syn keyword fshType boolean string integer decimal uri url canonical code id oid uuid date dateTime instant time markdown base64Binary positiveInt unsignedInt
syn keyword fshType CodeableConcept Coding Quantity SimpleQuantity Range Ratio Period Annotation Attachment Identifier HumanName Address ContactPoint Signature SampledData Money Duration Age Count Distance Dosage

" from / obeys → next token is an entity name
syn match fshRefKeyword /\<\%(from\|obeys\|only\|insert\)\>/

" ---------------------------------------------------------------------------
" Highlight links — chosen so they render similarly in vscode-fsh
" ---------------------------------------------------------------------------
hi def link fshTodo                 Todo
hi def link fshLineComment          Comment
hi def link fshBlockComment         Comment

hi def link fshString               String
hi def link fshTripleString         String
hi def link fshStringEscape         SpecialChar
hi def link fshUcum                 Character
hi def link fshBracketString        String

hi def link fshUrl                  Underlined
hi def link fshAlias                PreProc

hi def link fshCardinality          Number
hi def link fshNumber               Number
hi def link fshBoolean              Boolean

hi def link fshQuotedCode           Number
hi def link fshCode                 Number
hi def link fshCaretPath            Special

hi def link fshRuleStar             Operator
hi def link fshArrow                Operator
hi def link fshTokenChar            Operator

hi def link fshMeta                 Keyword
hi def link fshDefKeyword           Keyword
hi def link fshEntityName           Type

hi def link fshReserved             Statement
hi def link fshRefKeyword           Statement
hi def link fshBindingStrengthInner Statement
hi def link fshBindingStrength      NONE

hi def link fshRefType              Type
hi def link fshType                 Type

setlocal commentstring=//\ %s

let b:current_syntax = "fsh"
