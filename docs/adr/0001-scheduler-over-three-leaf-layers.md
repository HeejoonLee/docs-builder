---
status: superseded by ADR-0002
---

# Scheduler over three leaf layers, one descriptor-source path

FCPU is split into a scheduler that alone calls the handler (the shared-memory protocol: queues, slots, buffer ownership, messages), the executor (TGTM memories and control CSR, plus the workload buffer → DM copy) and the monitor (status polling, timeout, Stop, plus the RM → response buffer copy). Those three are leaves that never call each other. This keeps each piece of hardware and each protocol structure behind exactly one owner, and lets the direct queue be served on every loop step even mid-task. Bulk data is copied once, directly between TGTM and the buffer area the handler hands over. It never passes through the scheduler.

Supplied and Generated workloads run through the same scheduler loop. They differ only in the descriptor source the executor pulls from: a copy source (workload buffer → DM) or a generator. Two separate paths would drift apart, and every new rule (interrupt clearing, response selection, progress) would have to be added twice.

## Considered Options

- **Handler on top, calling executor and monitor**: rejected because the handler would then hold the workload loop as well as shared memory, so it would no longer be only the shared-memory protocol.
- **Executor owns the workload loop** (the previous design): rejected because the executor would need shared-memory access for replies and payload reads.
