package com.gvpcew.testing

/** A test access signal, not a signed classroom credential or proof of presence. */
object ClassroomSignal {
    // Versioned marker outside the valid student-ID alphabet.
    fun classroomPayload(): ByteArray = byteArrayOf(0, 1, 67, 76, 65, 83, 83)
    fun isClassroom(bytes: ByteArray?): Boolean = bytes?.contentEquals(classroomPayload()) == true
    fun encode(studentId: String): ByteArray {
        require(StudentId.valid(studentId))
        return studentId.toByteArray(Charsets.US_ASCII)
    }
    fun matches(bytes: ByteArray?, studentId: String): Boolean =
        StudentId.valid(studentId) && bytes != null && bytes.contentEquals(encode(studentId))
}
