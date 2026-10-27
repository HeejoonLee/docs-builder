# Project structure

Keystone is the test firmware for the HBF traffic generator (TGTM). This page shows the three parts of the system and how they talk to each other. Terms are defined in [GLOSSARY.md](../GLOSSARY.md).

## The three parts

```
   user (CLI)
       │
   ┌───▼───┐      shared memory       ┌────────┐   DM / UM / RM, CSR   ┌────────┐
   │ ICPU  │◄────────────────────────►│  FCPU  │◄─────────────────────►│  TGTM  │
   └───────┘  direct queue            └────────┘                       └────────┘
              workload queue
              workload buffer
              response queue
              response buffer
```

| Part | Does | Docs |
|---|---|---|
| **TGTM** | Hardware. Executes the Descriptors in DM from start index to end index when Execute is set, and records Responses in RM. | [tgtm/](tgtm/index.md) |
| **FCPU** | Firmware that drives TGTM. Serves Direct requests, runs workloads as tasks, watches every task and reports the outcome. | [fcpu/](fcpu/index.md) |
| **ICPU** | Firmware facing the user. Parses CLI input, sends requests to FCPU and shows the results. | [icpu/](icpu/index.md) |

ICPU never touches TGTM directly. Everything goes through FCPU.

## Shared memory between ICPU and FCPU

| Region | Direction | Holds |
|---|---|---|
| **Direct queue** | ICPU → FCPU, reply in place | One slot. A Direct request (CSR read/write, DM/UM/RM read/write). FCPU writes the reply back into the same slot. |
| **Workload queue** | ICPU → FCPU | Workload entries: kind, flags (response wanted, load only, CSR block present, response range given), optional response range, and the address and length of the workload's data in the workload buffer. |
| **Workload buffer** | ICPU → FCPU | 0x8010 bytes. An optional CSR block at the front, then either a Supplied workload's Descriptors (up to one full DM, 0x8000) or a Generated workload's parameters. |
| **Response queue** | FCPU → ICPU | Progress messages and final task outcomes. |
| **Response buffer** | FCPU → ICPU | Below the workload buffer, no overlap. About 2048 Responses copied out of RM after a final task. |

Exact offsets and entry layouts: *TBD*.

### Ownership

- **Direct queue**: ICPU fills the slot. FCPU owns it until the reply is written. Then it's ICPU's again.
- **Workload buffer**: the area an entry points at belongs to FCPU from the moment the entry is queued until FCPU releases the entry. FCPU releases it as soon as it has read the bytes (after the DM copy, or after reading the parameters), not when the workload finishes.
- **Response buffer**: FCPU writes it only when a workload or raw task finishes. ICPU reads it before the next task can finish.

## Repository layout

```
GLOSSARY.md            domain terms (no implementation details)
docs/
  structure.md         this page
  adr/                 architecture decisions
  tgtm/                TGTM hardware as the firmware sees it
  fcpu/                FCPU firmware design
  icpu/                ICPU side of the protocol
ref/HBF_v0.7.pdf       OCP HBF base die spec
```
