# Flows

The common cases, step by step. H = handler, E = executor, M = monitor.

Pages: [Overview](index.md) · [Handler](handler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Flows](flows.md) · [Rules & policies](rules.md)

## CSR read while traffic runs

```
ICPU  direct: CSR read (axi response count)
H     read CSR → reply_direct → release entry
M     (still watching; checks busy on its own turn)
```

This works because M only checks busy once per pass and returns.

## Manual workload: `write`

```
ICPU  workload: write ... (seq 7)
E     IDLE: monitor idle → begin OK → LOADING
E     LOADING: fill → DM; reply_loaded(seq 7) → IDLE
ICPU  direct: CSR write start=0, end=99
H     write → reply_direct
ICPU  direct: CSR write Execute
H     write → reply_direct; monitor_watch(ICPU)
M     busy … busy … clear → DONE
M     rm_dump; reply_window_done(DONE)
ICPU  (may Execute 0..99 again, or another range, without reloading)
```

## Auto workload: `seq_write`, 5000 descriptors

```
E     begin → 5000 descriptors = tasks of 2048 / 2048 / 904
E     task 1: fill 2048, start=0 end=2047, Execute, monitor_watch(EXECUTOR)
M     … DONE → stored for E
E     take_outcome DONE → reply_progress(1/3) → LOADING
E     task 2 … reply_progress(2/3)
E     task 3: fill 904, end=903 … DONE
E     rm_dump; reply_workload_done(DONE) → IDLE
```

## Error in the middle of an auto workload

```
M     task 2 ends: ERROR (error regs captured)
E     take_outcome ERROR → task 3 is not run
E     rm_dump; reply_workload_done(ERROR, task 2, regs) → IDLE
```

## Stop during an auto workload

```
ICPU  direct: CSR write Stop
H     write → executor_cancel() → reply_direct
M     TGTM killed, busy never clears → TIMEOUT
E     take_outcome TIMEOUT (cancel pending) → no more tasks
E     rm_dump; reply_workload_done(TIMEOUT / cancelled) → IDLE
```

If busy does clear normally after a Stop, the cancel flag still stops the next task from starting.

## Raw Execute while an auto workload runs

```
ICPU  direct: CSR write Execute
H     write (expert mode) → monitor already watching → no new watch → reply_direct
M     the current watch keeps STARTER_EXECUTOR; outcome goes to E as usual
```

## Workload queued behind a manual workload

```
E     manual workload A loaded → IDLE
ICPU  workload B queued
E     IDLE: monitor idle → loads B over A's DM contents
```

ICPU must not queue B until it has finished executing A's windows. If one of A's windows is still being watched, E waits until it ends.
