# FCPU firmware design

How the FCPU firmware is organised: a scheduler that owns an executor, which owns a monitor, all run from one cooperative loop. Terms are defined in [GLOSSARY.md](../../GLOSSARY.md). Why it is shaped this way: [ADR 0002](../adr/0002-scheduler-owns-executor-owns-monitor.md).

Up: [Project structure](../structure.md) · Pages: [Overview](index.md) · [Scheduler](scheduler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Structs](structs.md) · [Flows](flows.md) · [Rules](rules.md)

## Ownership

```
scheduler                         decides WHEN
  ├─ Ready check, Mailbox, Request queue, Response queue   (transport)
  ├─ expected sequence number
  ├─ pending response (queue side only)
  └─ executor                     decides WHAT
       ├─ copy of the active Queued request (header + payload area)
       ├─ workload  (tasks total / done, origin, cancelled)
       ├─ current task  (DM range, Response selection)
       ├─ stuck flag
       └─ monitor                 watches ONE task
            └─ watch state, poll count, bits seen

tgtm/   low-level DM / UM / RM / CSR access, shared by everyone above
```

| Module | Owns | Does | Page |
|---|---|---|---|
| Scheduler | Transport, expected sequence number, pending response, the executor | Checks Ready, serves the Mailbox, admits Queued requests in order, delivers responses | [scheduler.md](scheduler.md) |
| Executor | Active request copy, workload, current task, stuck flag, the monitor | Runs Mailbox and Queued requests, starts tasks, decides what follows each task, builds responses | [executor.md](executor.md) |
| Monitor | The watch of one task | Polls busy, times out and Stops, returns the task outcome, copies RM into the Response region | [monitor.md](monitor.md) |
| TGTM module | Nothing | Reads and writes DM, UM, RM and CSR | [../tgtm/](../tgtm/index.md) |

- Calls go **down** the tree only. The monitor returns an outcome to the executor; the executor returns a step result to the scheduler.
- **Only the scheduler touches the queues and the Mailbox words.** The executor reads the Request payload area it was handed, and the monitor writes RM into the Response region area it was handed. Nothing is staged in FCPU memory.
- Mailbox and Queued requests enter the executor by **different entry points**. Even when they end in the same CSR write, the paths differ. Only the TGTM module is shared.

## The main loop

```c
int main(void)
{
    static struct scheduler s;
    init();                 /* platform, TGTM, status block */
    scheduler_init(&s);
    for (;;)
        scheduler_step(&s);
}
```

`scheduler_step()` never waits on hardware. Each call is one or more **atomic steps**, and the Mailbox is only served between them:

| Atomic step | Contains |
|---|---|
| Mailbox request | Peek, run, reply, set done bit |
| Queued request handling | Header and sequence check, the request's work (copies, CSR ops, task start), ConsumeRequest, command response |
| Task poll | One read of status |
| Task completion | RM copy, progress or final response |
| Next task (Generated workload) | Generate this task's Descriptors into DM, Execute |

So a Mailbox CSR read is answered within one atomic step, even in the middle of a long task.

## File layout

```
main.c
scheduler/
  scheduler.c       scheduler_step(), Ready, admission, sequence check, pending response
  mailbox.c         peek / complete the Mailbox words (memory and CSR forms)
  queue.c           Request queue peek / consume, header read
  response.c        Response region free check, 16B write, Response queue post
executor/
  executor.c        entry points, workload state machine, start_task()
  mailbox_ops.c     Mailbox memory and CSR operations, Mailbox Execute, Stop
  direct_dm.c       DIRECT_DM: config, Descriptors → DM, UM data → UM
  control.c         CONTROL operations (switch), EXECUTE
  api_set.c         API_SET: generator lookup, task split
  gen/              gen_seq_write.c  gen_seq_read.c  gen_rand_read.c …
monitor/
  monitor.c         watch, poll, timeout, Stop, outcome
  rm_copy.c         RM → Response region
tgtm/
  tgtm.c            region and CSR access
status.c/.h         debug status block
```

TGTM register macros and the shared-memory layout come from shared headers. *TBD*.

## Debug status block

`status.c` keeps a small record at a fixed FCPU address with a fixed layout: scheduler expected sequence number and pending flag, executor state, workload origin, sequence number and task k of n, monitor state and poll count, last task outcome, stuck flag, and counters (Mailbox requests, Queued requests, tasks, timeouts, rejections, sequence errors). Each module writes only its own fields.

ICPU can't read FCPU memory today. The layout is fixed so that a later Mailbox "read status" request, or moving the block into shared memory, is a small change.
