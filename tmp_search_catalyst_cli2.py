import os
root = r'C:\Users\Atharva\AppData\Roaming\npm\node_modules\zcatalyst-cli\lib'
keywords = ['requirements.txt', 'pip install', 'pip-install', 'install -r', 'python -m pip', 'pip3', 'venv', 'build_command', 'buildCommand']
for dp, dns, fns in os.walk(root):
    for fn in fns:
        if fn.endswith(('.js','.ts','.json')):
            path = os.path.join(dp, fn)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    lines = f.readlines()
            except Exception:
                continue
            for i, line in enumerate(lines, 1):
                for kw in keywords:
                    if kw in line:
                        print(f'{path}:{i}:{line.strip()}')
                        break
