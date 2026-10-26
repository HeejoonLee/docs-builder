# FCPU firmware design

How the FCPU firmware is organised: three cooperative modules in one loop, each owning its own state and its own files. Terms are defined in [GLOSSARY.md](../../GLOSSARY.md).

Pages: [Overview](index.md) · [Handler](handler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Flows](flows.md) · [Rules & policies](rules.md)

## What FCPU does

FCPU sits between ICPU and TGTM. It receives requests from ICPU through shared-memory queues, drives TGTM through its memories (DM, RM, UM) and CSR, and reports results back on the response queue.

Requests come in two kinds, on two queues:

| Kind | Queue | Examples | Served by |
|---|---|---|---|
| **Direct request** | Direct queue (1 entry) | CSR read/write (including Execute and Stop), DM/UM/RM read/write | Handler, replies right away |
| **Manual workload** | Workload queue | `write`, `read` | Executor: generate one task, load it, reply "loaded" |
| **Auto workload** | Workload queue | `seq_write`, `seq_read`, `rand_read` | Executor: generate and execute every task, then reply |

## The main loop

```c
init();
for (;;) {
    handler_work();    /* direct queue  */
    executor_work();   /* workload queue */
    monitor_work();    /* the running TGTM window */
}
```

Each `_work()` does **one step** and returns, like a thread that yields. A step can be big (for example, generating 2048 descriptors). For now there is no latency budget, see [policies](rules.md#policies-current-choices).

Because the monitor only *checks* busy once per pass and returns, the handler keeps serving CSR requests while traffic is running. That is the main reason for this structure.

## Modules

- **[Handler](handler.md)**: Direct requests, Execute/Stop detection, all replies to ICPU
- **[Executor](executor.md)**: Workload queue, workload state machine, descriptor generators
- **[Monitor](monitor.md)**: Watches one Execute until it ends: busy, timeout, outcome, RM dump

## File layout

```
main.c                 init + the 3-call loop
cmd_table.c/.h         one row per workload command: opcode, kind, generator
status.c/.h            debug status block at a fixed address
handler/
  handler.c            handler_work(): pop direct queue, dispatch
  csr.c                CSR read/write, Execute/Stop detection
  mem.c                DM/UM/RM read/write
  reply.c/.h           every message FCPU sends to ICPU
executor/
  executor.c           executor_work(): workload queue, state machine
  gen.h                the generator interface
  gen_write.c  gen_read.c  gen_seq_write.c  gen_seq_read.c  gen_rand_read.c
monitor/
  monitor.c            monitor_work(): watch, timeout, outcome
  rm_dump.c            copy RM to the shared buffer
```

TGTM register/address macros and the shared-queue API are defined elsewhere (TGTM headers, ICPU side) and are only *used* here.

## Who works where

Each folder is one module with one public header. Modules share nothing but function calls ([ownership rules](rules.md#ownership-rules)), so two people can work in different folders without stepping on each other. The most common change, adding a workload command, touches only one new `executor/gen_*.c` file and one row in `cmd_table.c`.

## Debug status block

`status.c` keeps a small record at a fixed memory address that engineers can read with an ordinary direct memory read: executor state, monitor state, current workload seq ID and task index, window starter, last outcome, last error, and counters (requests served, windows run, timeouts, reply-queue overflows). Every module writes only its own fields. If the board hangs, this shows where each module is stuck, without a debugger.
