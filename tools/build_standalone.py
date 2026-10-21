from pathlib import Path
import base64
import re

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / 'src' / 'main.js'
# filter import and export
IMPORT = re.compile(r"^import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?\s*$", re.M)
EXPORTED_DECLARATION = re.compile(r'^export\s+(function|const|let|class)\s+(\w+)', re.M)
EXPORTED_LIST = re.compile(r'^export\s*\{([^}]+)\};?\s*$', re.M)

modules = {}
visited = set()

# recursion through all js files and append to standalone html
def make_module(source): 
    file_path = source.resolve()
    if file_path in visited:
        return
    visited.add(file_path)
    content = file_path.read_text(encoding='utf-8')
    imports = []
    for match in IMPORT.finditer(content):
        dependency = (file_path.parent / match.group(2)).resolve()
        if not dependency.is_relative_to(ROOT):
            raise ValueError(f'Out-of-project import: {dependency}')
        make_module(dependency)
        names = match.group(1).strip()
        imports.append(f'const {{{names}}} = modules[{str(dependency.relative_to(ROOT))!r}];')
    content = IMPORT.sub('', content)
    exports = []
    for match in EXPORTED_DECLARATION.finditer(content):
        exports.append(match.group(2))
    content = re.sub(r'^export\s+(?=(?:function|const|let|class)\s+)', '', content, flags=re.M)

    def extract_list(match):
        for name in match.group(1).split(','):
            exports.append(name.strip())
        return ''

    # turn assets into base64 encoding
    content = EXPORTED_LIST.sub(extract_list, content)
    for asset in sorted((ROOT / 'assets').rglob('*')):
        if not asset.is_file():
            continue
        ext = asset.suffix.lower()
        mime = {'.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}.get(ext)
        if mime:
            encoded = base64.b64encode(asset.read_bytes()).decode('ascii')
            content = content.replace(asset.relative_to(ROOT).as_posix(), f'data:{mime};base64,{encoded}')
    key = str(file_path.relative_to(ROOT))
    modules[key] = '(function(){\n' + '\n'.join(imports) + '\n' + content + '\nreturn {' + ','.join(exports) + '};\n})()'


make_module(ENTRY)
script = "const modules = Object.create(null);\n" + '\n'.join(f'modules[{name!r}] = {expression};' for name, expression in modules.items())
html = (ROOT / 'index.html').read_text(encoding='utf-8')
icon_path = ROOT / 'assets' / 'forge-anvil-dark-gold-v5142.ico'
icon_base64 = base64.b64encode(icon_path.read_bytes()).decode('ascii')
html = html.replace(
    'href="assets/forge-anvil-dark-gold-v5142.ico"',
    f'href="data:image/x-icon;base64,{icon_base64}"'
)
# append stylesheets
for link in re.findall(r'<link rel="stylesheet" href="([^"]+)">', html):
    content = (ROOT / link).read_text(encoding='utf-8')
    html = html.replace(f'<link rel="stylesheet" href="{link}">', '<style>\n'+content+'\n</style>')
html = html.replace('<script type="module" src="src/main.js"></script>','<script>\n'+script+'\n</script>')
output = ROOT / 'dist' / 'Gunters_Forge_V5_14_3_Standalone.html'
output.parent.mkdir(exist_ok=True, parents=True)
output.write_text(html, encoding='utf-8')
print(f'Built {output} from {len(modules)} ES modules')
