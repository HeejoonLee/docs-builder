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

**Direct request** — An ICPU request that FCPU serves immediately without executing TGTM: CSR read/write, or a DM/UM/RM read/write.

**TGTM workload** — An ICPU request that requires TGTM execution, identified by a sequence ID. Consists of one or more TGTM tasks.
_Avoid_: job

**Supplied workload** — A TGTM workload whose Descriptors ICPU writes into the Workload buffer. FCPU copies them into DM as they are. Always exactly one TGTM task.
_Avoid_: manual workload, direct descriptor command

**Generated workload** — A TGTM workload that names a generator and its parameters only. FCPU generates the Descriptors itself, as one or more TGTM tasks. Only the final task's Responses are returned; an earlier task's error ends the workload and is reported instead. Commands: `seq_write`, `seq_read`, `rand_read`.
_Avoid_: auto workload, descriptor generator request

**Load only** — A workload option: FCPU fills DM but does not Execute. ICPU starts tasks later with raw Executes.

**Response selection** — Which RM entries are copied to the Response buffer after a task ends. ICPU may name a range, or FCPU works it out from the task's Descriptors. If it is larger than the Response buffer, only what fits is copied and the outcome is marked truncated.

**TGTM task** — One run of TGTM: the Descriptors from start index to end index that TGTM executes for one Execute. Every Execute starts a task, whether FCPU sets it as part of a workload or ICPU sets it with a raw CSR write.
_Avoid_: window, run, chunk

**Execute** — Setting the CSR execute bit, which starts a TGTM task over the start index and end index currently in CSR. All interrupt status bits are cleared before every Execute. Every task is watched until TGTM is no longer busy, and its outcome is reported.

**Stop** — Setting the CSR stop bit, which forcibly halts TGTM. FCPU sets it when a task times out; ICPU may set it with a CSR write, which also cancels the active workload.

**TGTM stuck** — The state after a forced Stop fails to bring busy down. FCPU refuses new tasks until a CSR write recovers TGTM.

**Raw Execute** — An Execute that ICPU sets itself with a CSR-write Direct request, outside any workload. It is rejected while a task is running or a workload is active.

**Task outcome** — How a watched task ended: done, error, or timeout. Timeout means busy was still set after a fixed number of polls; FCPU then forces TGTM to stop with the Stop bit. Interrupt status bits seen during the task are recorded in the outcome but do not end the task.
_Avoid_: window outcome

## ICPU ↔ FCPU channels

**Direct queue** — One-slot shared-memory mailbox carrying a Direct request from ICPU to FCPU. FCPU writes the reply back into the same slot, so it never waits behind task responses. FCPU serves it even while a task is running.
_Avoid_: mailbox

**Workload queue** — Shared-memory queue carrying TGTM workload requests from ICPU to FCPU. Each entry names the kind of workload, whether it wants a response, and the address and length of its data in shared memory. Workloads wait here until FCPU is ready for them.
_Avoid_: request queue

**Workload buffer** — The large shared-memory region (0x8010 bytes) a Workload queue entry points into. It holds a Supplied workload's Descriptors (up to one full DM) or a Generated workload's parameters, and optionally extra CSR values at the front that FCPU writes before Execute.
_Avoid_: payload

**Response queue** — Shared-memory queue carrying FCPU → ICPU messages about workloads and tasks: progress after each task of a multi-task workload (no Responses attached), and the final task outcome. Direct request replies do not use it.

**Response buffer** — The shared-memory region, separate from the Workload buffer, that receives the RM entries chosen by the Response selection after a task (about 2048 Responses).
