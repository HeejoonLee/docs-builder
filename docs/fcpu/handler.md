# Handler

Owns the ICPU ↔ FCPU shared-memory protocol: the queues, the direct slot, which buffer area belongs to whom, and every message to ICPU. It does no TGTM access, copies no bulk data and makes no decisions. Folder: `handler/`.

Pages: [Overview](index.md) · [Scheduler](scheduler.md) · [Handler](handler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Flows](flows.md) · [Rules](rules.md)

## Owns

| Region | Calls |
|---|---|
| Direct queue | `take_direct`, `reply_direct` |
| Workload queue | `take_workload`, `consume_workload` |
| Workload buffer | hands out the entry's area (in the entry) and its CSR block |
| Response queue | `send_progress`, `send_loaded`, `send_final` |
| Response buffer | `response_area` |

## Direct queue

The slot is ICPU's until it writes a request. `take_direct()` returns that request. `reply_direct()` writes the result back into the same slot, which hands it back to ICPU. The next request can't arrive before the reply, so no extra back-pressure is needed.

## Workload queue and buffer

`take_workload()` accepts the head entry. It checks the entry, resolves its (address, length) into the workload-buffer area, and returns it. The entry and that area stay FCPU's until `consume_workload()`.

`consume_workload()` marks the entry consumed and acknowledges it to ICPU, which may then reuse the area. The scheduler calls it as soon as the bytes have been used: after the executor's copy into DM for Supplied, after `begin()` for Generated.

`csr_block()` returns where the CSR values at the front of the area are, when the entry's flag says they are there.

The handler never reads Descriptors itself. The executor copies them from the area straight into DM.

## Responses

All response-queue messages are built here and nowhere else.

| Call | Carries |
|---|---|
| `send_progress` | sequence ID, task k of n, task outcome |
| `send_loaded` | sequence ID |
| `send_final` | sequence ID or raw, outcome, failing task, error and interrupt bits, response count, truncated |
| `response_area` | where the executor may write Responses, and how many fit |

A failed push increments an overflow counter in the status block, so it never goes unnoticed.

## Public interface

```c
bool take_direct(direct_req *r);         void reply_direct(const direct_reply *r);
bool take_workload(workload_entry *e);   void consume_workload(void);
area csr_block(const workload_entry *e);
area response_area(void);
bool send_progress(...);  bool send_loaded(...);  bool send_final(...);
```
