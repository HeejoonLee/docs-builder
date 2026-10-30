# Keystone Glossary

## Hardware

**TGTM** — Traffic Generator / Traffic Monitor. The hardware block that issues AXI traffic described by Descriptors and records the responses.

**DM (Descriptor Memory)** — 32KB TGTM memory holding 2048 Descriptors of 16B each.

**RM (Response Memory)** — 32KB TGTM memory holding 8192 Response entries of 4B each. Indexed by the lower bits of the AXI ID; entries can be overwritten within a single Window.

**UM (User Memory)** — 4KB TGTM memory holding user-specified write data for AXI write commands.

**CSR** — The TGTM register set (32-bit registers): control (start index, end index, execute, stop) and status (busy, interrupt, timer). Always accessible, even while TGTM is busy. DM, UM and RM are not accessed while TGTM is busy.

**Descriptor** — One 16B DM entry describing AXI traffic: AXI command fields, plus nReq (number of commands generated), addr_inc, pattern, and compare.

**Response** — One 4B RM entry: part of an AXI response, including 2B of read data, the upper AXI ID bits, and the compare result (cp).

## Firmware

**ICPU** — The CPU facing the user. Parses CLI input, sends requests to FCPU, and reports responses back to the user.

**FCPU** — The CPU that controls TGTM. Moves requests and responses between ICPU and TGTM, generates Descriptors, and watches TGTM for completion and errors.

**Mailbox request** — An ICPU request in the Mailbox that FCPU serves immediately, even while a task is running. It is a TGTM memory read/write (DM, UM or RM, addressed by index and word) or a CSR read/write. A DM/UM/RM access is rejected while a task is running.
_Avoid_: direct request

**Queued request** — An ICPU request in the Request queue. FCPU serves queued requests one at a time, in queue order, and takes none while a workload is active. Its data type is DIRECT_DM, CONTROL or API_SET.

**DIRECT_DM request** — A Queued request that loads TGTM without starting it. It carries optional CSR values, the Descriptors to copy into DM from a given start index, and optional UM data.
_Avoid_: supplied workload

**CONTROL request** — A Queued request that runs one control operation in queue order: a CSR access, or a fixed set of CSR accesses. The EXECUTE operation starts a workload.

**API_SET request** — A Queued request that names a generator and its parameters. FCPU builds the Descriptors itself and runs them as a Generated workload. Not in production yet.

**Sequence** — An ordered run of Queued requests whose sequence numbers start at 0 and go up by 1. The request flagged END_SEQUENCE closes it. A request out of order is an error.

**TGTM workload** — One or more TGTM tasks that FCPU runs and tracks as one unit. A CONTROL EXECUTE or a Mailbox Execute creates a single-task workload over the Descriptors already in DM. An API_SET request creates a Generated workload.
_Avoid_: job

**Generated workload** — A TGTM workload whose Descriptors FCPU builds from an API_SET request's parameters, possibly as several TGTM tasks. Commands: `seq_write`, `seq_read`, `rand_read`.
_Avoid_: auto workload, descriptor generator request

**Mailbox Execute** — A Mailbox CSR write that sets the execute bit. It is rejected while a workload is active. Otherwise it creates a single-task workload over whatever is already in DM (if DM is empty, TGTM reports the error), and that task is watched like any other. It is a debug path: no RM entries are copied for it; ICPU reads RM afterwards with Mailbox requests if it wants them.
_Avoid_: raw execute

**Response selection** — Which RM entries are copied to the Response region after a task ends. A CONTROL EXECUTE names them in its payload. If it is larger than the Response region, only what fits is copied and the outcome is marked truncated.

**TGTM task** — One run of TGTM: the Descriptors from start index to end index that TGTM executes for one Execute. Every Execute starts a task, and every task belongs to a workload.
_Avoid_: window, run, chunk

**Execute** — Setting the CSR execute bit, which starts a TGTM task over the start index and end index currently in CSR. All interrupt status bits are cleared before every Execute. Every task is watched until TGTM is no longer busy, and its outcome is reported.

**Stop** — Setting the CSR stop bit, which forcibly halts TGTM. FCPU sets it when a task times out; ICPU may set it with a CSR write, which also cancels the active workload.

**TGTM stuck** — The state after a forced Stop fails to bring busy down. FCPU refuses new tasks until a CSR write recovers TGTM.

**Task outcome** — How a watched task ended: done, error, timeout, or stuck. Timeout means busy was still set after a fixed number of polls; FCPU then forces TGTM to stop with the Stop bit. Interrupt status bits seen during the task are recorded in the outcome but do not end the task.
_Avoid_: window outcome

## ICPU ↔ FCPU channels

These are fixed by the shared-memory interface between ICPU and FCPU.

**Ready** — A shared-memory word that ICPU sets. FCPU checks it on every access to shared memory. Under normal conditions it is always set.

**Mailbox** — Three shared-memory words that carry one Mailbox request from ICPU to FCPU. FCPU writes the reply back into the same words, and a done bit hands the Mailbox back to ICPU. It never waits behind queued work.
_Avoid_: direct queue

**Request queue** — The shared-memory queue (32 entries) carrying Queued requests from ICPU to FCPU. Each entry holds only the address and length of the request's data in the Request payload. FCPU consumes an entry once it no longer needs that data.
_Avoid_: workload queue

**Request payload** — The shared-memory region (0x8010 bytes) that Request queue entries point into. Each request's data starts with a header (flags, data type, sequence number, descriptor count, descriptor start index).
_Avoid_: workload buffer

**Response queue** — The shared-memory queue (32 entries) carrying FCPU → ICPU responses. Each entry holds the address and length of a response in the Response region. Mailbox replies do not use it.

**Response region** — The shared-memory region (0x2010 bytes) that Response queue entries point into. It holds one 16B command response followed by room for 2048 RM entries. FCPU posts a new response only after ICPU has read the previous one.
_Avoid_: response buffer

**UART channel** — A shared-memory area for UART text. Outside the FCPU scheduler design.
