import {NativeModules,Platform} from 'react-native';
import {campusFace} from '../src/native';
import {MODEL,MODEL_SHA256} from '../src/enrollmentPolicy';
const capture=jest.fn();
beforeEach(()=>{Object.defineProperty(Platform,'OS',{value:'android',configurable:true});NativeModules.CampusNative={captureAttendance:capture};capture.mockReset();});
const payload=()=>({embedding_model:MODEL,model_sha256:MODEL_SHA256,embedding:Array.from({length:192},(_,i)=>i===0?1:0),sample_count:3,liveness_result:true,challenge_type:'blink'});
test('attendance uses the enrollment model and returns numeric template without a photo',async()=>{capture.mockResolvedValue(JSON.stringify(payload()));const result=await campusFace.capture('blink',5000);expect(result.embedding.length).toBe(192);expect(result.model_sha256).toBe(MODEL_SHA256);expect('preview' in result).toBe(false);expect(capture).toHaveBeenCalledWith('blink',5000);});
test('camera bridge rejects false liveness, wrong model, wrong challenge, invalid vectors and photo fields',async()=>{
 for(const patch of [{liveness_result:false},{embedding_model:'old-model'},{model_sha256:'wrong'},{challenge_type:'smile'},{embedding:Array(128).fill(1)},{embedding:Array(192).fill(0)},{sample_count:1},{preview:'data:image/jpeg;base64,photo'}]){capture.mockResolvedValue(JSON.stringify({...payload(),...patch}));await expect(campusFace.capture('blink',5000)).rejects.toThrow('incomplete');}
});
