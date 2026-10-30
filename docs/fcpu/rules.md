# Rules & policies

The rules keep the structure intact, so break them only on purpose. Policies are current choices that can each be changed in one place.

Pages: [Overview](index.md) · [Scheduler](scheduler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Structs](structs.md) · [Flows](flows.md) · [Rules](rules.md)

## Structure rules

1. **Calls go down the tree.** Scheduler → executor → monitor → `tgtm/`. The monitor returns an outcome, and the executor returns a step result. Nothing calls upward.
2. **The scheduler decides when, the executor decides what, the monitor watches one task.** The monitor never decides what follows a task. The executor never touches the queues, the Mailbox words or Ready.
3. **Mailbox and queue are different paths.** They enter the executor by different entry points, even when they end in the same CSR access. Only `tgtm/` is shared.
4. **No staging.** The executor reads the Request payload area in place; the monitor writes RM into the Response region in place. Only the request header and areas are copied into FCPU state.
5. **New generator = one `gen/` file + one `api_set.c` row.**

## Code rules

1. **No shared globals.** All state lives in the `struct scheduler` tree in `main.c`, passed by pointer.
2. **Never wait on hardware.** Each step returns. The Mailbox is served between atomic steps.
3. **Queued request handling is atomic.** From taking the entry until the task's Execute (or until the request finishes), there's no Mailbox in between. The same goes for each task's completion and each Generated task's preparation.
4. **Every Execute is a task, every task belongs to a workload and is watched.** Execute is set only in `start_task()`, which clears interrupts first. `monitor_watch()` follows immediately.
5. **No memory access while busy.** DM, UM and RM are touched only when no task is running. CSR is always accessible.
6. **One workload at a time.** No Queued request is admitted, and a Mailbox Execute is rejected, while a workload is active.
7. **Ready is checked before any shared-memory access.**
8. **Never drop a response.** One pending response. A step that produces a response or writes the Response region waits until the region is free.

## Policies (current choices)

| Policy | Now | Where to change |
|---|---|---|
| Timeout | `POLL_LIMIT` polls, then Stop. `STOP_POLL_LIMIT` more, then STUCK | `monitor.c` |
| Stuck | No Queued requests, no Mailbox memory access or Execute. Cleared by a Mailbox CSR write after which busy reads low | `executor/mailbox_ops.c` |
| Out-of-order sequence | Consume, error response, expected number back to 0 | `scheduler.c` |
| Response region | One response at a time; the next one waits until ICPU has read it | `scheduler/response.c` |
| RM on a Mailbox Execute | None. Outcome only | `executor.c` TASK_ENDED |
| RM on timeout / stuck / cancel | None | `executor.c` TASK_ENDED |
| RM in a Generated workload | Final (or failing) task's only. Progress responses carry none | `executor.c` TASK_ENDED |
| Response selection too big | Copy what fits, set truncated | `rm_copy.c` |
| Response flag off | Suppresses success responses. Errors, timeouts and cancels always sent | `executor.c` |
| Error in a Generated workload | Stop at the first task that doesn't end done | `executor.c` TASK_ENDED |
| Stop write | Also cancels the active workload | `executor/mailbox_ops.c` |
| Work per atomic step | A whole DIRECT_DM copy or RM copy. The Mailbox waits at most that long | (rule 3) |
