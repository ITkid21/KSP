import os
root = r'C:\Users\Atharva\AppData\Roaming\npm\node_modules\zcatalyst-cli\lib'
keywords = ['scripts', '.scripts', 'predeploy', 'preserve', 'build_command', 'buildCommand']
for dp, dns, fns in os.walk(root):
    for fn in fns:
        if fn.endswith(('.js','.ts','.json')):
            path = os.path.join(dp, fn)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    text = f.read()
            except Exception:
                continue
            for kw in keywords:
                if kw in text:
                    print(path + ':' + kw)
                    break
