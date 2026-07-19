import os
root = r'C:\Users\Atharva\AppData\Roaming\npm\node_modules\zcatalyst-cli'
keywords = ['predeploy', 'preserve', 'scripts', 'script']
for dp, dns, fns in os.walk(root):
    for fn in fns:
        if fn.endswith(('.js', '.ts', '.json')):
            path = os.path.join(dp, fn)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    txt = f.read()
            except Exception:
                continue
            if any(kw in txt for kw in keywords):
                print(path)
