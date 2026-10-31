# Generates original placeholder artwork (no third-party assets) for each practice category.
# Run: python3 scripts/make-placeholders.py  → web/public/placeholders/*.svg
import os
OUT = 'web/public/placeholders'
FIG = '#FBF6EC'

def svg(name, top, bottom, body, extra_defs=''):
    s = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient>{extra_defs}</defs>
<rect width="1200" height="900" fill="url(#g)"/>
<circle cx="930" cy="230" r="210" fill="#fff" opacity="0.13"/>
<path d="M-40 600 C 220 470, 420 760, 700 600 S 1100 470, 1260 560" fill="none" stroke="#fff" stroke-width="7" opacity="0.28"/>
<path d="M-40 680 C 260 560, 460 840, 760 690 S 1120 560, 1260 650" fill="none" stroke="#fff" stroke-width="4" opacity="0.2"/>
{body}
</svg>'''
    open(os.path.join(OUT, name + '.svg'), 'w').write(s)

def figure(head, lines, faint=(), extra=''):
    out = [f'<g fill="none" stroke="{FIG}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round">']
    for pts in faint:
        out.append(f'<polyline opacity="0.55" points="{" ".join(f"{x},{y}" for x, y in pts)}"/>')
    for pts in lines:
        out.append(f'<polyline points="{" ".join(f"{x},{y}" for x, y in pts)}"/>')
    out.append('</g>')
    out.append(f'<circle cx="{head[0]}" cy="{head[1]}" r="36" fill="{FIG}"/>')
    out.append(extra)
    return '\n'.join(out)

ground = '<line x1="160" y1="712" x2="1040" y2="712" stroke="#fff" stroke-width="6" opacity="0.35" stroke-linecap="round"/>'
mat = '<rect x="250" y="700" width="700" height="24" rx="12" fill="#fff" opacity="0.32"/>'

svg('strength', '#DCC8A8', '#B48A66', ground + figure((612, 318),
    [[(606, 362), (572, 516)], [(572, 516), (690, 538), (668, 690), (708, 696)], [(604, 386), (656, 462), (648, 420)]],
    faint=[[(562, 516), (668, 556), (642, 690), (680, 696)]],
    extra='<circle cx="672" cy="438" r="34" fill="#4E4A42" opacity="0.85"/><path d="M650 410 a22 22 0 0 1 44 0" fill="none" stroke="#4E4A42" stroke-width="10" opacity="0.85"/>'))
svg('yoga', '#D3DCC7', '#8EA281', mat + figure((600, 236),
    [[(600, 280), (600, 478)], [(600, 478), (602, 696), (636, 700)], [(600, 478), (692, 540), (610, 586)],
     [(600, 300), (514, 214), (600, 118)], [(600, 300), (686, 214), (600, 118)]]))
svg('pilates', '#EDD7CB', '#C7A395', mat + figure((424, 426),
    [[(566, 668), (452, 474)], [(566, 668), (770, 470)], [(462, 494), (648, 424)]],
    faint=[[(566, 668), (756, 494)]]))
svg('running', '#ECD3A4', '#C4965A', ground + figure((648, 254),
    [[(636, 298), (592, 460)], [(592, 460), (684, 532), (664, 640), (700, 652)], [(592, 460), (540, 580), (452, 604)],
     [(628, 322), (684, 384), (726, 340)], [(628, 322), (562, 384), (528, 446)]]))
svg('mobility', '#D5DFCD', '#97AB8B', ground + figure((664, 404),
    [[(592, 604), (652, 452)], [(592, 604), (724, 560), (724, 694)], [(592, 604), (440, 682), (330, 694)],
     [(650, 470), (642, 272)], [(650, 470), (690, 600), (676, 690)]]))
svg('flexibility', '#E4D8DC', '#B39FAA', mat + figure((664, 566),
    [[(432, 664), (812, 672), (824, 636)], [(432, 664), (620, 566)], [(606, 578), (786, 640)]]))
svg('functional', '#BDCAB2', '#6E8463', ground + figure((842, 512),
    [[(296, 690), (560, 618), (786, 556)], [(786, 556), (794, 694)]],
    faint=[[(770, 562), (760, 694)]]))

# Sea: rest days and introductory screens (no figure)
open(os.path.join(OUT, 'sea.svg'), 'w').write('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6E9D6"/><stop offset="1" stop-color="#EFCFAF"/></linearGradient>
<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93BCB8"/><stop offset="1" stop-color="#557F86"/></linearGradient></defs>
<rect width="1200" height="900" fill="url(#sky)"/>
<circle cx="820" cy="470" r="110" fill="#F4C98E" opacity="0.95"/>
<rect y="540" width="1200" height="360" fill="url(#sea)"/>
<g fill="none" stroke="#fff" stroke-linecap="round" opacity="0.45">
<path d="M80 610 C 200 590, 300 630, 420 610" stroke-width="5"/><path d="M620 640 C 760 615, 880 665, 1020 640" stroke-width="5"/>
<path d="M200 720 C 360 690, 520 750, 700 720" stroke-width="6"/><path d="M760 800 C 900 775, 1040 825, 1180 800" stroke-width="6"/>
<path d="M700 560 C 760 552, 880 552, 940 560" stroke-width="4" stroke="#F4C98E" opacity="0.9"/></g>
<path d="M-40 300 C 260 200, 520 380, 820 250 S 1180 180, 1260 230" fill="none" stroke="#fff" stroke-width="6" opacity="0.35"/>
</svg>''')

# Dish placeholder: a bowl (stands in until the real dish photo is uploaded)
open(os.path.join(OUT, 'recipe.svg'), 'w').write('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="g" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#F3E7D3"/><stop offset="1" stop-color="#DCC29E"/></linearGradient></defs>
<rect width="1200" height="900" fill="url(#g)"/>
<path d="M-40 760 C 260 660, 520 860, 820 740 S 1180 680, 1260 720" fill="none" stroke="#fff" stroke-width="6" opacity="0.3"/>
<ellipse cx="600" cy="690" rx="300" ry="34" fill="#8A7558" opacity="0.18"/>
<path d="M330 470 Q 340 680 600 690 Q 860 680 870 470 Z" fill="#FBF6EC"/>
<ellipse cx="600" cy="470" rx="270" ry="58" fill="#E9D7B8"/>
<g fill="#C9A46B"><circle cx="500" cy="462" r="16"/><circle cx="540" cy="478" r="14"/><circle cx="640" cy="458" r="15"/><circle cx="690" cy="480" r="13"/><circle cx="580" cy="452" r="12"/></g>
<g fill="#7E4A5A"><circle cx="610" cy="472" r="14"/><circle cx="655" cy="447" r="12"/><circle cx="525" cy="446" r="12"/></g>
<path d="M720 440 C 760 400, 810 410, 820 440 C 790 460, 750 460, 720 440 Z" fill="#7E9471"/>
<path d="M420 300 C 400 260, 440 240, 420 200 M600 280 C 580 240, 620 220, 600 180 M780 300 C 760 260, 800 240, 780 200" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity="0.6"/>
</svg>''')
print('ok')
