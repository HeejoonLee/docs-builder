# Monitor

Watches one running task until it ends, returns its outcome to the executor, and copies RM into the Response region when asked. It reads TGTM status CSR, writes Stop on timeout, and reads RM. It knows nothing about requests, workloads or queues. Owned by the executor. Folder: `monitor/`.

Pages: [Overview](index.md) · [Scheduler](scheduler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Structs](structs.md) · [Flows](flows.md) · [Rules](rules.md)

## The watch

The executor calls `monitor_watch()` right after every Execute, then `monitor_poll()` once per step. Each poll reads status once and returns. It never loops.

```
         monitor_watch()
IDLE ──────────────────► WATCHING
                           │ busy, polls < POLL_LIMIT     → still running
                           │ busy low                     → DONE or ERROR
                           │ polls reach POLL_LIMIT: write Stop
                           ▼
                         STOPPING
                           │ busy low                     → TIMEOUT
                           │ polls reach STOP_POLL_LIMIT  → STUCK
```

Every poll records the interrupt and error bits it reads. Interrupt bits never end a task and aren't cleared here; `start_task()` clears them before the next Execute. They go into the outcome.

## Outcome

| Outcome | Meaning |
|---|---|
| **DONE** | Busy dropped, no error bits |
| **ERROR** | Busy dropped with error bits set (values included) |
| **TIMEOUT** | Busy didn't drop within `POLL_LIMIT`, Stop was written, then busy dropped |
| **STUCK** | Busy didn't drop even after Stop. The executor sets its stuck flag |

`monitor_poll()` returns true exactly once per task, with the outcome filled in. The monitor is then IDLE again.

## RM copy (`rm_copy.c`)

```c
struct copy_result monitor_copy_rm(const struct rm_selection *sel, struct area dst);
```

After a queued task ends DONE or ERROR, the executor calls this with the task's Response selection and the Response region (after its first 16B). It copies the selected RM entries straight into it and returns how many, and whether it truncated. Never called for a Mailbox Execute, or after TIMEOUT, STUCK or a cancel.

## Public interface

```c
void monitor_watch(struct monitor *m);
bool monitor_watching(const struct monitor *m);
bool monitor_poll(struct monitor *m, struct task_outcome *out);
struct copy_result monitor_copy_rm(const struct rm_selection *sel, struct area dst);
```

`POLL_LIMIT` and `STOP_POLL_LIMIT` are macros in `monitor.c`.
