import {readFile,writeFile} from 'node:fs/promises';
const base=new URL('../node_modules/react-native-ble-advertiser/',import.meta.url);
const pkg=JSON.parse(await readFile(new URL('package.json',base),'utf8'));
if(pkg.version!=='0.0.17')throw new Error('Review the BLE compatibility patch before changing advertiser versions.');
await writeFile(new URL('android/build.gradle',base),`apply plugin: 'com.android.library'
android {
    namespace 'com.vitorpamplona.bleavertiser'
    compileSdkVersion rootProject.ext.compileSdkVersion
    defaultConfig { minSdkVersion 24; targetSdkVersion rootProject.ext.targetSdkVersion }
}
dependencies { implementation 'com.facebook.react:react-android' }
`);
const manifest=new URL('android/src/main/AndroidManifest.xml',base);
await writeFile(manifest,(await readFile(manifest,'utf8')).replace(/\s+package="[^"]*"/,''));
const file=new URL('android/src/main/java/com/vitorpamplona/bleadvertiser/BLEAdvertiserModule.java',base);
let source=await readFile(file,'utf8');
if(!source.includes('CAMPUS_BLE_PATCH_V1')) {
 if(!source.includes('dataBuilder.addServiceUuid(uuid);')||!source.includes('mAdvertiserList.containsKey(uid)'))throw new Error('Unexpected advertiser source. Review patch.');
 source=source.replace(/import com\.facebook\.systrace\.[^;]+;\n/g,'');
 source=source.replace('mObservedState = mBluetoothAdapter.isEnabled();','mObservedState = null; // Permissions are requested after login.');
 source=source.replace(/import com\.facebook\.react\.(ReactInstanceManager|ReactRootView|modules\.core\.DefaultHardwareBackBtnHandler|shell\.MainReactPackage);\n/g,'');
 source=source.replaceAll('mObservedState != null && !mObservedState','!mBluetoothAdapter.isEnabled()');
 source=source.replace('reactContext.registerReceiver(mReceiver, filter);','if (Build.VERSION.SDK_INT >= 33) reactContext.registerReceiver(mReceiver, filter, Context.RECEIVER_EXPORTED);\n        else reactContext.registerReceiver(mReceiver, filter);');
 // A fresh Promise callback for each rotation; upstream reused an already-resolved callback.
 source=source.replace('tempAdvertiser.stopAdvertising(tempCallback);','tempAdvertiser.stopAdvertising(tempCallback);\n            tempCallback = new BLEAdvertiserModule.SimpleAdvertiseCallback(promise);');
 source=source.replace('dataBuilder.addServiceUuid(uuid);','if (options == null || !options.hasKey("includeServiceUuid") || options.getBoolean("includeServiceUuid")) dataBuilder.addServiceUuid(uuid);');
 source=source.replace('return settingsBuilder.build();','if (options != null && options.hasKey("timeout")) settingsBuilder.setTimeout(Math.max(1, Math.min(10000, options.getInt("timeout"))));\n        return settingsBuilder.build();');
 // Native expiry/sign-out cleanup works even when JS is suspended or crashes.
 source=source.replace('    private byte[] toByteArray',`    // CAMPUS_BLE_PATCH_V1
    public static synchronized void stopAllAdvertising() {
        if (mAdvertiserList == null) return;
        for (String key : new ArrayList<String>(mAdvertiserList.keySet())) {
            BluetoothLeAdvertiser advertiser = mAdvertiserList.remove(key);
            AdvertiseCallback callback = mAdvertiserCallbackList.remove(key);
            try { if (advertiser != null && callback != null) advertiser.stopAdvertising(callback); } catch (SecurityException ignored) {}
        }
    }
    @Override public void invalidate() {
        stopAllAdvertising();
        try { getReactApplicationContext().unregisterReceiver(mReceiver); } catch (IllegalArgumentException ignored) {}
        super.invalidate();
    }
    private byte[] toByteArray`);
 source=source.replace('Log.w("BLEAdvertiserModule", "Scanned: " + result.toString());','// No scan-record/token logging.');
 await writeFile(file,source);
}
const types=new URL('index.d.ts',base);let declaration=await readFile(types,'utf8');
if(!declaration.includes('includeServiceUuid?')){declaration=declaration.replace('export interface BroadcastOptions {','export interface BroadcastOptions {\n    includeServiceUuid?: boolean;\n    timeout?: number;');await writeFile(types,declaration);}
console.log('Pinned BLE advertiser Android compatibility and bounded-packet patch verified.');
