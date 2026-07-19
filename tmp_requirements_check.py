from pathlib import Path
p = Path('ml-service/requirements.txt')
raw = p.read_bytes()
print(raw)
print('len', len(raw))
try:
    txt = raw.decode('utf-8')
    print(repr(txt))
except Exception as e:
    print('decode err', e)
print('nonprint:', [i for i,ch in enumerate(raw) if ch < 32 and ch not in (9,10,13)])
print('starts with BOM', raw[:3])
