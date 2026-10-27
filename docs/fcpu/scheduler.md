# Scheduler

The top layer. It owns the main-loop step and is the only code that calls the handler, executor and monitor. Folder: `scheduler/`.

Pages: [Overview](index.md) · [Scheduler](scheduler.md) · [Handler](handler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Flows](flows.md) · [Rules](rules.md)

## One step

```
scheduler_step():
    serve_direct()        # at most one direct request
    advance()             # one step of the active task / workload
```

## Serving a direct request

```
req = handler.take_direct()          # nothing → return
check req against the busy rules     # rejected → handler.reply_direct(BUSY)
perform it through the executor
handler.reply_direct(result)
```

| Request | Rejected when | Extra action |
|---|---|---|
| CSR read | never | |
| CSR write, sets Execute (raw Execute) | a task is running, a workload is active, or TGTM is stuck | Starts a raw task (below) |
| CSR write, sets Stop | never | Raise the cancel flag on the active workload |
| other CSR write | never | If TGTM is stuck and busy now reads low, clear the stuck flag |
| DM / UM / RM read or write | a task is running, or TGTM is stuck | |

"A task is running" means the monitor is watching. Every Execute is watched, so that's the same as TGTM being busy.

### Raw task

```
start, end = executor.csr_read(start index, end index)
selection  = executor.select_responses(start, end)    # DM read, TGTM idle
executor.start_task_raw(csr value)                    # clear interrupts, then the write
monitor.watch()
active task = { raw, selection }
```

When the watch ends: copy Responses (done or error), then `handler.send_final(raw, outcome)`.

## Workload state machine

```
          peek entry (no workload, not watching, not stuck)
   IDLE ─────────────────────────────────────────────► BEGIN
    ▲                                                    │ source.begin(): total, n tasks
    │◄── error: send_final(error), release ──────────────┤
    │                                                    ▼
    │                                                  LOAD ◄─────────────┐
    │                                                    │ executor.load()│
    │                                                    │ until task full│
    │    load only: send_loaded ─────────────────────────┤                │
    │                                                    ▼                │
    │                                                  START              │
    │                                                    │ CSR block,     │
    │                                                    │ selection,     │
    │                                                    │ start_task(),  │
    │                                                    │ monitor.watch()│
    │                                                    ▼                │
    │                                                  WATCH              │
    │                                                    │ monitor.poll() │
    │          more tasks, task done, not cancelled ─────┼─ send_progress ┘
    │                                                    ▼
    └──────────────────── FINISH: copy Responses (done/error), send_final
```

| State | One step does |
|---|---|
| IDLE | If no workload, no watch and not stuck: `handler.take_workload()`. Found one: look up its kind in `cmd_table`, go to BEGIN. |
| BEGIN | `source.begin(entry)`: validate, return the total Descriptor count. Work out the number of tasks (2048 per task). Load only with more than one task, or a Supplied total over 2048: reject. For a Generated workload the parameters are now read, so `handler.consume_workload()`. |
| LOAD | `executor.load(source, 0, task size)`. The source writes this task's Descriptors into DM. A Supplied workload is now copied, so `handler.consume_workload()`. Load only: `send_loaded` → IDLE. |
| START | If cancelled: FINISH (cancelled). Otherwise: if present (first task only), `executor.apply_csr(handler.csr_block(entry))` writes the CSR block straight from the workload buffer; work out the response selection (ICPU's range, or `executor.select_responses()`), `executor.start_task(0, count-1)`, `monitor.watch()`. |
| WATCH | `monitor.poll()`. Still running: return. Task done, more tasks, not cancelled: `send_progress` → LOAD. Otherwise → FINISH. |
| FINISH | If the final outcome is done or error: `monitor.copy_responses(selection, handler.response_area())`. `send_final`. Clear workload and cancel flag → IDLE. |

"Response wanted = off" turns `send_progress`, `send_loaded` and a done `send_final` into no-ops. Error, timeout and cancel are always sent.

## Descriptor source

The [descriptor source](executor.md#descriptor-sources) interface is `begin()` + `fill()`. The scheduler and the executor never ask which kind of source they have. `cmd_table` maps each workload kind to its source:

```
kind          source
SUPPLIED      copy_source        (executor/)
SEQ_WRITE     gen_seq_write      (executor/gen/)
SEQ_READ      gen_seq_read
RAND_READ     gen_rand_read
```

**Adding a generator** means one new `executor/gen/gen_*.c` and one row here. If it means touching `scheduler.c`, the interface is missing something, so fix the interface.

## No data passes through the scheduler

The scheduler only moves *areas* (where to read, where to write) from the handler to the executor and monitor. Every byte is copied once: workload buffer → DM by the executor, RM → response buffer by the monitor.

## Public interface

```c
void scheduler_step(void);
```
