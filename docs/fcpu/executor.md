# Executor

Decides **what** a request does. It owns the active request copy, the workload, the current task, the stuck flag and the monitor. It reads the Request payload area it is handed and accesses TGTM through `tgtm/`. It never touches the queues, the Mailbox words or Ready. Folder: `executor/`.

Pages: [Overview](index.md) · [Scheduler](scheduler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Structs](structs.md) · [Flows](flows.md) · [Rules](rules.md)

## Entry points

| Entry | Called for | Runs |
|---|---|---|
| `executor_mailbox()` | Every Mailbox request | Immediately, in one call. Never changes the active request or task, except to start a Mailbox Execute workload or mark a Stop. |
| `executor_begin()` | An admitted Queued request | The request's whole atomic part. Queued requests with no workload finish here. |
| `executor_step()` | Each scheduler step while a workload is active | One atomic step of the workload state machine |

## Mailbox requests

| Request | Rejected when | Does | Reply |
|---|---|---|---|
| DM / UM / RM read | a task is running, or TGTM is stuck | `tgtm` read at (memory, index, word) | status, value read |
| DM / UM / RM write | a task is running, or TGTM is stuck | `tgtm` write | status |
| CSR read | never | read STATUS, ERROR; read the register; re-read STATUS, ERROR | the four STATUS/ERROR reads, value read |
| CSR write, sets execute (**Mailbox Execute**) | a workload is active, or TGTM is stuck | start a single-task workload (below) | the four reads, value |
| CSR write, sets stop | never | the write; mark the active workload cancelled | the four reads, value |
| other CSR write | never | the write; if stuck and busy now reads low, clear stuck | the four reads, value |

Memory addressing: DM has 2048 indexes of 16B, RM 8192 indexes of 4B, UM *TBD*. "Word" selects the 4B word within the index.

### Mailbox Execute

```
workload = { origin MAILBOX, tasks_total 1 }
task     = { index 0, DM range = CSR start/end as they are, selection empty }
start_task(); monitor_watch()                  → state WAIT_TASK
```

DM is used as it is. If it's empty, TGTM reports the error, and that becomes the task outcome. No RM is copied. At task end a 16B outcome marked mailbox-origin goes on the Response queue (always, as there's no response flag).

## Queued requests

`executor_begin()` gets the checked header, the payload area and the Response region. It runs atomically and returns a `step_result` (see [scheduler.md](scheduler.md#step-results)).

| Data type | Workload? | Atomic part |
|---|---|---|
| DIRECT_DM | no | Check busy (safety; error if set). If the flag says so, apply the 16B CSR config at the start of the area (with basic checks). Copy `desc_count` Descriptors into DM from `desc_start`. Copy the UM data after them into UM. Consume. Command response. |
| CONTROL, not EXECUTE | no | Read csr_offset, operation, value (8B after the header). Run the operation (a switch over fixed CSR sequences). Consume. Command response. |
| CONTROL EXECUTE | single task | Read the Response selection from the payload. Consume. Create the workload `{ origin QUEUED, seq, tasks_total 1 }`. `start_task()`, `monitor_watch()`. Command response ("accepted"). → WAIT_TASK |
| API_SET | Generated, 1..n tasks | `gen.begin(params)`: validate and return the Descriptor total. Consume. Split into tasks of up to 2048. Command response. → NEXT_TASK |

The command response is sent only when the request's response flag is set; errors are always sent. Where exactly the Response selection sits in the EXECUTE payload: *TBD, take from the current code*.

## Workload state machine

```
           Mailbox Execute / CONTROL EXECUTE          API_SET
   IDLE ──────────────────────────────┐        ┌───────────────── IDLE
                                      ▼        ▼
                                   WAIT_TASK ◄── NEXT_TASK ◄───────────┐
                                      │ monitor_poll()                 │
                                      │ ended                          │
                                      ▼                                │
                                  TASK_ENDED ── more tasks, done,      │
                                      │         not cancelled:         │
                                      │         progress response ─────┘
                                      │ otherwise
                                      ▼
                     RM copy (queued, done or error) + final response → IDLE
```

| State | Needs Response region | One step does |
|---|---|---|
| WAIT_TASK | no | `monitor_poll()`. Still running: return. Ended: keep the outcome; if STUCK, set the stuck flag. → TASK_ENDED |
| TASK_ENDED | yes (waits if not free) | Last task, or not done, or cancelled: if a queued workload ended done or error, `monitor_copy_rm(selection, region)`; final response → IDLE. Otherwise: progress response → NEXT_TASK |
| NEXT_TASK | no | `gen.fill(0, task size)` writes this task's Descriptors into DM. `start_task()`, `monitor_watch()` → WAIT_TASK |

A Generated workload stops at the first task that doesn't end done. The final response carries that task's outcome and RM.

## Starting a task

`start_task()` in `executor.c` is the only code that sets Execute:

```
clear all interrupt status bits
write start index, end index      (FCPU-set tasks only; Mailbox Execute leaves CSR as it is)
set execute
```

## Generators (API_SET)

```c
struct generator {
    int (*begin)(struct area params);        /* total Descriptors, or <0 error */
    int (*fill)(uint16_t dm_index, int max); /* writes into DM; returns count */
};
```

`api_set.c` maps the API to its generator. **Adding a generator** means one new `gen/gen_*.c` and one table row. API_SET is not in production yet.

## Public interface

```c
void executor_init(struct executor *e);
bool executor_active(const struct executor *e);   /* a workload is active */
bool executor_stuck(const struct executor *e);
void executor_mailbox(struct executor *e, const struct mailbox_req *req,
                      struct mailbox_reply *reply);
void executor_begin(struct executor *e, const struct request_header *hdr,
                    struct area data, const struct area *region,
                    struct step_result *res);
void executor_step(struct executor *e, const struct area *region,  /* NULL = not free */
                   struct step_result *res);
```
