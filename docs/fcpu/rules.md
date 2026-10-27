# Rules & policies

The rules keep the structure intact, so break them only on purpose. Policies are current choices that can each be changed in one place.

Pages: [Overview](index.md) · [Scheduler](scheduler.md) · [Handler](handler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Flows](flows.md) · [Rules](rules.md)

## Layer rules

1. **Only the scheduler calls across layers.** The handler, executor and monitor never call each other.
2. **The handler owns the shared-memory protocol; the executor and monitor do the copies.** Queues, the direct slot, buffer ownership and messages belong to the handler. Bulk data is copied once, directly, into or out of the area the handler hands over: workload buffer → DM by the executor, RM → response buffer by the monitor. No data passes through the scheduler and nothing is staged.
3. **Leaves return, the scheduler decides.** The monitor returns an outcome and copies RM when the scheduler asks. It doesn't send messages or start anything.
4. **One path for every workload.** The scheduler and executor never branch on Supplied vs. Generated. The difference lives in the descriptor source.
5. **New generator = one source file + one `cmd_table` row.**

## Code rules

1. **No shared globals.** Layer state is `static` in its `.c` file. Other layers use only the public header.
2. **One step per call.** Nothing waits in a loop on hardware. The direct queue is served on every step.
3. **Every Execute is a task, and every task is watched.** Execute happens only in `start_task()` / `start_task_raw()`, both of which clear interrupts first. The scheduler calls `monitor.watch()` right after.
4. **No memory access while busy.** DM, UM and RM are only touched when no task is running. CSR is always accessible.
5. **One task at a time.** A raw Execute is rejected while a task is running, a workload is active, or TGTM is stuck.
6. **Response selection happens before Execute**, while DM can still be read.

## Policies (current choices)

| Policy | Now | Where to change |
|---|---|---|
| Timeout | `POLL_LIMIT` polls, then Stop. `STOP_POLL_LIMIT` more, then STUCK | `monitor.c` |
| Stuck recovery | Cleared by a later CSR write after which busy reads low | `scheduler.c` |
| Responses in a multi-task workload | Only the final task's (or the failing task's) | `scheduler.c` FINISH |
| Responses on timeout / cancel | None | `scheduler.c` FINISH |
| Response selection too big | Copy what fits, set truncated | `scheduler.c` |
| Progress | One message after each non-final task, no Responses | `scheduler.c` WATCH |
| Response wanted = off | Suppresses progress, loaded, and done. Errors are always sent | `handler/response.c` |
| Error mid-workload | Stop at the first failing task | `scheduler.c` WATCH |
| Stop write | Also cancels the active workload | `scheduler.c` |
| Concurrent workloads | One active. The rest wait in the workload queue | `scheduler.c` IDLE |
| Work per step | A whole DM load or RM copy in one step. Direct requests wait at most that long. To shorten it, pass a smaller `max` to `fill` and stay in LOAD for several steps. | `scheduler.c` |
