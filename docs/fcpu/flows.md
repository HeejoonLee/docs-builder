# Flows

The common cases, step by step. S = scheduler, H = handler, E = executor, M = monitor.

Pages: [Overview](index.md) · [Scheduler](scheduler.md) · [Handler](handler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Flows](flows.md) · [Rules](rules.md)

## Supplied workload, 100 Descriptors

```
ICPU  writes 100 × 16B into the workload buffer, queues entry (seq 7, SUPPLIED)
S     IDLE → H.take_workload (accept, resolve area) → cmd_table: copy_source → BEGIN
S     BEGIN: copy_source.begin → 100, 1 task
S     LOAD: E.load(copy_source, 0, 100)   ← workload buffer → DM, one copy
S     H.consume_workload                   ← mark consumed, acknowledge to ICPU
S     START: selection, E.start_task(0, 99), M.watch
S     WATCH: M.poll … RUNNING … DONE
S     FINISH: M.copy_responses(sel, H.response_area())   ← RM → response buffer, one copy
S     H.send_final(seq 7, DONE)
```

## Generated workload, 5000 Descriptors

```
S     BEGIN: gen_seq_write.begin → 5000 = tasks of 2048 / 2048 / 904; H.consume_workload
S     task 1: LOAD 2048 → START → WATCH … DONE → H.send_progress(1/3)
S     task 2: … H.send_progress(2/3)
S     task 3: LOAD 904 → START(0, 903) → WATCH … DONE
S     FINISH: copy task 3's Responses; H.send_final(DONE)
```

This is the same loop as the Supplied case. Only the source differs.

## Error in the middle

```
M     task 2 ends: ERROR (error bits)
S     no task 3 → FINISH: copy task 2's Responses; send_final(ERROR, task 2, bits)
```

## CSR read while a task runs

```
ICPU  direct: CSR read
S     serve_direct: E.csr_read → H.reply_direct
S     advance: M.poll → RUNNING
```

## DM read while a task runs

```
ICPU  direct: DM read
S     M.is_watching → H.reply_direct(BUSY)
```

## Raw Execute after a load-only workload

```
ICPU  workload (seq 9, load only) → S: BEGIN, LOAD → H.send_loaded(seq 9) → IDLE
ICPU  direct: CSR write start=0, end=99   → served
ICPU  direct: CSR write Execute
S     not watching, no workload, not stuck → E.select_responses(0, 99)
      E.start_task_raw → M.watch → H.reply_direct(OK)
S     WATCH … DONE → copy Responses; H.send_final(raw, DONE)
```

## Raw Execute during a workload

```
ICPU  direct: CSR write Execute
S     workload active → H.reply_direct(BUSY)
```

## Timeout

```
M     POLL_LIMIT reached → writes Stop → STOPPING
M     busy drops → TIMEOUT
S     FINISH: no Response copy; send_final(TIMEOUT)
```

If busy never drops: STUCK. S sets the stuck flag, rejects Execute and memory access, and leaves queued workloads waiting. It clears the flag on a later CSR write after which busy reads low.

## Stop from ICPU

```
ICPU  direct: CSR write Stop
S     E.csr_write → cancel flag → H.reply_direct(OK)
M     task ends (busy drops, or timeout)
S     cancelled → no more tasks → send_final(CANCELLED)
```
