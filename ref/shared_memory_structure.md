Shared memory structure for ICPU FCPU communication

u32 ready
u32 reserved[3] -> These 3 words form a mailbox, for immediate requests
queue request_queue
queue response_queue
u32 tgtm_payload (size: 0x8010)
u32 tgtm_response (size: 0x2010)
u32 uart_payload[32][3]

queue struct:
u32 write_count
u32 read_count
u32 rsvd_1
u32 rsvd_2
entry { u32 start_addr, u32 length } [32]

