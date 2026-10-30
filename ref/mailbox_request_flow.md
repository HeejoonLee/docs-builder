# Mailbox request flow

## TGTM memory read/write

scheduler_step
* execute_immediate_requests
** peekTGTMmemoryWrites

This function checks the mailbox to see if a new request is there. The bit 31 of reserved[0] is used to check this(1 means it's been completed, 0 means it's not and should be handled). 
reserved[0] holds: memory type(DM, RM, UM), index, word. Index and word are both indices into the memory region; index first and then word from that index. Each memory region has a different way of indexing. (DM: 2048 indexes, 16B per index, RM: 8192 index, 4B per index)
reserved[2] holds the value to write(only for memory writes)

** tgtm_write_memory, tgtm_read_memory
These actually access the tgtm to do the operation. Simple matter of read/write to an address.

** completeTGTMmemorywrites

This function posts the result back into the mailbox.
reserved[1]: status of the tgtm memory read/write(sucess or other error codes)
reserved[2]: Value read(only for memory reads)
Bit 31 of resereved[0] is set to 1 at the end to indicate to the ICPU.

## TGTM CSR read/write

scheduler_step
* execute_immediate_requests
** PeekTGTMCSRAccess

reserved[0]: offset of the CSR register, is_write to indicate if it is a write or a read
reserved[2]: value to write(only for writes)

** Read STATUS, ERROR CSR reg
These are independent of the request and are used for debugging. These are posted along with the actual request result back in the mailbox.

** Read CSR or Write CSR

** Re-read STATUS, ERROR CSR reg

** CompletTGTMCSRRead

reserved[1]: The four CSR reg reads
reserved[2]: Read value(for reads and writes)
Bit 31 of reserved[0] is set to 1 at the end to indicate to the ICPU.
