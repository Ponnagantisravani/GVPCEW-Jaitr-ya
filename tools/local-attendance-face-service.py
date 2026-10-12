"""Loopback-only browser DEMO face comparison and heuristic blink check.
Not a production anti-spoofing verifier. No images are persisted.
"""
import base64,hmac,json,os,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import cv2
import numpy as np
cv2.setNumThreads(2)
MODELS=Path(__file__).resolve().parents[1]/'.tmp'/'local-face-models'
detector=cv2.FaceDetectorYN.create(str(MODELS/'face_detection_yunet_2023mar.onnx'),'',(480,360),0.85,0.3,5000)
recognizer=cv2.FaceRecognizerSF.create(str(MODELS/'face_recognition_sface_2021dec_int8.onnx'),'')
eyes=cv2.CascadeClassifier(cv2.data.haarcascades+'haarcascade_eye_tree_eyeglasses.xml')
lock=threading.Lock()
MODEL='opencv-sface-demo-v1'
def analyze(image,feature=True):
    if not isinstance(image,str) or not image.startswith('data:image/jpeg;base64,'):raise ValueError('Capture a JPEG camera frame.')
    raw=base64.b64decode(image.split(',',1)[1],validate=True)
    frame=cv2.imdecode(np.frombuffer(raw,np.uint8),cv2.IMREAD_COLOR)
    if frame is None or frame.shape[0]>720 or frame.shape[1]>960:raise ValueError('Invalid camera frame dimensions.')
    detector.setInputSize((frame.shape[1],frame.shape[0]));_,faces=detector.detect(frame)
    if faces is None or len(faces)!=1:raise ValueError('Exactly one face must stay visible. Improve lighting and retry.')
    f=faces[0];x,y,w,h=map(int,f[:4]);x=max(0,x);y=max(0,y)
    if min(w,h)<60:raise ValueError('Move closer to the camera.')
    crop=frame[y:min(frame.shape[0],y+h),x:min(frame.shape[1],x+w)]
    gray=cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY)
    eye_count=len(eyes.detectMultiScale(gray[:max(1,int(h*0.62))],scaleFactor=1.1,minNeighbors=5,minSize=(12,12)))
    vector=None
    if feature:
        aligned=recognizer.alignCrop(frame,f);v=recognizer.feature(aligned).reshape(-1);v=v/np.linalg.norm(v);vector=v.tolist()
    return vector,eye_count
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def reply(self,status,data):
        body=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_GET(self):
        if self.path=='/health':self.reply(200,{'ready':True,'model':MODEL,'blink':'heuristic demo only'})
        else:self.reply(404,{'message':'Not found'})
    def do_POST(self):
        key=os.environ.get('LOCAL_FACE_SERVICE_KEY','')
        if not key or not hmac.compare_digest(self.headers.get('X-Face-Service-Key',''),key):return self.reply(401,{'message':'Unauthorized'})
        length=int(self.headers.get('Content-Length','0'))
        if length<=0 or length>4000000:return self.reply(413,{'message':'Camera payload too large'})
        try:
            data=json.loads(self.rfile.read(length))
            with lock:
                if self.path=='/enroll':
                    v,_=analyze(data.get('image'));return self.reply(200,{'embedding':v,'model':MODEL,'faceCount':1})
                if self.path!='/verify':return self.reply(404,{'message':'Not found'})
                frames=data.get('frames');reference=np.asarray(data.get('reference',[]),dtype=np.float32)
                if not isinstance(frames,list) or not 15<=len(frames)<=40 or reference.shape!=(128,) or not np.isfinite(reference).all():raise ValueError('Invalid face verification evidence.')
                state='open';blink=False;scores=[]
                for i,image in enumerate(frames):
                    v,n=analyze(image,feature=i in (0,len(frames)//2,len(frames)-1))
                    if v is not None:scores.append(float(np.dot(np.asarray(v),reference)))
                    if state=='open' and n>=2:state='close'
                    elif state=='close' and n==0:state='reopen'
                    elif state=='reopen' and n>=2:blink=True
                similarity=min(scores)
                if similarity<0.363:raise ValueError('Face does not match your saved local reference.')
                if not blink:raise ValueError('Blink was not detected. Look straight ahead, blink once slowly, then open both eyes.')
                return self.reply(200,{'identityVerified':True,'blinkObserved':True,'similarity':similarity,'model':MODEL,'antiSpoofingVerified':False})
        except (ValueError,TypeError,KeyError):return self.reply(422,{'message':str(__import__('sys').exc_info()[1])})
        except Exception:return self.reply(503,{'message':'Local face analysis failed. Retry with good lighting.'})
if __name__=='__main__':
    print('Local DEMO face service on 127.0.0.1:5002; heuristic blink, no anti-spoofing guarantee',flush=True)
    ThreadingHTTPServer(('127.0.0.1',5002),Handler).serve_forever()
