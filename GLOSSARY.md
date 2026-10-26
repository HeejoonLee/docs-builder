# Keystone Glossary

## Hardware

**TGTM** — Traffic Generator / Traffic Monitor. The hardware block that issues AXI traffic described by Descriptors and records the responses.

**DM (Descriptor Memory)** — 32KB TGTM memory holding 2048 Descriptors of 16B each.

**RM (Response Memory)** — 32KB TGTM memory holding 8192 Response entries of 4B each. Indexed by the lower bits of the AXI ID; entries can be overwritten within a single Window.

**UM (User Memory)** — 4KB TGTM memory holding user-specified write data for AXI write commands.

**CSR** — The TGTM register set (32-bit registers): control (start index, end index, execute, stop) and status (busy, interrupt, timer). Always accessible, even while TGTM is busy.

**Descriptor** — One 16B DM entry describing AXI traffic: AXI command fields, plus nReq (number of commands generated), addr_inc, pattern, and compare.

**Response** — One 4B RM entry: part of an AXI response, including 2B of read data, the upper AXI ID bits, and the compare result (cp).

## Firmware

**ICPU** — The CPU facing the user. Parses CLI input, sends requests to FCPU, and reports responses back to the user.

**FCPU** — The CPU that controls TGTM. Moves requests and responses between ICPU and TGTM, generates Descriptors, and watches TGTM for completion and errors.

**Direct request** — An ICPU request that FCPU serves immediately without executing TGTM: CSR read/write, or a DM/UM/RM read/write.

**TGTM workload** — An ICPU request that requires TGTM execution, identified by a sequence ID. Consists of one or more TGTM tasks.
_Avoid_: job

**Manual workload** — A TGTM workload that FCPU only loads into DM as a single TGTM task; ICPU then starts windows with Execute. Commands: `write`, `read`.

**Auto workload** — A TGTM workload whose TGTM tasks FCPU loads and executes one after another on its own. ICPU cannot choose window bounds. FCPU reports progress after each task, and only the last task's RM contents are returned. Commands: `seq_write`, `seq_read`, `rand_read`.

**TGTM task** — A portion of a TGTM workload whose Descriptors all fit in DM at once (at most 2048).
_Avoid_: run, chunk

**TGTM window** — The range of Descriptors (start index to end index) that TGTM executes for one Execute. A TGTM task may be executed as several windows, and a window may be executed again without reloading.
_Avoid_: run

**Execute** — Setting the CSR execute bit, which starts a TGTM window. ICPU does this with an ordinary CSR write Direct request; FCPU does it on its own for an Auto workload. Each window is watched until TGTM is no longer busy, and its outcome is reported to whoever started it.

**Window outcome** — How a watched Execute ended: done, error, or timeout. A Stop usually ends in timeout, because it kills TGTM.

## ICPU ↔ FCPU channels

**Direct queue** — One-entry shared-memory queue carrying Direct requests from ICPU to FCPU.

**Workload queue** — Shared-memory queue carrying TGTM workload requests from ICPU to FCPU. Workloads wait here until FCPU is ready for them.
_Avoid_: request queue

**Response queue** — Shared-memory queue carrying every FCPU → ICPU message (Direct request replies, workload replies, window outcomes).
