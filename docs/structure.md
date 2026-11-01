# Project structure

Keystone is the test firmware for the HBF traffic generator (TGTM). This page shows the three parts of the system and how they talk to each other. Terms are defined in [GLOSSARY.md](../GLOSSARY.md).

## The three parts

```
   user (CLI)
       │
   ┌───▼───┐      shared memory       ┌────────┐   DM / UM / RM, CSR   ┌────────┐
   │ ICPU  │◄────────────────────────►│  FCPU  │◄─────────────────────►│  TGTM  │
   └───────┘  mailbox                 └────────┘                       └────────┘
              request queue + payload
              response queue + region
```

| Part | Does | Docs |
|---|---|---|
| **TGTM** | Hardware. Executes the Descriptors in DM from start index to end index when Execute is set, and records Responses in RM. | [tgtm/](tgtm/index.md) |
| **FCPU** | Firmware that drives TGTM. Serves Mailbox requests, runs Queued requests and workloads, watches every task and reports the outcome. | [design/fcpu-arc42.md](design/fcpu-arc42.md) ([HTML](design/fcpu-arc42.html), [PDF](design/fcpu-arc42.pdf)) |
| **ICPU** | Firmware facing the user. Parses CLI input, sends requests to FCPU and shows the results. | [icpu/](icpu/index.md) |

ICPU never touches TGTM directly. Everything goes through FCPU.

## Shared memory between ICPU and FCPU

The layout is fixed by the interface with the existing ICPU code (`ref/shared_memory_structure.md`). FCPU must respect it.

| Field | Offset* | Size | Direction | Holds |
|---|---|---|---|---|
| `ready` (**Ready**) | 0x0000 | 4 | ICPU sets | FCPU checks it before every shared-memory access |
| `reserved[3]` (**Mailbox**) | 0x0004 | 12 | both | One Mailbox request; FCPU replies in place, bit 31 of `reserved[0]` = done |
| `request_queue` (**Request queue**) | 0x0010 | 0x110 | ICPU → FCPU | Queue of 32 entries `{start_addr, length}` into the Request payload |
| `response_queue` (**Response queue**) | 0x0120 | 0x110 | FCPU → ICPU | Queue of 32 entries `{start_addr, length}` into the Response region |
| `tgtm_payload` (**Request payload**) | 0x0230 | 0x8010 | ICPU → FCPU | Queued request data: 8B header, then the data for its type |
| `tgtm_response` (**Response region**) | 0x8240 | 0x2010 | FCPU → ICPU | 16B command response, then up to 2048 RM entries |
| `uart_payload[32][3]` (**UART channel**) | 0xA250 | 0x180 | | UART text. Outside this design |

\* Assuming the fields are packed and the sizes are in bytes. Check against the shared header.

Queue struct: `write_count`, `read_count`, two reserved words, then `entry {start_addr, length}[32]`.

### Mailbox words

| Request | `reserved[0]` | `reserved[1]` (reply) | `reserved[2]` |
|---|---|---|---|
| TGTM memory access | memory (DM/RM/UM), index, word, done bit | Request status | value to write / value read |
| TGTM CSR access | offset, is_write, done bit | Status (0x2C, 4 bits) and Err type (0x64, 7 bits), read before and after: 22 bits | value to write / value read |

Exact bit positions: from the existing code, *TBD* here.

### Request status

One enum for Mailbox replies and for responses on the Response queue. The numeric values come from the existing code.

| Status | When |
|---|---|
| OK | Success |
| invalid | Bad header, or a flag that doesn't fit the data type |
| unsupported | Unknown CONTROL operation or memory type |
| address | Index or word out of range |
| length | The entry's length doesn't match the header (descriptor count, config, UM) |
| sequence | Sequence error (see [GLOSSARY](../GLOSSARY.md)) |
| csr | CSR config check failed |
| execution | The task ended with Error |
| timeout | The task timed out. Also used, with a stuck marker, for the task after which TGTM is stuck |
| busy | Refused: a task is running, a memory is busy, a workload is active, or TGTM is stuck |
| aborted | The workload was cancelled by a STOP |

### Request payload header

| Word | Holds |
|---|---|
| `payload[0]` | flags (8 bits, below), data type, sequence number |
| `payload[1]` | descriptor count, descriptor start index |

Other bit positions within the words: *TBD* from the existing code.

| Flag bit | Name | Applies to | Meaning |
|---|---|---|---|
| 0 | FIRST | all | Opens a Sequence; seq must be 0 |
| 1 | LAST | all | Closes the Sequence |
| 2 | Has config | DIRECT_DM | The data starts with CSR config values |
| 3 | Has UM | DIRECT_DM | The data ends with UM data to copy into UM |
| 4 | Need response | all | Send command, progress and success responses. Errors are always sent |
| 5 | RM by descriptor | CONTROL EXECUTE, API_SET | Copy the RM entries of the task's Descriptors into the Response region |

A flag set on a data type it doesn't apply to: `invalid`.

| Data type | After the header |
|---|---|
| DIRECT_DM | CSR config (if Has config), Descriptors, UM data (if Has UM) |
| CONTROL | csr_offset (2B), operation (2B), control value (4B) |
| API_SET | generator parameters (not in production yet) |

**CSR config** holds values for a subset of the TGTM control registers. Which registers, and so its size: *TBD* (the current code reads 16B).

### Ownership

- **Mailbox**: ICPU writes a request and clears done. FCPU owns the words until it sets done.
- **Request payload**: the area an entry points at is FCPU's until FCPU consumes the entry. That happens as soon as the data is in TGTM or in FCPU state, not when the workload ends.
- **Response region**: FCPU writes one response, then waits until ICPU has read it (Response queue read_count catches up) before writing the next.

## Repository layout

```
GLOSSARY.md            domain terms (no implementation details)
docs/
  structure.md         this page
  adr/                 architecture decisions
  tgtm/                TGTM hardware as the firmware sees it
  design/              FCPU design doc (arc42): fcpu-arc42.md is the source,
                       .html/.pdf are generated by build.mjs
  icpu/                ICPU side of the protocol
ref/HBF_v0.7.pdf       OCP HBF base die spec
ref/shared_memory_structure.md   the fixed ICPU ↔ FCPU interface
ref/*_flow.md          how the current FCPU code handles each path
```
