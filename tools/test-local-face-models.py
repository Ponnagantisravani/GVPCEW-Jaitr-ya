"""Real model smoke checks, plus rejection of no-face evidence. No camera claim."""
import base64,importlib.util,json,urllib.request
from pathlib import Path
import cv2,numpy as np
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('local_face',root/'tools'/'local-attendance-face-service.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
sample=root/'.tmp'/'opencv-lena.jpg'
image=sample.read_bytes() if sample.exists() else urllib.request.urlopen('https://raw.githubusercontent.com/opencv/opencv/master/samples/data/lena.jpg',timeout=30).read()
encoded='data:image/jpeg;base64,'+base64.b64encode(image).decode()
a,eyes=module.analyze(encoded);b,_=module.analyze(encoded)
assert len(a)==128 and np.isfinite(a).all() and abs(np.linalg.norm(a)-1)<0.00001
assert np.dot(a,b)>0.99
_,blank=cv2.imencode('.jpg',np.zeros((360,480,3),dtype=np.uint8))
try:module.analyze('data:image/jpeg;base64,'+base64.b64encode(blank).decode());raise AssertionError('Blank frame accepted')
except ValueError:pass
report={'real_models':True,'model':module.MODEL,'same_image_similarity':float(np.dot(a,b)),'no_face_rejected':True,'webcam_and_physical_blink':'pending user test'}
(root/'.tmp'/'local-face-model-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
