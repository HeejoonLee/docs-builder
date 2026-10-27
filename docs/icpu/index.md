# ICPU

The ICPU side of the ICPU ↔ FCPU protocol: what ICPU writes, what it waits for, and which rules it must keep. CLI parsing and display are out of scope here.

Up: [Project structure](../structure.md) · FCPU side: [fcpu/](../fcpu/index.md)

## Direct requests

For CSR read/write and DM/UM/RM read/write.

1. Wait until the direct queue slot is free.
2. Write the request into the slot.
3. Wait for FCPU's reply in the same slot. FCPU serves it even while a task is running.

| Request | While TGTM is busy |
|---|---|
| CSR read | Served |
| CSR write | Served, except a write that sets Execute (see below) |
| DM / UM / RM read or write | Rejected with "busy" |

### Raw Execute

A CSR write that sets Execute is a **raw Execute** and starts a task. It is rejected if a task is running, a workload is active, or TGTM is stuck. If accepted, the direct reply only acknowledges the write. The task's outcome arrives later on the response queue, marked "raw" instead of carrying a workload sequence ID.

Set start index and end index first, with ordinary CSR writes.

### Stop

A CSR write that sets Stop halts TGTM and cancels the active workload. The workload reports as cancelled.

## Workloads

1. Write the workload's data somewhere in the workload buffer:
   - **Supplied**: optional CSR block, then the Descriptors (up to 2048).
   - **Generated**: optional CSR block, then the generator's parameters.
2. Push an entry on the workload queue: kind, sequence ID, flags, optional response range, address and length.
3. Don't touch that area of the workload buffer until FCPU releases the entry.

| Flag | Effect |
|---|---|
| response wanted | Off: no progress messages and no success reply. Errors and timeouts are always reported. |
| load only | FCPU fills DM but doesn't Execute. Start tasks later with raw Executes. Only allowed if the workload fits in one task. |
| CSR block present | The data starts with CSR values that FCPU writes before Execute. |
| response range | Which RM entries to return. If absent, FCPU works it out from the task's Descriptors. |

## Responses

Read from the response queue:

| Message | When | Carries |
|---|---|---|
| **Progress** | After each non-final task of a multi-task workload | sequence ID, task k of n, task outcome. No Responses. |
| **Loaded** | A load-only workload is in DM | sequence ID |
| **Final outcome** | The workload ends (done, error, timeout, cancelled), or a raw task ends | sequence ID or "raw", outcome, failing task index, error and interrupt bits, response count, truncated flag |

On a done or error outcome, the response buffer holds the selected Responses (none on timeout or cancel). Read them before starting anything else that can finish a task.
