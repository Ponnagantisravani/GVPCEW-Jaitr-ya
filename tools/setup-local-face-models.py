"""Download official OpenCV Zoo models and verify their Git LFS SHA-256."""
import hashlib,json,re,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'.tmp'/'local-face-models'
root.mkdir(parents=True,exist_ok=True)
files=['face_detection_yunet/face_detection_yunet_2023mar.onnx','face_recognition_sface/face_recognition_sface_2021dec_int8.onnx']
manifest=[]
for name in files:
    pointer=urllib.request.urlopen('https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/'+name,timeout=30).read().decode()
    sha=re.search(r'oid sha256:([a-f0-9]{64})',pointer).group(1)
    size=int(re.search(r'size (\d+)',pointer).group(1));target=root/Path(name).name
    if not target.exists() or target.stat().st_size!=size or hashlib.sha256(target.read_bytes()).hexdigest()!=sha:
        print('Downloading '+target.name,flush=True)
        with urllib.request.urlopen('https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/'+name,timeout=120) as response,open(target.with_suffix('.partial'),'wb') as output:
            while True:
                data=response.read(1024*1024)
                if not data:break
                output.write(data)
        partial=target.with_suffix('.partial')
        if partial.stat().st_size!=size or hashlib.sha256(partial.read_bytes()).hexdigest()!=sha:raise RuntimeError('Model checksum mismatch')
        partial.replace(target)
    manifest.append({'file':target.name,'sha256':sha,'bytes':size,'source':'https://github.com/opencv/opencv_zoo/tree/main/models/'+name.split('/')[0]})
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Face models verified',flush=True)
