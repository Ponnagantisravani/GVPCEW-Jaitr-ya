package com.gvpcew.attendance

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class CampusNativePackage : ReactPackage {
    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(CampusNativeModule(context))
    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*,*>> = emptyList()
}
