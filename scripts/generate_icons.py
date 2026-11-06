import cv2
import numpy as np
import subprocess
import os
import shutil

full = cv2.imread(r'C:/Users/adity/FlatAudit/full_logo_crop.png')
rgb = cv2.cvtColor(full, cv2.COLOR_BGR2RGB)

blue_mask_full = ((rgb[:,:,2] > 180) & (rgb[:,:,0] < 80) & (rgb[:,:,1] < 100)).astype(np.uint8) * 255
white_mask_full = ((rgb[:,:,0] > 200) & (rgb[:,:,1] > 200) & (rgb[:,:,2] > 200)).astype(np.uint8) * 255

# Shield-only masks (y < 340)
blue_mask_shield = blue_mask_full.copy()
blue_mask_shield[340:, :] = 0

white_mask_shield = white_mask_full.copy()
white_mask_shield[340:, :] = 0

def mask_to_svg_paths(mask, epsilon=0.6):
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_TC89_KCOS)
    path_strs = []
    if hierarchy is None: return ''
    
    for i in range(len(contours)):
        if hierarchy[0][i][3] != -1: # skip child contours
            continue
        c = contours[i]
        if cv2.contourArea(c) < 15: continue
        approx = cv2.approxPolyDP(c, epsilon, True)
        pts = approx.reshape(-1, 2)
        d = f'M {pts[0][0]} {pts[0][1]} ' + ' '.join([f'L {p[0]} {p[1]}' for p in pts[1:]]) + ' Z'
        
        child_idx = hierarchy[0][i][2]
        while child_idx != -1:
            child_c = contours[child_idx]
            if cv2.contourArea(child_c) >= 12:
                child_approx = cv2.approxPolyDP(child_c, epsilon, True)
                c_pts = child_approx.reshape(-1, 2)
                d += f' M {c_pts[0][0]} {c_pts[0][1]} ' + ' '.join([f'L {p[0]} {p[1]}' for p in c_pts[1:]]) + ' Z'
            child_idx = hierarchy[0][child_idx][0]
        
        path_strs.append(d)
    return ' '.join(path_strs)

# Generate paths
blue_shield_paths = mask_to_svg_paths(blue_mask_shield, epsilon=0.5)
white_shield_paths = mask_to_svg_paths(white_mask_shield, epsilon=0.5)

blue_full_paths = mask_to_svg_paths(blue_mask_full, epsilon=0.5)
white_full_paths = mask_to_svg_paths(white_mask_full, epsilon=0.5)

# 1. Square Shield Emblem SVG
# Center: cx=203.5, cy=169.5. Size=350.
vx = 28
vy = -6
v_size = 350

icon_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx} {vy} {v_size} {v_size}" width="100%" height="100%" fill="none">
  <!-- FlatAudit Verified Shield Emblem -->
  <path fill="#0B36FE" fill-rule="evenodd" d="{blue_shield_paths}"/>
  <path fill="#FFFFFF" fill-rule="evenodd" d="{white_shield_paths}"/>
</svg>'''

with open(r'C:/Users/adity/FlatAudit/extension/icons/logo.svg', 'w', encoding='utf-8') as f:
    f.write(icon_svg)

with open(r'C:/Users/adity/FlatAudit/web-demo/logo.svg', 'w', encoding='utf-8') as f:
    f.write(icon_svg)

# 2. Full Lockup SVG (Shield + "FlatAudit" text)
full_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 430" width="100%" height="100%" fill="none">
  <!-- FlatAudit Brand Identity Lockup -->
  <path fill="#0B36FE" fill-rule="evenodd" d="{blue_full_paths}"/>
  <path fill="#FFFFFF" fill-rule="evenodd" d="{white_full_paths}"/>
</svg>'''

with open(r'C:/Users/adity/FlatAudit/extension/icons/logo-full.svg', 'w', encoding='utf-8') as f:
    f.write(full_svg)

with open(r'C:/Users/adity/FlatAudit/web-demo/logo-full.svg', 'w', encoding='utf-8') as f:
    f.write(full_svg)

print('Wrote clean SVG assets (emblem and full lockup)')

# 3. Render raster icons (16, 32, 48, 128, 256, 512)
chrome_path = r'C:\Program Files\Google\Chrome\Application\chrome.exe'

for icon_size in [16, 32, 48, 128, 256, 512]:
    render_html = f'''<!DOCTYPE html>
<html>
<head>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ width: {icon_size}px; height: {icon_size}px; overflow: hidden; background: transparent; display: flex; align-items: center; justify-content: center; }}
  svg {{ width: 100%; height: 100%; }}
</style>
</head>
<body>
  {icon_svg}
</body>
</html>'''
    temp_html_path = rf'C:\Users\adity\FlatAudit\temp_icon_{icon_size}.html'
    png_path = rf'C:\Users\adity\FlatAudit\extension\icons\icon{icon_size}.png'
    with open(temp_html_path, 'w', encoding='utf-8') as f:
        f.write(render_html)
    
    cmd = [
        chrome_path,
        '--headless=new',
        '--disable-gpu',
        f'--screenshot={png_path}',
        f'--window-size={icon_size},{icon_size}',
        '--default-background-color=00000000',
        temp_html_path
    ]
    subprocess.run(cmd, capture_output=True, text=True)
    if os.path.exists(temp_html_path):
        os.remove(temp_html_path)
    
    # Also copy to web-demo
    dst = rf'C:\Users\adity\FlatAudit\web-demo\icon{icon_size}.png'
    shutil.copy2(png_path, dst)
    print(f'Rendered icon{icon_size}.png ({icon_size}x{icon_size})')

# 4. Also render a social banner / hero asset for README & web-demo
banner_html = f'''<!DOCTYPE html>
<html>
<head>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ 
    width: 1024px; 
    height: 512px; 
    background: #2a3547; 
    display: flex; 
    align-items: center; 
    justify-content: center; 
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
  }}
  .card {{
    width: 384px;
    height: 430px;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
</style>
</head>
<body>
  <div class="card">
    {full_svg}
  </div>
</body>
</html>'''

with open(r'C:\Users\adity\FlatAudit\temp_banner.html', 'w', encoding='utf-8') as f:
    f.write(banner_html)

banner_png = r'C:\Users\adity\FlatAudit\docs\flataudit-banner.png'
cmd_banner = [
    chrome_path,
    '--headless=new',
    '--disable-gpu',
    f'--screenshot={banner_png}',
    '--window-size=1024,512',
    '--default-background-color=2a3547',
    r'C:\Users\adity\FlatAudit\temp_banner.html'
]
subprocess.run(cmd_banner, capture_output=True, text=True)
if os.path.exists(r'C:\Users\adity\FlatAudit\temp_banner.html'):
    os.remove(r'C:\Users\adity\FlatAudit\temp_banner.html')
print('Rendered docs/flataudit-banner.png for GitHub and docs')
