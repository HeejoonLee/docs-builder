# FCPU firmware design

How the FCPU firmware is organised: a scheduler on top of three leaf layers, run from one cooperative loop. Terms are defined in [GLOSSARY.md](../../GLOSSARY.md). Why it is shaped this way: [ADR 0001](../adr/0001-scheduler-over-three-leaf-layers.md).

Up: [Project structure](../structure.md) · Pages: [Overview](index.md) · [Scheduler](scheduler.md) · [Handler](handler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Flows](flows.md) · [Rules](rules.md)

## Layers

```
                       scheduler
     (main-loop step, direct-request dispatch, workload loop)
          │                  │                  │
       handler            executor            monitor
   shared-memory        DM / UM,            busy, interrupt and
   protocol: queues,    control CSR,        error bits, timeout,
   slots, ownership,    workload buffer     Stop on timeout,
   messages             → DM copy           RM → response buffer copy
```

- The **scheduler** is the only layer that calls other layers.
- The **handler**, **executor** and **monitor** are leaves. They never call each other, and they return values instead of acting on what they find.
- The handler owns the shared-memory protocol: queues, the direct slot, who owns which buffer area, and every message to ICPU.
- Bulk data is copied once, directly, by the layer that owns that end of the task: the executor copies workload buffer → DM before a task, and the monitor copies RM → response buffer after it. The handler only hands over the area to use. Nothing is staged in between.
- The executor and the monitor both touch TGTM CSR. The executor does control (start/end, interrupt clear, Execute, ICPU's CSR requests). The monitor reads status and writes Stop on timeout.

| Layer | Owns | Page |
|---|---|---|
| Scheduler | Active workload, active task, cancel flag, stuck flag, command table | [scheduler.md](scheduler.md) |
| Handler | Direct queue, workload queue, response queue, ownership of workload/response buffer areas | [handler.md](handler.md) |
| Executor | DM/UM/RM access for direct requests, control CSR, `start_task()`, descriptor sources, response selection | [executor.md](executor.md) |
| Monitor | The watch: poll count, Stop on timeout, outcome, RM → response buffer copy | [monitor.md](monitor.md) |

## The main loop

```c
init();
for (;;)
    scheduler_step();
```

`scheduler_step()` serves the direct queue first, then moves the active workload or task forward by one step and returns. Nothing ever waits in a loop on hardware, so a CSR read is answered within one step even in the middle of a long task.

## One path for every workload

Supplied and Generated workloads run through the same loop. The only difference is the **descriptor source** that fills DM:

| Source | `fill()` writes into DM |
|---|---|
| Copy source | The Descriptors straight from the workload-buffer area, byte for byte |
| Generator source (`seq_write`, …) | Descriptors computed from the parameters |

A Supplied workload is a source with at most 2048 Descriptors, so it runs as exactly one task. See [scheduler.md](scheduler.md#descriptor-source).

## File layout

```
main.c                    init + loop
scheduler/
  scheduler.c             scheduler_step(): direct dispatch, workload state machine
  cmd_table.c/.h          one row per workload kind: opcode → source
handler/
  direct.c                take / reply on the direct queue
  workload.c              take / consume workload queue entries, CSR block area
  response.c              response queue messages, response buffer area
executor/
  mem.c                   DM / UM / RM read and write
  csr.c                   CSR read and write, start_task()
  select.c                select_responses()
  source.h                the descriptor source interface
  copy_source.c           workload buffer → DM
  gen/                    gen_seq_write.c  gen_seq_read.c  gen_rand_read.c …
monitor/
  monitor.c               watch, poll, timeout, Stop, outcome
  responses.c             RM → response buffer
status.c/.h               debug status block at a fixed address
```

TGTM register macros and the shared-memory layout come from shared headers. *TBD*.

## Debug status block

`status.c` keeps a small record at a fixed address that engineers can read with an ordinary direct memory read: scheduler state, current workload sequence ID and task k of n, monitor state and poll count, last outcome, stuck flag, and counters (requests served, tasks run, timeouts, rejections). Each layer writes only its own fields.
