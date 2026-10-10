package com.gvpcew.testing

import org.junit.Assert.*
import org.junit.Test
import java.io.*

class ReviewWireTest {
    private fun encoded(action: (DataOutputStream) -> Unit): DataInputStream {
        val bytes = ByteArrayOutputStream(); action(DataOutputStream(bytes))
        return DataInputStream(ByteArrayInputStream(bytes.toByteArray()))
    }
    @Test fun binaryPhotoRoundTripsWithoutTextEncodingLoss() {
        val bytes = ByteArray(20000) { (it % 256).toByte() }
        val input = encoded { ReviewWire.writeRequest(it, ReviewRequest("SUBMIT", "class", "request", "S1", bytes)) }
        val request = ReviewWire.readRequest(input)
        assertEquals("S1", request.studentId); assertArrayEquals(bytes, request.photo)
    }
    @Test fun markedAndPendingRepliesStayDistinct() {
        for (status in ReviewStatus.entries) {
            val reply = ReviewReply("class", "request", "S1", status.name, if (status == ReviewStatus.PENDING) 0L else 123L)
            assertEquals(reply, ReviewWire.readReply(encoded { ReviewWire.writeReply(it, reply) }))
        }
    }
    @Test(expected = IllegalArgumentException::class) fun remoteApprovalOperationIsRejected() {
        ReviewWire.readRequest(encoded { ReviewWire.writeRequest(it, ReviewRequest("ACCEPT")) })
    }
    @Test(expected = IllegalArgumentException::class) fun oversizedPayloadRejectedBeforeAllocation() {
        ReviewWire.readRequest(encoded {
            it.writeInt(1); it.writeUTF("SUBMIT"); it.writeUTF(""); it.writeUTF(""); it.writeUTF("S1"); it.writeInt(Int.MAX_VALUE)
        })
    }
    @Test(expected = EOFException::class) fun interruptedPhotoIsNotACompleteSubmission() {
        ReviewWire.readRequest(encoded {
            it.writeInt(1); it.writeUTF("SUBMIT"); it.writeUTF(""); it.writeUTF(""); it.writeUTF("S1"); it.writeInt(100); it.writeByte(1)
        })
    }
    @Test(expected = IllegalStateException::class) fun failedDeliveryNeverBecomesReceipt() {
        ReviewWire.readReply(encoded { ReviewWire.writeError(it, "Class closed") })
    }
}
