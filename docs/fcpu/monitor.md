# Monitor

Watches the running task until it ends, returns its outcome, and copies the task's Responses out of RM. It reads TGTM status CSR, writes Stop on timeout, and reads RM. It never touches the queues or DM/UM. Folder: `monitor/`.

Pages: [Overview](index.md) · [Scheduler](scheduler.md) · [Handler](handler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Flows](flows.md) · [Rules](rules.md)

## The watch

The scheduler calls `watch()` right after every Execute, then calls `poll()` once per step. Each `poll()` reads status once and returns. It never loops.

```
         watch()
IDLE ──────────────► WATCHING
                       │ busy, polls < POLL_LIMIT         → RUNNING
                       │ busy low                          → DONE or ERROR
                       │ polls reach POLL_LIMIT: write Stop
                       ▼
                     STOPPING
                       │ busy low                          → TIMEOUT
                       │ polls reach STOP_POLL_LIMIT       → STUCK
```

Every poll records the interrupt and error bits it reads. Interrupt bits never end a task and are never cleared here (the executor clears them before the next Execute). They go into the outcome.

## Outcome

| Outcome | Meaning |
|---|---|
| **DONE** | Busy dropped, no error bits |
| **ERROR** | Busy dropped with error bits set (values included) |
| **TIMEOUT** | Busy didn't drop within `POLL_LIMIT`, Stop was written, then busy dropped |
| **STUCK** | Busy didn't drop even after Stop. The scheduler sets its stuck flag and refuses new tasks |

Every outcome carries the interrupt bits seen. After any outcome the monitor is idle again.

## Response copy (`responses.c`)

```c
copy_result copy_responses(const rm_range *sel, int nsel, area dst);
```

Once a task has ended in DONE or ERROR, the scheduler calls this with the task's response selection and the response-buffer area from `handler.response_area()`. It copies the selected RM entries straight into that area, with no staging. It copies what fits and returns how many, and whether it truncated. The selection itself is worked out by the executor before Execute, because that needs DM.

## Public interface

```c
void watch(void);
bool is_watching(void);
poll_result poll(outcome *out);   /* RUNNING, or ENDED with *out filled */
copy_result copy_responses(const rm_range *sel, int nsel, area dst);
```

`POLL_LIMIT` and `STOP_POLL_LIMIT` are macros in `monitor.c`.
