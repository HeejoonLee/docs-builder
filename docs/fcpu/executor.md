# Executor

Takes TGTM workloads off the workload queue, turns them into descriptors, and, for auto workloads, runs every TGTM task to the end. Folder: `executor/`.

Pages: [Overview](index.md) · [Handler](handler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Flows](flows.md) · [Rules & policies](rules.md)

## Responsibilities

- Only reader of the **workload queue**.
- Holds the one active workload and its state machine.
- Calls generators to write descriptors into DM.
- Starts Executes for auto workloads and gets their outcomes from the monitor.
- Sends `reply_loaded`, `reply_progress` and `reply_workload_done`.

> **Rule:** The executor never writes DM or starts an Execute while the monitor is watching a window. This one rule keeps workloads, raw Executes and auto tasks from overwriting each other's DM.

## State machine

```
            pop workload (only if monitor idle)
   IDLE ─────────────────────────────────────► LOADING
    ▲                                            │ gen fill → DM
    │   manual: reply_loaded ◄───────────────────┤
    │                                            │ auto: set start/end, Execute,
    │                                            ▼       monitor_watch(STARTER_EXECUTOR)
    │                                          RUNNING
    │                                            │ monitor_take_outcome()
    │       ┌──── DONE, more tasks, no cancel ───┤
    │       │     reply_progress → LOADING       │
    │       ▼                                    │ last task DONE / ERROR /
    └──── rm_dump + reply_workload_done ◄────────┘ TIMEOUT / cancelled
```

| State | One step does |
|---|---|
| IDLE | If the workload queue has an entry and the monitor is idle: look up the command in `cmd_table`, call the generator's **begin**. If begin fails, reply with the error and stay IDLE. Otherwise go to LOADING. |
| LOADING | If cancel is pending: finish as CANCELLED. Otherwise call **fill** for one task (up to 2048 descriptors).<br>Manual: `reply_loaded` → IDLE.<br>Auto: write start/end, set Execute, `monitor_watch(STARTER_EXECUTOR)` → RUNNING. |
| RUNNING | Ask `monitor_take_outcome()`. Nothing yet: return. DONE with tasks left and no cancel: `reply_progress` → LOADING. Anything else: finish. |
| *finish* | `rm_dump()`, `reply_workload_done(outcome, task index)`, clear cancel → IDLE. |

### Manual workloads

A manual workload is a single task. It loads at the DM index given in the request (default 0). Existing size checks reject anything that wouldn't fit, before DM is touched. After "loaded" the executor is done with it. ICPU then sends Executes as CSR writes through the handler. If ICPU queues another workload, the executor loads it as soon as the monitor is idle. ICPU is responsible for not queueing it before it has finished with the current DM contents.

### Auto workloads

Tasks run back to back. An error or timeout in task *k* stops the workload. Later tasks don't run, and the final reply names task *k*. A Stop CSR write raises the cancel flag (`executor_cancel()`), which is checked before each task. Only the last task's RM comes back.

## Generator interface (`gen.h`)

Every command has the same shape, so the executor never needs to know what a command does:

| Step | Does |
|---|---|
| **begin**(request) | Validate parameters, work out the total descriptor count, reset the cursor. Returns OK or an error code. |
| **fill**(dm_start, max) | Write up to `max` descriptors into DM from `dm_start`, advance the cursor, return how many were written. |
| **finished**() | True once every descriptor has been written. |

The cursor (next address, descriptors issued so far, and so on) lives inside the generator's own file.

## Command table (`cmd_table.c`)

```
opcode         kind     generator
WRITE          MANUAL   gen_write
READ           MANUAL   gen_read
SEQ_WRITE      AUTO     gen_seq_write
SEQ_READ       AUTO     gen_seq_read
RAND_READ      AUTO     gen_rand_read
```

The kind comes from the command type, never from the size. **Adding a command** means one new `gen_*.c` plus one row here. `executor.c` does not change.

## Public interface

```c
void executor_work(void);
void executor_cancel(void);     /* called by handler on Stop */
```
