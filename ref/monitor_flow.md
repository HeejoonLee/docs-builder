# Monitor flow

* Poll CSR BUSY bit(of STATUS register)
* Timeout is implemented, so if timed out, set STOP CSR register.
* Otherwise, the busy bit will be 0 and the logic can move on.

* If the task required that responses in RM is required, it will also have indicated the indices. Copy them to tgtm_response area. Post an entry in response_queue pointing to that region.

* End the current task.