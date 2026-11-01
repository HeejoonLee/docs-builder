# ICPU

The ICPU side of the ICPU ↔ FCPU protocol: what ICPU writes, what it waits for, and which rules it must keep. CLI parsing and display are out of scope here. Layout: [structure.md](../structure.md#shared-memory-between-icpu-and-fcpu).

Up: [Project structure](../structure.md) · FCPU side: [design/fcpu-arc42.md](../design/fcpu-arc42.md)

## Ready

ICPU sets Ready. FCPU does no shared-memory work while it's clear.

## Mailbox requests

For TGTM memory read/write (DM, UM, RM) and CSR read/write. Served immediately, even while a task is running.

1. Wait for the done bit in `reserved[0]`.
2. Write the request with done = 0 (and the value in `reserved[2]` for a write).
3. Wait for done = 1, then read `reserved[1]` (Request status, or Status/Err type before and after) and `reserved[2]` (value).

| Request | Rejected (`busy`) while |
|---|---|
| CSR read, CSR write | never, except below |
| CSR write to Execution bit 0 (**Mailbox Execute**) | a workload is active, or TGTM is stuck |
| CSR write to 0x00–0x28 (except STOP), Interrupt enable or Interrupt clear | a workload is active |
| DM / UM / RM read or write | a task is running, TGTM or that memory is busy, or TGTM is stuck |

### Mailbox Execute

A debug path. Set Start index and End index with ordinary Mailbox CSR writes, then write 1 to Execution bit 0. FCPU runs the Descriptors already in DM as a single-task workload. The Mailbox reply only says "accepted". The outcome arrives later on the Response queue, marked mailbox-origin, with no RM entries. Read RM with Mailbox memory reads if you want them.

### Stop

A Mailbox CSR write to STOP halts TGTM and cancels the active workload: no further tasks run. If the current task was still running, the final response says `aborted`. If it had already ended, its outcome (and RM) is reported as it is, marked cancelled. RESUME (0x10): *TBD*.

## Queued requests

1. Write the request data into the Request payload: the 8B header, then the data for its type.
2. Push an entry `{start_addr, length}` on the Request queue.
3. Don't touch that area until FCPU consumes the entry (read_count moves past it).

| Data type | Does | Creates a workload |
|---|---|---|
| DIRECT_DM | CSR config (Has config), Descriptors → DM from the start index, UM data → UM (Has UM) | no |
| CONTROL | One control operation (CSR access or a fixed set of them) | only EXECUTE: one task over the Start index / End index currently in CSR |
| API_SET | FCPU generates the Descriptors and runs them | yes, one or more tasks |

FCPU takes no Queued request while a workload is active, so a DIRECT_DM queued after an EXECUTE waits for that task to finish.

### Sequence numbers

Every Queued request is in a Sequence. The first sets FIRST and has seq 0, the rest count up 1, 2, … and the last sets LAST. A request on its own sets both. A request that breaks this (out of order, no FIRST with no Sequence open, FIRST while one is open) is consumed without being run and gets a `sequence` response. The Sequence is then closed, so the next request must set FIRST.

### Flags

| Bit | Flag | Effect |
|---|---|---|
| 0 | FIRST | Opens a Sequence (seq 0) |
| 1 | LAST | Closes the Sequence |
| 2 | Has config (DIRECT_DM) | The data starts with CSR config values (registers and size *TBD*) |
| 3 | Has UM (DIRECT_DM) | The data ends with UM data |
| 4 | Need response | Off: no command, progress or success responses. Errors, timeouts and cancels are always sent |
| 5 | RM by descriptor (EXECUTE, API_SET) | The final response carries the RM entries of the Descriptors that ran |

Setting a flag on a data type it doesn't apply to gets `invalid`. So does RM by descriptor without Need response.

## Responses

Each Response queue entry points at the Response region: a 16B response, then any RM entries. FCPU writes the next response only after you have read the current one (read_count caught up), so read each one promptly.

| Response | When | RM entries |
|---|---|---|
| **Command** | A Queued request was handled (for EXECUTE / API_SET: accepted) | none |
| **Progress** | After each non-final task of a Generated workload | none |
| **Final** | A workload ends: OK, execution, timeout (stuck marked), aborted. On execution and timeout it also carries Err type and Current descriptor index | With RM by descriptor, for a queued workload that ended OK or execution |
| **Error** | `invalid`, `sequence`, `length`, `csr`, `unsupported`, `busy` | none |

Every response and Mailbox reply carries a Request status: [structure.md](../structure.md#request-status).
