---
date: 2026-08-08
title: Addresses that survive the trip
---

A fix for people running their own instance. Nothing changes for anyone using
one.

## The operator address takes any spelling now

`LEGAL_OPERATOR_ADDRESS` and `LEGAL_OPERATOR_HOSTING` may span several lines,
and there are more ways for a line break to end up in an environment variable
than one would like. Two of them slipped through: a literal `\r\n` left a
visible `\r` in the text, and a real Windows line ending left a stray carriage
return in the middle of the line. Both now produce a clean break, as does
everything else — quoted values, pasted text, mixed spellings.

An imprint is a poor place to advertise a parsing bug.

## Write line breaks as `\n`

The README used to suggest pasting several lines into a deployment platform's
input field. That was wrong. Platforms that build the image themselves pass the
variables into the build, where a real newline ends the line and the rest is
read as the next instruction — the build fails.

`\n` works everywhere: config files, Compose, `docker run -e`, and platforms
that build for you. The documentation now says so.
