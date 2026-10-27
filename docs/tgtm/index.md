# TGTM

The traffic generator / traffic monitor block as the firmware sees it. Only FCPU accesses it. Register offsets and bit positions are *TBD* until the register map is added.

Up: [Project structure](../structure.md)

## Memories

| Memory | Size | Entries | Holds |
|---|---|---|---|
| **DM** | 32KB | 2048 × 16B | Descriptors: AXI command fields, nReq, addr_inc, pattern, compare |
| **RM** | 32KB | 8192 × 4B | Responses: 2B read data, upper AXI ID bits, compare result (cp). Indexed by the lower AXI ID bits, so entries can be overwritten within one task |
| **UM** | 4KB | | Write data for AXI write commands |

**Rule:** DM, UM and RM are never accessed while TGTM is busy.

## CSR

32-bit registers. Always accessible, even while TGTM is busy.

| Field | Kind | Meaning |
|---|---|---|
| start index | control | First DM Descriptor of the next task |
| end index | control | Last DM Descriptor of the next task |
| execute | control | Setting it starts a task over start..end |
| stop | control | Setting it forcibly halts TGTM |
| busy | status | Set while a task runs |
| interrupt | status | Interrupt status bits. Not cleared by reading |
| error | status | Error information for the current task |
| timer | status | *TBD* |

Offsets, widths, and which bits clear how: *TBD*.

## Tasks

A **task** is one run of TGTM: everything that happens between setting Execute and busy dropping.

1. All interrupt status bits are cleared.
2. start index and end index are set to the Descriptors to run (from 0 to 2047).
3. Execute is set. TGTM becomes busy.
4. TGTM issues the AXI traffic and writes Responses into RM.
5. Busy drops. The task is over. Error and interrupt bits describe how it went.

If busy doesn't drop within a fixed number of polls, the task has **timed out**. FCPU sets Stop. If busy still doesn't drop after Stop, TGTM is **stuck**.

Interrupt bits raised during a task don't end it. They are part of its outcome.
