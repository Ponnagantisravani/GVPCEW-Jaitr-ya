import {readFile,writeFile} from 'node:fs/promises';
const base=new URL('../node_modules/@react-native/gradle-plugin/',import.meta.url),pkg=JSON.parse(await readFile(new URL('package.json',base),'utf8'));
if(pkg.version!=='0.85.3')throw new Error('Review the Foojay compatibility patch before changing React Native versions.');
const file=new URL('settings.gradle.kts',base),source=await readFile(file,'utf8');
const old='id("org.gradle.toolchains.foojay-resolver-convention").version("0.5.0")',next='id("org.gradle.toolchains.foojay-resolver-convention").version("1.0.0")';
if(source.includes(old)){await writeFile(file,source.replace(old,next));console.log('Applied upstream Foojay 1.0.0 fix for Gradle 9.');}
else if(!source.includes(next))throw new Error('Unexpected React Native Gradle plugin settings; review before building.');
