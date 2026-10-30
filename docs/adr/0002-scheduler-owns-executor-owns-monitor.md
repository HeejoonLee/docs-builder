# Scheduler owns the executor, the executor owns the monitor

FCPU is a tree, not a scheduler over three independent leaves. The scheduler owns the ICPU ↔ FCPU transport (Ready, Mailbox, Request queue, Response queue) and the executor. The executor owns the active request, its workload, the current task and the monitor. The monitor tells the executor how a task ended. The executor decides what happens next and builds the response, and the scheduler delivers it. The scheduler decides *when* things run: Mailbox requests between atomic steps, Queued requests one at a time in queue order. The executor decides *what* they do. Only the low-level TGTM access module is shared by the two paths. This replaces ADR 0001. There, the scheduler held the whole workload loop and a separate handler held the protocol, so the scheduler had to know about tasks, outcomes and response selection. Each concept was split across three files.

Bulk data still never passes through FCPU-owned buffers. The executor copies from the Request payload area straight into DM/UM before consuming the entry. The monitor copies RM straight into the Response region. The request payload (up to 0x8000) and RM (8KB) are too large to stage, and the shared-memory layout is fixed by the existing ICPU interface.

## Considered Options

- **Keep ADR 0001's three leaves under the scheduler**: rejected because the "decides what's next after a task" logic ended up in the scheduler, next to transport code it has no reason to share with.
- **Separate mailbox service beside the executor**: rejected because a Mailbox Execute creates a workload, and Mailbox memory access depends on whether a task is running. Both need executor state, so the Mailbox enters through the executor (by its own entry point) rather than beside it.
- **Copy requests and RM results into FCPU-owned structs** (as in the reference sketch): rejected because of size. Only the request header and the payload area are copied.
