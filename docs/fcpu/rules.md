# Rules & policies

The rules keep the structure intact, so break them only on purpose. Policies are current choices and can be changed in one place.

Pages: [Overview](index.md) · [Handler](handler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Flows](flows.md) · [Rules & policies](rules.md)

## Ownership rules

| Thing | Only owner |
|---|---|
| Direct queue | handler |
| Workload queue, active workload, generators | executor |
| Polling busy, timeout, window outcome | monitor |
| Building response-queue messages | `handler/reply.c` |
| RM dump buffer | `monitor/rm_dump.c` |
| Each status-block field | the module the field describes |

## Code rules

1. **No shared globals.** Module state is `static` inside its `.c` file. Other modules use only the functions in its public header.
2. **One step per call.** A `_work()` does one state's step and returns. It never waits in a loop for hardware.
3. **One watch at a time.** Only the monitor polls busy, and only for the window it's watching.
4. **No DM writes during a watch.** The executor checks `monitor_is_watching()` before loading or executing.
5. **Every Execute gets an outcome.** Each watch ends in DONE, ERROR or TIMEOUT, and its starter is told.
6. **Kind comes from the command** (`cmd_table`), never from the descriptor count.
7. **New command = new generator + one table row.** If adding a command means editing `executor.c`, the generator interface is missing something. Fix the interface.

## Policies (current choices)

| Policy | Now | Where to change |
|---|---|---|
| Access while busy | Expert mode: every CSR/memory request is performed, no guarding | `handler/csr.c`, `mem.c` |
| Work per step | One whole step (e.g. 2048 descriptors). No latency budget. | generator `max` argument in `executor.c` |
| Timeout | Fixed macro. On timeout: report, go idle. | `monitor.c` |
| RM dump | All 8192 entries, one fixed shared buffer, RM not cleared | `rm_dump.c` |
| Auto error | Stop the workload at the first failing task | `executor.c` RUNNING |
| Stop write | Also cancels the active auto workload | `handler/csr.c` |
| Progress reports | One `reply_progress` per finished auto task | `executor.c` |
| Concurrent workloads | One active. The rest wait in the workload queue. | `executor.c` IDLE |

## If latency ever matters

A long step (2048 descriptors, or a 32KB RM copy) delays CSR replies by that much. The structure already allows a fix: pass a smaller `max` to **fill** and stay in LOADING across several passes, and give `rm_dump` a cursor in the same way. Nothing else changes.
