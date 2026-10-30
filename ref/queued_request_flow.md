# Queued request flow

execute_queued_requests
* PeekRequest

Looks inside the request_queue of shared memory to see if there are any unread entries(standard head and tail mechanisms already implemented)
Each entry contains just address and length: they point to a region in the tgtm_payload.

* ReadRequestHeader

Read the payload region indicated by the entry.
Eahc payload has the following header(u32 payload[]):
payload[0]: flags, data type, sequence number
payload[1]: descriptor count, descriptor start index

* process_tgtm_request

Validate header. Things such as invalid values.
Set sequence. The sequence number is used to make sure each request is processed in that order. flags has a END_SEQUENCE bit that concludes a sequence; before that is encountered, all sequences starting with 0 has to increase by 1 for each request. Failing to meet this is an error.

Here is where it branches depending on the 'data type'.
There are 3 data types: DIRECT_DM, CONTROL, API_SET

1. DIRECT_DM
(1) Check if the request has configuration(set of CSR reg values to set). This is indicated in the flag bit
If there is configuration data, it is placed at the first 16B of the payload region pointed to by the entry.
If there isn't, the first byte of payload region immediately starts with the descriptor entries.
UM data if there, is placed after the descriptor entries
(2) Check TGTM CSR bit to see if it is busy
(3) Apply configuration if it exists. This is copying the reg values in the payload region along with some basic validation
(4) Copy the descriptor data to TGTM DM
(5) Copy the user data to UM(if it exists)


2. CONTROL
The paylod region after 8B header is 8 bytes of data: csr_offset(2B), operation(2B), control value(4B)
This is usually a CSR access operation, same as that from immediate requests, but issued in a queue, that is, must follow some other requests already in the queue.
CSR offset is the register offset. Operation indicates which control operation to do; a switch-case in the code. These are arbitrary. May not just be a single read or write; may be multiples of predefined operations. Control value are used if the operation requires a write.
A special operation is EXECUTE; the monitor must be started. Setting the execute bit starts the tgtm traffic, or a task. Currently, it sets a global variable which makes the monitor poll for the end of a task.

* ConsumeRequest: this indicates that we are done with payload and the queue head is updated by 1. All payload data is safely in TGTM or stored in FCPU, so ICPU can use it again.
* SendCommandResponse: This step is done only if response is required(set in the flag bit). Sending response is, writing 16B of data in the tgtm_response region, then posting an entry in response queue(address, length) pointing to that region.
