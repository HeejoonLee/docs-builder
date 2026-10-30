# Scheduler

The top of the tree. It owns the ICPU ↔ FCPU transport and the executor, and decides **when** each request runs. It knows nothing about Descriptors, busy, or RM. Folder: `scheduler/`.

Pages: [Overview](index.md) · [Scheduler](scheduler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Structs](structs.md) · [Flows](flows.md) · [Rules](rules.md)

## One step

```
scheduler_step(s):
    shm = ready_is_set()                       # read on every step; normally always set

    if shm and s.response_pending:
        try_deliver(s)                         # Response region free? write 16B, post entry

    if shm:
        serve_mailbox(s)                       # at most one Mailbox request

    region = response_region_if_free(s, shm)   # NULL unless shm, nothing pending, ICPU caught up

    if executor_active(&s.executor):
        executor_step(&s.executor, region, &res)
        handle(s, res)
    else if region and not executor_stuck(&s.executor):
        admit_queued(s, region)
```

While Ready is clear, the step does no shared-memory work at all. The executor still advances the hardware side (it keeps polling the monitor), but any step that needs the Response region waits.

## Ready

ICPU sets Ready. FCPU reads it every time it is about to touch shared memory, once per step. If it reads clear, FCPU skips the Mailbox, the Request queue and response delivery for that step. That isn't an error, and nothing is reported.

## Mailbox

```
serve_mailbox(s):
    req = mailbox_peek()          # done bit of reserved[0] is 0 → a request is there
    if none: return
    executor_mailbox(&s.executor, &req, &reply)
    mailbox_complete(&reply)      # reserved[1], reserved[2], then set the done bit
```

The reply goes straight into the Mailbox words in the same step, so there's no pending slot for it. ICPU can't send another request until it sees the done bit.

The two Mailbox forms (memory access, CSR access) and their reply words are described in [executor.md](executor.md#mailbox-requests). `mailbox.c` only packs and unpacks the words.

## Admitting a Queued request

Only when the executor is idle (no workload), TGTM is not stuck, and the Response region is free. The whole thing is one atomic step.

```
admit_queued(s, region):
    entry = queue_peek()                          # write_count != read_count
    if none: return
    hdr = queue_read_header(entry)                # payload[0], payload[1]

    if header invalid:              reject(entry, INVALID)
    elif hdr.seq != s.expected_seq: reject(entry, SEQUENCE); s.expected_seq = 0
    else:
        s.expected_seq = hdr.end_sequence ? 0 : hdr.seq + 1
        executor_begin(&s.executor, &hdr, entry.area, region, &res)
        handle(s, res)

reject(entry, err):
    queue_consume()
    store error response                          # always, even if response flag is off
```

The sequence check is part of admission, so the executor never sees an out-of-order request.

## Step results

The executor never touches the queues. It returns what it wants done:

```c
struct step_result {
    bool consume;               /* payload no longer needed → ConsumeRequest */
    bool respond;               /* a response to deliver */
    struct response response;   /* 16B command response + RM count */
};
```

```
handle(s, res):
    if res.consume: queue_consume()
    if res.respond: s.response = res.response; s.response_pending = true
```

## Response delivery

There is one Response region: a 16B command response at its start, then room for 2048 RM entries. FCPU posts a new response only after ICPU has read the previous one.

- **Region free** means: nothing pending, and the Response queue's read_count has caught up with its write_count.
- Any executor step that writes RM or produces a response gets the region only when it's free. If it isn't free, the executor waits (it never drops a response). Polling the monitor doesn't need the region, so it continues.
- `try_deliver()` writes the 16B response to the start of the region, then posts one entry: (region address, 16 + 4 × RM count).

While a response waits, the Mailbox is still served; it doesn't use the Response queue.

## Public interface

```c
void scheduler_init(struct scheduler *s);
void scheduler_step(struct scheduler *s);
```
