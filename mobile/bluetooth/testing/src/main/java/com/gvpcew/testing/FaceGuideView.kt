package com.gvpcew.testing

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.View
import kotlin.math.min

class FaceGuideView(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    var ready = false
        set(value) { if (field != value) { field = value; invalidate() } }
    val guide: FaceBox get() {
        val w = min(width * .78f, height * .82f * .76f)
        val h = w / .76f
        return FaceBox((width - w) / 2, (height - h) / 2, (width + w) / 2, (height + h) / 2)
    }
    init { importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO }
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val box = guide
        val oval = RectF(box.left, box.top, box.right, box.bottom)
        val mask = Path().apply {
            fillType = Path.FillType.EVEN_ODD
            addRect(0f, 0f, width.toFloat(), height.toFloat(), Path.Direction.CW)
            addOval(oval, Path.Direction.CW)
        }
        paint.style = Paint.Style.FILL; paint.color = 0x880C1925.toInt()
        canvas.drawPath(mask, paint)
        paint.style = Paint.Style.STROKE; paint.strokeWidth = resources.displayMetrics.density * 3
        paint.color = if (ready) Color.rgb(100, 235, 181) else Color.WHITE
        canvas.drawOval(oval, paint)
    }
}
