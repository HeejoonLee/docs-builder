# Structs

The FCPU's internal state, in ownership order. These are internal C structs, not the wire format: the shared-memory layout is fixed separately by the ICPU ↔ FCPU interface ([structure.md](../structure.md#shared-memory-between-icpu-and-fcpu)). Field names may still change when the code is written.

Pages: [Overview](index.md) · [Scheduler](scheduler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Structs](structs.md) · [Flows](flows.md) · [Rules](rules.md)

```
scheduler
  owns executor
    owns request copy (header + payload area)
    owns workload
    owns current task
    owns monitor
  owns pending response
```

## Request

Only the header and the payload area are copied. The data itself stays in the Request payload until the request is consumed.

```c
struct area { uint32_t addr; uint32_t len; };

enum data_type { DIRECT_DM, CONTROL, API_SET };

struct request_header {          /* payload[0], payload[1] */
    uint32_t       flags;        /* response wanted, config present, END_SEQUENCE, … */
    enum data_type type;
    uint32_t       seq;
    uint32_t       desc_count;
    uint32_t       desc_start;
};

struct queued_request {          /* executor's copy */
    struct request_header hdr;
    struct area           data;  /* valid until consumed */
};
```

## Task

Everything needed for one Execute.

```c
struct rm_selection { /* from the CONTROL EXECUTE payload; form TBD */ };

struct task {
    uint32_t            index;       /* zero-based within the workload */
    uint16_t            dm_start;    /* written by FCPU for generated tasks; */
    uint16_t            dm_end;      /*   read from CSR otherwise            */
    struct rm_selection sel;         /* empty for Mailbox Execute */
};
```

## Workload

```c
enum workload_origin { WL_QUEUED, WL_MAILBOX };

struct workload {
    enum workload_origin    origin;
    uint32_t                seq;             /* queued only */
    bool                    response_wanted; /* off: suppress success responses */
    bool                    cancelled;       /* set by a Mailbox Stop */
    uint32_t                tasks_total;     /* 1 unless Generated */
    uint32_t                tasks_done;      /* also the next task's index */
    const struct generator *gen;             /* NULL unless API_SET */
};
```

## Monitor

```c
enum monitor_state { MON_IDLE, MON_WATCHING, MON_STOPPING };

struct monitor {
    enum monitor_state state;
    uint32_t           polls;
    uint32_t           irq_seen, err_seen;
};

enum outcome_kind { OUT_DONE, OUT_ERROR, OUT_TIMEOUT, OUT_STUCK };

struct task_outcome {
    enum outcome_kind kind;
    uint32_t          irq, err;
};
```

## Executor

```c
enum executor_state { EX_IDLE, EX_WAIT_TASK, EX_TASK_ENDED, EX_NEXT_TASK };

struct executor {
    enum executor_state   state;       /* != EX_IDLE ⇔ a workload is active */
    bool                  stuck;
    struct queued_request request;     /* the request that created the workload */
    struct workload       workload;
    struct task           task;
    struct task_outcome   last;        /* held from WAIT_TASK to TASK_ENDED */
    struct monitor        monitor;
};
```

Queued requests with no workload (DIRECT_DM, non-EXECUTE CONTROL) finish inside `executor_begin()`, so they leave no state behind.

## Scheduler and responses

```c
enum response_kind { RSP_COMMAND, RSP_PROGRESS, RSP_FINAL, RSP_ERROR };

struct response {                     /* packed into 16B on delivery */
    enum response_kind kind;
    enum workload_origin origin;
    uint32_t seq;
    uint32_t status;                  /* OK / error code / task outcome */
    uint32_t data;                    /* CSR value, task k of n, irq/err bits, … */
    uint32_t rm_count;                /* RM entries already in the Response region */
    bool     truncated;
};

struct scheduler {
    struct executor executor;
    uint32_t        expected_seq;
    bool            response_pending;
    struct response response;
};
```

There's no pending slot for the Mailbox: its reply is written in the same step. The exact 16B layout of a command response comes from the current code: *TBD*.
