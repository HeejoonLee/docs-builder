# Handler

Serves Direct requests and owns every message going back to ICPU. Folder: `handler/`.

Pages: [Overview](index.md) · [Handler](handler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Flows](flows.md) · [Rules & policies](rules.md)

## Responsibilities

- Only reader of the **direct queue**.
- Dispatches each direct request: CSR read, CSR write, memory read, memory write.
- Spots **Execute** and **Stop** inside CSR writes and tells the other modules.
- Holds `reply.c`, the only code that builds response-queue messages.

It never touches the workload queue and never polls busy.

## One step of `handler_work()`

```
if direct queue is empty: return
look at the request
dispatch by type        -> csr.c / mem.c
reply_direct(result)
release the direct-queue entry
```

The entry is released only **after** the reply is sent. Since the direct queue has one entry, ICPU can't send the next direct request before then. This gives natural back-pressure with no extra code.

## CSR writes: Execute and Stop

Expert mode: every CSR write is performed as asked, with no guarding. After the write, `csr.c` checks two bits:

| Bit set | Extra action |
|---|---|
| Execute | If the monitor is not already watching, call `monitor_watch(STARTER_ICPU)`. If it is already watching, do nothing extra. The current watch keeps its starter. |
| Stop | Call `executor_cancel()`, so an auto workload stops instead of moving on to its next task. |

The direct reply for an Execute write is just the write acknowledgement. The window result comes later from the monitor as a separate "window done" message.

## Memory reads and writes

`mem.c` reads and writes DM, UM and RM at any time, including while TGTM is busy. Engineers are trusted to know what they are doing (see [policies](rules.md#policies-current-choices)).

## `reply.c`: all messages to ICPU

| Call | Sent by | When |
|---|---|---|
| `reply_direct` | handler | after every direct request |
| `reply_loaded` | executor | manual workload loaded into DM (or rejected) |
| `reply_progress` | executor | auto workload finished task *k* of *n* |
| `reply_workload_done` | executor | auto workload ended (done / error / timeout / cancelled), RM dumped |
| `reply_window_done` | monitor | an ICPU-started Execute ended, RM dumped |

Every call fills the message in one place, using the ICPU-defined queue API, and returns success or failure. Workload replies carry the workload's seq ID. A full response queue is not expected (it is sized like RM), but a failed push still increments an overflow counter in the status block, so it never goes unnoticed.

`reply.h` is the one header the executor and monitor include from `handler/`.

## Public interface

```c
void handler_work(void);
/* reply.h */
bool reply_direct(...);  bool reply_loaded(...);  bool reply_progress(...);
bool reply_workload_done(...);  bool reply_window_done(...);
```
