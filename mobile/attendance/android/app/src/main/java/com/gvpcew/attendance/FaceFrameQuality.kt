package com.gvpcew.attendance
import android.graphics.Bitmap

object FaceFrameQuality {
    fun accepts(bitmap: Bitmap): Boolean {
        val pixels=IntArray(112*112);bitmap.getPixels(pixels,0,112,0,0,112,112)
        fun gray(i: Int): Double { val p=pixels[i];return 0.299*((p shr 16)and 255)+0.587*((p shr 8)and 255)+0.114*(p and 255) }
        var total=0.0;var sq=0.0;var count=0
        for(y in 2..109 step 2)for(x in 2..109 step 2) { val i=y*112+x;val g=gray(i);total+=g;val lap=4*g-gray(i-1)-gray(i+1)-gray(i-112)-gray(i+112);sq+=lap*lap;count++ }
        val brightness=total/count
        return brightness in 35.0..220.0 && sq/count>30
    }
}
