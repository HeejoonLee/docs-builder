# Monitor

Watches one Execute until TGTM stops being busy, works out the outcome, and gives it to whoever started that Execute. Folder: `monitor/`.

Pages: [Overview](index.md) · [Handler](handler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Flows](flows.md) · [Rules & policies](rules.md)

## Responsibilities

- The only module that polls busy.
- Checks the timeout while watching.
- Reads the status and error registers once busy clears, and decides the outcome.
- Sends the outcome to the window's **starter**.
- Owns `rm_dump.c`.

## Starter

Each watch records who set Execute:

| Starter | Set by | When the window ends |
|---|---|---|
| `STARTER_ICPU` | handler, on any CSR write that sets Execute (raw or not) | monitor: `rm_dump()` + `reply_window_done(outcome)` |
| `STARTER_EXECUTOR` | executor, for each auto task | monitor stores the outcome. The executor collects it with `monitor_take_outcome()` and sends nothing itself. |

There is only one watch at a time. An Execute that arrives while a watch is active doesn't start a second one.

## One step of `monitor_work()`

```
if not watching: return
if timed out (fixed macro):  outcome = TIMEOUT
else if busy:                return              /* check again next pass */
else read status/error regs: outcome = DONE or ERROR
hand outcome to starter (table above)
stop watching
```

Outcomes: **DONE**, **ERROR** (with the error register values), **TIMEOUT**. After a timeout the monitor reports and goes back to idle. It doesn't block later Executes. Recovering TGTM is up to the engineer.

> **Note:** A Stop write kills TGTM, so busy may never clear. The watch then ends as TIMEOUT. That's expected, not a bug.

## RM dump (`rm_dump.c`)

Copies all 8192 RM entries to one fixed shared buffer, without clearing RM first. ICPU reads the buffer before it sends its next Execute, so there is no overwrite race. The size, the buffer and the clearing behaviour are policy and can change later ([policies](rules.md#policies-current-choices)).

## Public interface

```c
void monitor_work(void);
void monitor_watch(starter_t who);
bool monitor_is_watching(void);
bool monitor_take_outcome(outcome_t *out);  /* executor-started windows only; true once */
void rm_dump(void);
```
