# Executor

TGTM access: DM, UM and RM, and the control side of CSR. It copies a workload's Descriptors from the workload-buffer area the handler hands it straight into DM. It also holds the descriptor sources and response selection. It never touches the queues or the direct slot. Folder: `executor/`.

Pages: [Overview](index.md) · [Scheduler](scheduler.md) · [Handler](handler.md) · [Executor](executor.md) · [Monitor](monitor.md) · [Flows](flows.md) · [Rules](rules.md)

## Memory

`mem_read` and `mem_write` on DM, UM and RM. The executor doesn't check busy itself. The scheduler only calls these when no task is running.

`load(source, dm_index, max)` asks the source to `fill()` DM from `dm_index` with up to `max` Descriptors. It returns how many were written. It doesn't know or care which kind of source it has.

## Descriptor sources

```c
typedef struct {
    int (*begin)(const workload_entry *e);       /* total count, or <0 error */
    int (*fill)(uint16_t dm_index, int max);     /* writes into DM; returns count */
} desc_source;
```

| Source | `begin()` | `fill()` |
|---|---|---|
| **Copy source** (`copy_source.c`) | Checks the area is whole 16B Descriptors, at most 2048 | Copies them from the workload-buffer area into DM, byte for byte. No staging buffer. |
| **Generator** (`gen/`) | Validates parameters, returns the total | Computes Descriptors from a cursor in the generator's own file and writes them into DM |

## CSR

`csr_read` and `csr_write` serve ICPU's CSR requests as asked.

`start_task(start, end)` is the **only** way a workload task starts:

```
clear all interrupt status bits
write start index, end index
set Execute
```

`start_task_raw(value)` does the same for a raw Execute: clear interrupts, then perform ICPU's CSR write. No Execute skips the interrupt clear.

## Response selection (`select.c`)

```c
int select_responses(uint16_t start, uint16_t end, rm_range *out, int max);
```

Works out which RM entries a task's Descriptors will write, by reading DM start..end. It is called before Execute, while TGTM is idle. Used whenever ICPU gives no range, including raw tasks.

> **TODO:** the rule for mapping Descriptors to RM indices is not known yet. The body is a stub.

## Public interface

```c
void mem_read(mem_id m, uint32_t off, void *out, int n);
void mem_write(mem_id m, uint32_t off, const void *in, int n);
int  load(const desc_source *s, uint16_t dm_index, int max);
uint32_t csr_read(uint32_t off);
void csr_write(uint32_t off, uint32_t v);
void start_task(uint16_t start, uint16_t end);
void start_task_raw(uint32_t off, uint32_t v);
void apply_csr(area csr_block);              /* CSR values from the workload buffer */
int  select_responses(uint16_t start, uint16_t end, rm_range *out, int max);
```
