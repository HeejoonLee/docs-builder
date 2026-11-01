# TGTM

The traffic generator / traffic monitor block as the firmware sees it. Only FCPU accesses it.

Up: [Project structure](../structure.md)

## Memories

| Memory | Size | Entries | Holds |
|---|---|---|---|
| **DM** | 32KB | 2048 × 16B | Descriptors: AXI command fields, nReq, addr_inc, pattern, compare |
| **RM** | 32KB | 8192 × 4B | Responses: 2B read data, upper AXI ID bits, compare result (cp). Indexed by the lower AXI ID bits of the returned response (the same ID as its request), so entries can be overwritten within one task |

Each Descriptor issues nReq AXI commands. Its ID scheme field sets each command's AXI ID (for example the lower address bits, or sequential across the task), and so which RM entry its Response lands in. Descriptor field layout and the list of ID schemes: *TBD*.
| **UM** | 4KB | | Write data for AXI write commands |

**Rule:** A memory is accessed only when Status shows neither TGTM busy (bit 0) nor that memory's busy bit (DM bit 1, RM bit 2, UM bit 3).

## CSR

32-bit registers. Always accessible, even while TGTM is busy.

### Control

| Offset | Name | Meaning |
|---|---|---|
| 0x00 | Start index | First DM Descriptor of the next task |
| 0x04 | End index | Last DM Descriptor of the next task (inclusive) |
| 0x08 | Execution | Writing 1 to bit 0 starts a task over start..end |
| 0x0C | STOP | Forced stop of the running task |
| 0x10 | RESUME | *TBD* |
| 0x14 | LOOP | *TBD* |
| 0x18 | Addr increase | *TBD* |
| 0x1C | Error level | *TBD* |
| 0x20 | Stop on failure | *TBD* |
| 0x24 | Master port | Which of port 0 / port 1 the AXI traffic uses. Default: both, round-robin. Encoding *TBD* |
| 0x28 | Timer reset | *TBD* |
| 0x70 | Loopback enable | *TBD* |

### Status

| Offset | Name | Meaning |
|---|---|---|
| 0x2C | Status | bit 0 TGTM busy, bit 1 DM busy, bit 2 RM busy, bit 3 UM busy |
| 0x30 | Current descriptor index | |
| 0x34 | Current loop | |
| 0x38 | Current nReq | |
| 0x3C | Timer | |
| 0x60 | Req res count | |
| 0x64 | Err type | 7 bits |

### Port counters

AXI traffic leaves TGTM through two ports, P0 and P1, in round-robin (see Master port).

| Channel | P0 | P1 |
|---|---|---|
| AW | 0x40 | 0x50 |
| W | 0x44 | 0x54 |
| AR | 0x48 | 0x58 |
| R | 0x4C | 0x5C |
| B | 0x68 | 0x6C |

### Interrupts

Three registers with the same bit layout: bit 0 Error, bit 1 Completion, bit 2 Timer.

| Offset | Name | Meaning |
|---|---|---|
| 0x74 | Interrupt enable | Which interrupts are enabled |
| 0x78 | Interrupt | The interrupt bits that are set. FCPU polls this |
| 0x7C | Interrupt clear | Setting a bit clears it in Interrupt |

## Tasks

A **task** is one run of TGTM: everything that happens between Execute and the task's end.

1. FCPU clears all Interrupts (write 0x7 to Interrupt clear).
2. FCPU sets Start index and End index to the Descriptors to run (from 0 to 2047).
3. FCPU writes 1 to Execution bit 0. TGTM becomes busy.
4. TGTM issues the AXI traffic on its ports and writes Responses into RM.
5. TGTM raises Completion, or Error (Err type says which), and its busy bits drop. The task is over.

FCPU enables the Error and Completion interrupts (Interrupt enable) at init. Otherwise Interrupt never shows the end of a task.

If the task hasn't ended within a fixed number of polls, it has **timed out**. FCPU writes STOP. If busy still doesn't drop after STOP, TGTM is **stuck**.

The Timer interrupt doesn't end a task. It is recorded in the task's outcome.
