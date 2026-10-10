package com.gvpcew.testing

import java.io.DataInputStream
import java.io.DataOutputStream

data class ReviewRequest(val operation: String, val classId: String = "", val requestId: String = "",
                         val studentId: String = "", val photo: ByteArray = byteArrayOf())
data class ReviewReply(val classId: String, val requestId: String = "", val studentId: String = "",
                       val status: String = "", val reviewedAt: Long = 0)

object ReviewWire {
    const val MAX_PHOTO = 600_000
    fun writeRequest(out: DataOutputStream, request: ReviewRequest) {
        require(request.photo.size <= MAX_PHOTO)
        out.writeInt(1); out.writeUTF(request.operation); out.writeUTF(request.classId)
        out.writeUTF(request.requestId); out.writeUTF(request.studentId)
        out.writeInt(request.photo.size); out.write(request.photo); out.flush()
    }
    fun readRequest(input: DataInputStream): ReviewRequest {
        require(input.readInt() == 1) { "Update both phones to the latest app." }
        val op = input.readUTF(); require(op in listOf("JOIN", "SUBMIT", "STATUS")) { "Unsupported request." }
        val classId = input.readUTF(); val requestId = input.readUTF(); val studentId = input.readUTF()
        require(classId.length <= 36 && requestId.length <= 36 && studentId.length <= 10) { "Invalid request." }
        val size = input.readInt(); require(size in 0..MAX_PHOTO && (op == "SUBMIT" || size == 0)) { "Invalid photo size." }
        val photo = ByteArray(size); input.readFully(photo)
        return ReviewRequest(op, classId, requestId, studentId, photo)
    }
    fun writeReply(out: DataOutputStream, reply: ReviewReply) {
        out.writeBoolean(true); out.writeUTF(reply.classId); out.writeUTF(reply.requestId)
        out.writeUTF(reply.studentId); out.writeUTF(reply.status); out.writeLong(reply.reviewedAt); out.flush()
    }
    fun writeError(out: DataOutputStream, message: String) { out.writeBoolean(false); out.writeUTF(message.take(500)); out.flush() }
    fun readReply(input: DataInputStream): ReviewReply {
        check(input.readBoolean()) { input.readUTF() }
        return ReviewReply(input.readUTF(), input.readUTF(), input.readUTF(), input.readUTF(), input.readLong())
    }
    fun reply(record: ReviewRecord) = ReviewReply(record.classId, record.requestId, record.studentId, record.status.name, record.reviewedAt)
}
