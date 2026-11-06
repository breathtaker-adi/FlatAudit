import cv2
import numpy as np

orig = cv2.imread(r'C:/Users/adity/FlatAudit/shield_crop.png')
rgb = cv2.cvtColor(orig, cv2.COLOR_BGR2RGB)

blue_mask = ((rgb[:,:,2] > 180) & (rgb[:,:,0] < 80) & (rgb[:,:,1] < 100)).astype(np.uint8) * 255
white_mask = ((rgb[:,:,0] > 200) & (rgb[:,:,1] > 200) & (rgb[:,:,2] > 200)).astype(np.uint8) * 255

def mask_to_svg_paths(mask, epsilon=0.8):
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_TC89_KCOS)
    path_strs = []
    if hierarchy is None: return ''
    
    for i in range(len(contours)):
        if hierarchy[0][i][3] != -1:
            continue
        c = contours[i]
        if cv2.contourArea(c) < 20: continue
        approx = cv2.approxPolyDP(c, epsilon, True)
        pts = approx.reshape(-1, 2)
        d = f'M {pts[0][0]} {pts[0][1]} ' + ' '.join([f'L {p[0]} {p[1]}' for p in pts[1:]]) + ' Z'
        
        child_idx = hierarchy[0][i][2]
        while child_idx != -1:
            child_c = contours[child_idx]
            if cv2.contourArea(child_c) >= 15:
                child_approx = cv2.approxPolyDP(child_c, epsilon, True)
                c_pts = child_approx.reshape(-1, 2)
                d += f' M {c_pts[0][0]} {c_pts[0][1]} ' + ' '.join([f'L {p[0]} {p[1]}' for p in c_pts[1:]]) + ' Z'
            child_idx = hierarchy[0][child_idx][0]
        
        path_strs.append(d)
    return ' '.join(path_strs)

blue_svg = mask_to_svg_paths(blue_mask, epsilon=0.7)
white_svg = mask_to_svg_paths(white_mask, epsilon=0.7)

svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 310 335" width="310" height="335" fill="none">
  <path fill="#0B36FE" fill-rule="evenodd" d="{blue_svg}"/>
  <path fill="#FFFFFF" fill-rule="evenodd" d="{white_svg}"/>
</svg>'''

with open(r'C:/Users/adity/FlatAudit/shield_traced.svg', 'w') as f:
    f.write(svg_content)
print('Wrote shield_traced.svg successfully. Size:', len(svg_content))

