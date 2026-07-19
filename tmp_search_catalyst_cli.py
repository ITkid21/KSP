import os
root = r'C:\Users\Atharva\AppData\Roaming\npm\node_modules\zcatalyst-cli'
keywords = ['build_command','buildCommand','build_path','buildPath','requirements.txt','python_3_10','python3','python']
for dp, dns, fns in os.walk(root):
    for fn in fns:
        if fn.endswith(('.js', '.ts', '.json')):
            path = os.path.join(dp, fn)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    txt = f.read()
            except Exception:
                continue
            for kw in keywords:
                if kw in txt:
                    print(path + ':' + kw)
                    break
