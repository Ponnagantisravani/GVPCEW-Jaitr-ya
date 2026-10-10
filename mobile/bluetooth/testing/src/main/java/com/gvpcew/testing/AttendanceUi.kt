package com.gvpcew.testing

import android.app.Activity
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.button.MaterialButton

/** Small shared view vocabulary; existing diagnostic screens keep their implementation. */
object AttendanceUi {
    val ink = Color.rgb(25, 39, 58)
    val muted = Color.rgb(85, 103, 115)
    val teal = Color.rgb(0, 105, 92)
    val background = Color.rgb(245, 247, 246)
    val error = Color.rgb(160, 47, 41)
    fun dp(context: Context, value: Int) = (value * context.resources.displayMetrics.density).toInt()
    fun shape(context: Context, color: Int, radius: Int = 20) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(context, radius).toFloat()
    }
    fun page(activity: Activity, title: String, subtitle: String, back: (() -> Unit)? = null): LinearLayout {
        val body = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(context, 24), dp(context, 20), dp(context, 24), dp(context, 28))
        }
        val scroll = ScrollView(activity).apply {
            setBackgroundColor(AttendanceUi.background); isFillViewport = true; addView(body)
        }
        activity.setContentView(scroll)
        ViewCompat.setOnApplyWindowInsetsListener(scroll) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom); insets
        }
        if (back != null) button(body, "Back", false, back)
        text(body, "GVPCEW  /  ATTENDANCE", 12f, teal, true)
        text(body, title, 28f, ink, true)
        text(body, subtitle, 15f, muted)
        gap(body, 14)
        return body
    }
    fun text(parent: LinearLayout, value: String, size: Float = 16f, color: Int = ink, bold: Boolean = false): TextView =
        TextView(parent.context).apply {
            text = value; textSize = size; setTextColor(color)
            if (bold) setTypeface(null, Typeface.BOLD)
            setPadding(0, dp(context, 5), 0, dp(context, 5))
            setLineSpacing(dp(context, 3).toFloat(), 1f)
            parent.addView(this, LinearLayout.LayoutParams(-1, -2))
        }
    fun button(parent: LinearLayout, label: String, primary: Boolean = true, action: () -> Unit): MaterialButton =
        MaterialButton(parent.context).apply {
            text = label; isAllCaps = false; textSize = 16f; cornerRadius = dp(context, 14)
            minHeight = dp(context, 56)
            backgroundTintList = ColorStateList(arrayOf(intArrayOf(-android.R.attr.state_enabled), intArrayOf()),
                intArrayOf(Color.rgb(220, 226, 223), if (primary) teal else Color.rgb(230, 239, 235)))
            setTextColor(if (primary) Color.WHITE else teal)
            setOnClickListener { action() }
            parent.addView(this, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(context, 8) })
        }
    fun card(parent: LinearLayout): LinearLayout = LinearLayout(parent.context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(context, 20), dp(context, 16), dp(context, 20), dp(context, 18))
        background = shape(context, Color.WHITE)
        parent.addView(this, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(context, 16) })
    }
    fun gap(parent: LinearLayout, height: Int) { parent.addView(View(parent.context), LinearLayout.LayoutParams(1, dp(parent.context, height))) }
}
