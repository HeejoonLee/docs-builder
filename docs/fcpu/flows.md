# Flows

The common cases, step by step. S = scheduler, E = executor, M = monitor. The first four are the flows in the current FCPU code (`ref/*_flow.md`), mapped onto this design.

Pages: [Overview](index.md) · [Scheduler](scheduler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Structs](structs.md) · [Flows](flows.md) · [Rules](rules.md)

## Mailbox: TGTM memory read/write

```
ICPU  reserved[0] = type, index, word (done bit 0); reserved[2] = value (write)
S     serve_mailbox: mailbox_peek → E.executor_mailbox
E     no task running, not stuck → tgtm read/write
S     mailbox_complete: reserved[1] = status, reserved[2] = value (read), set done bit
```

## Mailbox: TGTM CSR read/write

```
ICPU  reserved[0] = offset, is_write; reserved[2] = value (write)
E     read STATUS, ERROR → read/write the register → re-read STATUS, ERROR
S     reserved[1] = the four reads, reserved[2] = value, set done bit
```

## Queued: DIRECT_DM

```
ICPU  payload: header (seq 0, DIRECT_DM, config flag), 16B config, Descriptors, UM data; entry → Request queue
S     executor idle, region free → queue_peek, read header, seq 0 == expected → expected 1
E     busy? no → apply config → Descriptors → DM from desc_start → UM data → UM
E     result: consume, command response
S     ConsumeRequest; response pending → delivered
```

## Queued: CONTROL EXECUTE, with Response selection

```
ICPU  header (seq 1, CONTROL, END_SEQUENCE), csr_offset, EXECUTE, value, selection
S     admit: seq 1 == expected → expected 0
E     read selection → result: consume → workload {QUEUED, seq 1, 1 task}
E     start_task → M.watch → command response "accepted" → WAIT_TASK
S     ConsumeRequest; deliver "accepted"
S/E   … each step: S serves the Mailbox, E: M.poll → running …
M     busy low → DONE
E     TASK_ENDED waits until ICPU has read "accepted", then: M.copy_rm(selection, region) → final response → IDLE
S     deliver final: 16B outcome + RM entries, one Response queue entry
```

## Queued: CONTROL, other operation

```
E     run the operation's CSR sequence → consume → command response
```

## Out-of-order sequence number

```
S     header seq 3, expected 2 → consume, error response (always), expected 0
```

## Mailbox Execute

```
ICPU  CSR write start/end (Mailbox), then CSR write execute (Mailbox)
E     no workload, not stuck → workload {MAILBOX, 1 task}, start_task (CSR start/end as set) → M.watch
S     Mailbox reply: accepted
M     … busy low → DONE / ERROR (e.g. DM empty)
E     TASK_ENDED: no RM copy → final 16B outcome, mailbox-origin
ICPU  reads RM with Mailbox memory reads if it wants them
```

## Mailbox Execute during a workload

```
E     workload active → reply rejected (busy)
```

## Mailbox DM read during a task

```
E     task running → reply rejected (busy)
```

## API_SET, 5000 Descriptors

```
E     begin: gen.begin → 5000 → tasks 2048 / 2048 / 904; consume; command response → NEXT_TASK
E     NEXT_TASK: fill 2048 → start_task(0, 2047) → WAIT_TASK … DONE → TASK_ENDED: progress 1/3
E     … progress 2/3
E     task 3: fill 904 → start_task(0, 903) … DONE → RM copy, final response
```

## API_SET, error in task 2

```
M     task 2 → ERROR
E     TASK_ENDED: stop here → RM copy of task 2, final response (ERROR, task 2, bits)
```

## Timeout

```
M     POLL_LIMIT reached → write Stop → STOPPING → busy low → TIMEOUT
E     TASK_ENDED: no RM copy → final response (TIMEOUT)
```

If busy never drops: STUCK. E sets stuck; S admits no Queued requests; Mailbox memory access and Execute are rejected. A later Mailbox CSR write after which busy reads low clears it.

## Stop from ICPU

```
ICPU  Mailbox CSR write, stop bit
E     the write; workload.cancelled = true; reply
M     busy low (or timeout)
E     TASK_ENDED: cancelled → no more tasks, no RM → final response (CANCELLED)
```

## ICPU slow to read responses

```
S     "accepted" delivered; ICPU hasn't read it yet
E     task ends → TASK_ENDED: region not free → wait, outcome held
S     still serving the Mailbox every step
ICPU  reads → read_count catches up → E copies RM, final response
```

## Ready clear

```
S     ready_is_set → false: no Mailbox, no queue, no delivery
E     WAIT_TASK keeps polling; TASK_ENDED waits for the region
```
