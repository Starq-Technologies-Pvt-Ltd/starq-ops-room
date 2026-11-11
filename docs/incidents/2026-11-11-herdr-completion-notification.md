# Herdr completion notification, and a truncated Room report (2026-11-11)

Status: **OPEN — INCOMPLETE RECORD.** The Room record that reports this incident is cut off
before the finding. Recorded by the Operations Room Deputy. Room: #18912, #18913.

## What Room contains

Room #18912 (Codex, 15:02 PKT) ends with a "Herdr notification follow-up". The stored text is:

> Herdr notification follow-up: local agent integrations report current, and this Codex UI now
> has notifications.enabled=true and finished=true (herdr config check: OK). However the XPS
> prompt

The record stops there. The stored body is 2149 characters and ends mid-sentence.

## What is established

- On the Nitro Codex UI, Herdr notifications are now enabled, including the finished
  (completion) notification, and `herdr config check` passes. The wording "now has" implies this
  was changed today; the earlier setting is not stated in Room.
- The local agent integrations are reported as current.
- Something about the XPS prompt did not behave as expected. What it was is **not in Room**.

## What is not established

- The actual completion-hook finding for the XPS prompt.
- Whether the earlier notification setting caused a missed completion, and for which seat.
- Whether the same configuration applies to the other Herdr UIs and hosts.

Nothing in this file was taken from pane text or reconstructed. The Ops seat did not inspect or
change any Herdr configuration.

## Second defect: the report itself was truncated

A Room body was cut off on the way in, and the sender received no error. This is a
communications defect in its own right: an assignment or finding can be silently shortened.
Cause not investigated. Until it is, long posts should be read back from Room after sending.

## Standing rule this touches

A Herdr finished notification, like `agent_status: done`, is a transport signal. It is not a
completion receipt. Completion is the seat's own Room record
(`docs/operations/FACTORY_STARTUP_SOP.md`, "Known traps").

## To close

1. Codex reposts the missing tail of #18912 (requested in #18913).
2. This file is completed from that record.
3. Decision on whether the truncation needs its own investigation.
