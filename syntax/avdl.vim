" Vim syntax file
" Language: Avro IDL
" Ported from apache/avro share/editors/avro-idl.vim (Daniel Lundin <dln@eintr.org>)
" https://github.com/apache/avro/blob/main/share/editors/avro-idl.vim
"
" Licensed to the Apache Software Foundation (ASF) under one
" or more contributor license agreements. See the NOTICE file
" distributed with this work for additional information
" regarding copyright ownership. The ASF licenses this file
" to you under the Apache License, Version 2.0 (the
" "License"); you may not use this file except in compliance
" with the License. You may obtain a copy of the License at
"
"   https://www.apache.org/licenses/LICENSE-2.0

if exists("b:current_syntax")
  finish
endif

syn case match

" Todo
syn keyword avroTodo TODO todo FIXME fixme XXX xxx contained

" Comments
syn region avroDocComment start="/\*\*" end="\*/" contains=avroTodo,@Spell
syn region avroComment    start="/\*"   end="\*/" contains=avroTodo,@Spell
syn match  avroComment    "//.*$"                 contains=avroTodo,@Spell

" Identifiers
syn region avroIdentifier start="^\s*\(error\|protocol\|record\|enum\|fixed\)\>" end="{\|;" contains=avroIdentifierType,avroComment,avroNumber
syn keyword avroIdentifierType error protocol record enum fixed contained nextgroup=avroIdentifierName skipwhite
syn match avroIdentifierName "\w\w*" display contained skipwhite

" Escaped (backtick-quoted) identifiers
syn region avroEscaped start=/`/ end=/`/

" Types
syn match  avroNumber "-\=\<\d\+\>"
syn region avroString start=/"/ skip=/\\"/ end=/"/
syn region avroString start=/'/ skip=/\\'/ end=/'/
syn region avroArray  start="<" end=">" contains=avroArrayType,avroBasicTypes,avroStructure
syn match  avroArrayType "\w\w*" display contained skipwhite

" Annotations: @namespace("..."), @order("ascending"), @aliases([...]), @logicalType(...)
syn match avroAnnotation "@\w\+" display

" Keywords
syn keyword avroKeyword java-class namespace order aliases logicalType
syn keyword avroKeyword throws oneway
syn keyword avroKeyword import idl schema
syn keyword avroBasicTypes boolean bytes double float int long null string void
syn keyword avroBasicTypes date time_ms timestamp_ms local_timestamp_ms decimal uuid
syn keyword avroStructure array map union

hi def link avroTodo           Todo
hi def link avroComment        Comment
hi def link avroDocComment     SpecialComment
hi def link avroNumber         Number
hi def link avroKeyword        Define
hi def link avroAnnotation     PreProc
hi def link avroIdentifierType Special
hi def link avroBasicTypes     Type
hi def link avroArrayType      Type
hi def link avroString         String
hi def link avroStructure      Structure
hi def link avroArray          Structure
hi def link avroEscaped        Identifier
hi def link avroIdentifierName Function

let b:current_syntax = "avdl"
