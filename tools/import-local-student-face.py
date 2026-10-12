"""Build a numeric SFace reference for the user-specified local demo account."""
import base64,json,runpy
from pathlib import Path
import cv2
import numpy as np
root=Path(__file__).resolve().parents[1]
service=runpy.run_path(str(root/'tools'/'local-attendance-face-service.py'))
vectors=[];rejected=[]
for path in sorted((root/'datasets'/'324103210170').glob('*.jpg')):
    frame=cv2.imread(str(path))
    if frame is None: rejected.append(path.name);continue
    h,w=frame.shape[:2];scale=min(1,960/w,720/h)
    if scale<1:frame=cv2.resize(frame,(int(w*scale),int(h*scale)))
    ok,jpeg=cv2.imencode('.jpg',frame)
    try:
        v,_=service['analyze']('data:image/jpeg;base64,'+base64.b64encode(jpeg).decode())
        vectors.append(np.asarray(v,dtype=np.float32))
    except ValueError:rejected.append(path.name)
if len(vectors)<3:raise ValueError('At least three usable single-face photos are required.')
template=np.mean(vectors,axis=0);norm=np.linalg.norm(template)
if not np.isfinite(norm) or norm<1e-8:raise ValueError('Invalid averaged template.')
template=template/norm
minimum=float(min(np.dot(v,template) for v in vectors))
if minimum<0.363:raise ValueError('Dataset photos are inconsistent; review them before assignment.')
result={'roll_number':'324103210170','model':service['MODEL'],'embedding':template.tolist(),'usable_photos':len(vectors),'rejected_files':rejected,'minimum_template_similarity':minimum}
(root/'.tmp'/'student-324103210170-template.json').write_text(json.dumps(result))
print(json.dumps({k:v for k,v in result.items() if k!='embedding'}))
