# ICPU

The ICPU side of the ICPU ↔ FCPU protocol: what ICPU writes, what it waits for, and which rules it must keep. CLI parsing and display are out of scope here. Layout: [structure.md](../structure.md#shared-memory-between-icpu-and-fcpu).

Up: [Project structure](../structure.md) · FCPU side: [fcpu/](../fcpu/index.md)

## Ready

ICPU sets Ready. FCPU does no shared-memory work while it's clear.

## Mailbox requests

For TGTM memory read/write (DM, UM, RM) and CSR read/write. Served immediately, even while a task is running.

1. Wait for the done bit in `reserved[0]`.
2. Write the request with done = 0 (and the value in `reserved[2]` for a write).
3. Wait for done = 1, then read `reserved[1]` (status, or STATUS/ERROR) and `reserved[2]` (value).

| Request | Rejected while |
|---|---|
| CSR read, CSR write | never, except below |
| CSR write that sets execute (**Mailbox Execute**) | a workload is active, or TGTM is stuck |
| DM / UM / RM read or write | a task is running, or TGTM is stuck |

### Mailbox Execute

A debug path. Set start and end index with ordinary Mailbox CSR writes, then set execute. FCPU runs the Descriptors already in DM as a single-task workload. The Mailbox reply only says "accepted". The outcome arrives later on the Response queue, marked mailbox-origin, with no RM entries. Read RM with Mailbox memory reads if you want them.

### Stop

A Mailbox CSR write that sets stop halts TGTM and cancels the active workload. Its final response says cancelled.

## Queued requests

1. Write the request data into the Request payload: the 8B header, then the data for its type.
2. Push an entry `{start_addr, length}` on the Request queue.
3. Don't touch that area until FCPU consumes the entry (read_count moves past it).

| Data type | Does | Creates a workload |
|---|---|---|
| DIRECT_DM | Optional CSR config, Descriptors → DM from the start index, optional UM data → UM | no |
| CONTROL | One control operation (CSR access or a fixed set of them) | only EXECUTE: one task |
| API_SET | FCPU generates the Descriptors and runs them | yes, one or more tasks |

FCPU takes no Queued request while a workload is active, so a DIRECT_DM queued after an EXECUTE waits for that task to finish.

### Sequence numbers

Requests in a sequence are numbered 0, 1, 2, … and the last one sets END_SEQUENCE. A request out of order is consumed without being run, and gets an error response. The next request must then start again at 0.

### Flags

| Flag | Effect |
|---|---|
| response wanted | Off: no command, progress or success responses. Errors, timeouts and cancels are always sent. |
| config present (DIRECT_DM) | The data starts with 16B of CSR values. |
| END_SEQUENCE | Closes the sequence. |

## Responses

Each Response queue entry points at the Response region: a 16B response, then any RM entries. FCPU writes the next response only after you have read the current one (read_count caught up), so read each one promptly.

| Response | When | RM entries |
|---|---|---|
| **Command** | A Queued request was handled (for EXECUTE / API_SET: accepted) | none |
| **Progress** | After each non-final task of a Generated workload | none |
| **Final** | A workload ends: done, error, timeout, stuck, cancelled | Response selection, for a queued workload that ended done or error |
| **Error** | Invalid header or out-of-order sequence number | none |
