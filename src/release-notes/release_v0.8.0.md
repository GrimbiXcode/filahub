---
date: 2026-08-03
title: filahub runs on PostgreSQL, with a new system page
---

## PostgreSQL instead of MySQL

filahub now stores everything in PostgreSQL. If you are setting up a new
instance, the only thing that changes is the connection string — the app
creates its own schema on first start, exactly as before.

## Your data moves by itself

Upgrading from an older release? You do not need to dump and restore anything.
Point `LEGACY_MYSQL_URL` at your old MySQL database, start filahub once, and it
copies everything across: materials, weigh-ins, spool types, storage boxes, the
preset catalogue and every suggestion — all with their original IDs, so nothing
loses its connection.

The transfer only reads from the old database, never writes to it. It is safe
to repeat: running it a second time copies nothing twice, so an interrupted
transfer can simply be started again. Once it is done, remove the variable.

## A system page for administrators

**Verwaltung → System** is new. It answers the questions you would otherwise
have to dig through container logs for:

- which PostgreSQL version you are on and how the connection pool is doing
- which schema migrations have been applied, and when
- how the data transfer went — row counts per table, how long it took, and the
  error message if something failed, with a button to try again
- how many rows each table currently holds

If the transfer ever fails, filahub still starts up. That is deliberate: a
server that refuses to boot would also take away the page telling you what went
wrong.
