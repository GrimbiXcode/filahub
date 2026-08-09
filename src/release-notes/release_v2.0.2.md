---
date: 2026-08-09
title: One backslash too many
---

Another fix for people running their own instance. Nothing changes for anyone
using one.

## Escaped twice, now unescaped anyway

Deployment platforms that build the image themselves write the environment
variables into the build — and some escape the value a second time on the way,
turning `\n` into `\\n`. Coolify does this.

The result was a stray backslash at the end of every line of the operator
address:

```
c/o Somewhere\
Some Street 30
```

Line breaks are now resolved no matter how many times the value was escaped, so
`\n` works whether it arrives once-escaped, twice, or more.

## Do not use `<br>` to work around it

If you reached for HTML line breaks while this was broken, take them out again.
The legal pages are Markdown, and raw HTML is discarded there deliberately —
that is what keeps embedded text from smuggling in scripts. A `<br>` does not
become a line break; it shows up as visible text.

Plain `\n` is the answer, and it now survives every route.
