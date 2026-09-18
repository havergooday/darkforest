"""사진 여러 장 → 도트 카드 한 벌 + 스프라이트 시트.

    python tools/make_cards.py photos/ --out cards/ --colors 48 --border 5

무엇을 하는가

    자르기 → 언샵 → 축소 → 대비·채도 보정 → 공통 팔레트로 양자화
                                        → 원색 테두리 → PNG-8

왜 이 순서인가 (실제로 걸렸던 것들)

    * 카드 비율로 먼저 자른다. 전신 사진을 그대로 96px 로 줄이면 흰 덩어리가 된다.
      얼굴은 대개 위쪽에 있으므로 세로 중심을 --focus 로 위로 당긴다.
    * 언샵은 축소 '전'에. 축소 후에 걸면 픽셀 노이즈만 튄다.
    * 축소는 BOX(면적 평균). LANCZOS 는 사진에서 링잉이 생긴다.
    * 대비·채도는 축소 '후'에. 축소는 평균이라 색이 흐려지므로 작아진 뒤 올려야
      그 색이 팔레트에 살아남는다.
    * 팔레트는 모든 사진을 합쳐 한 번만 뽑고 전부 거기에 매핑한다. 장마다 따로
      뽑으면 조명·배경이 달라 카드가 제각각 놀고 한 벌로 안 보인다.
    * 양자화는 MEDIANCUT. MAXCOVERAGE 는 소수색을 엉뚱한 곳에 배정한다.
    * 디더링은 기본 끔. 도트에서는 배경에 먼지 뿌린 것처럼 보인다.
    * 테두리 색은 사진 팔레트와 '따로' 잡는다. 같이 양자화하면 원색이 뭉개지고
      사진이 쓸 색도 그만큼 줄어든다.
"""
import argparse
import colorsys
import os
import sys
from PIL import Image, ImageEnhance, ImageFilter

try:
    import cv2
    import numpy as np
    HAVE_CV = True
except ImportError:
    HAVE_CV = False

EXTS = ('.jpg', '.jpeg', '.png', '.webp', '.bmp')
DEFAULT_MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'yunet.onnx')
DETECT_WIDTH = 1200      # 4000px 원본 그대로 검출하면 느리다. 줄여서 찾고 좌표만 되돌린다

# 눈으로 갈리는 순서로 손봐 둔 원색 12가지. 이보다 많으면 색상환을 균등 분할한다.
BORDER_COLORS = [
    (0xE5, 0x48, 0x4D),  # 빨강
    (0x00, 0x91, 0xFF),  # 파랑
    (0xFF, 0xB2, 0x24),  # 노랑
    (0x46, 0xA7, 0x58),  # 초록
    (0xE9, 0x3D, 0x82),  # 분홍
    (0x12, 0xA5, 0x94),  # 청록
    (0xF7, 0x6B, 0x15),  # 주황
    (0x8E, 0x4E, 0xC6),  # 보라
    (0x3E, 0x63, 0xDD),  # 남색
    (0xA5, 0xC6, 0x1A),  # 연두
    (0x00, 0xA2, 0xC7),  # 하늘
    (0xAD, 0x5F, 0x3A),  # 갈색
]
INNER_LINE = (0x1A, 0x1C, 0x24)   # 테두리와 사진 사이 1px


def border_colors(n):
    if n <= len(BORDER_COLORS):
        return BORDER_COLORS[:n]
    out = list(BORDER_COLORS)
    for i in range(n - len(BORDER_COLORS)):
        h = (i + 0.5) / (n - len(BORDER_COLORS))
        r, g, b = colorsys.hsv_to_rgb(h, 0.82, 0.92)
        out.append((int(r * 255), int(g * 255), int(b * 255)))
    return out


def find_photos(folder):
    if not os.path.isdir(folder):
        sys.exit('입력 폴더가 없다: ' + folder)
    names = sorted(n for n in os.listdir(folder) if n.lower().endswith(EXTS))
    if not names:
        sys.exit('사진이 없다: ' + folder + '  (' + ', '.join(EXTS) + ')')
    return [os.path.join(folder, n) for n in names]


def crop_to_aspect(im, tw, th, focus):
    """목표 비율로 자른다. 가로는 가운데, 세로는 focus 를 중심으로."""
    want = tw / th
    w, h = im.size
    if w / h > want:                       # 너무 넓다 → 좌우를 자른다
        nw = int(round(h * want))
        x = (w - nw) // 2
        return im.crop((x, 0, x + nw, h))
    nh = int(round(w / want))              # 너무 높다 → 위아래를 자른다
    y = int(round((h - nh) * focus))
    y = max(0, min(y, h - nh))
    return im.crop((0, y, w, y + nh))


def make_detector(model):
    if not HAVE_CV:
        sys.exit('--face 를 쓰려면 opencv 가 필요하다:  python -m pip install opencv-python-headless')
    if not os.path.exists(model):
        sys.exit('얼굴 모델이 없다: ' + model + '\n'
                 '  https://github.com/opencv/opencv_zoo/raw/main/models/'
                 'face_detection_yunet/face_detection_yunet_2023mar.onnx')
    return cv2.FaceDetectorYN.create(model, '', (320, 320), 0.55, 0.3, 5000)


def find_faces(det, im):
    """원본 좌표계의 얼굴 상자 목록. 작은 오탐은 버린다."""
    w, h = im.size
    s = DETECT_WIDTH / w
    small = im.resize((DETECT_WIDTH, max(1, int(h * s))), Image.BILINEAR)
    arr = cv2.cvtColor(np.array(small), cv2.COLOR_RGB2BGR)
    det.setInputSize((arr.shape[1], arr.shape[0]))
    _, faces = det.detect(arr)
    if faces is None or not len(faces):
        return []
    boxes = [(f[0] / s, f[1] / s, f[2] / s, f[3] / s) for f in faces]
    # 뒤쪽 하객이나 오탐이 섞인다. 가장 큰 얼굴의 40% 보다 작으면 버린다.
    tallest = max(b[3] for b in boxes)
    return [b for b in boxes if b[3] >= tallest * 0.4]


def face_crop(im, faces, tw, th, zoom, drop):
    """얼굴들을 모두 감싸는 상자를 zoom 배로 넓혀 카드 비율로 자른다."""
    x0 = min(f[0] for f in faces)
    y0 = min(f[1] for f in faces)
    x1 = max(f[0] + f[2] for f in faces)
    y1 = max(f[1] + f[3] for f in faces)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2

    ar = tw / th
    need_w, need_h = (x1 - x0) * zoom, (y1 - y0) * zoom
    cw = max(need_w, need_h * ar)          # 두 얼굴이 좌우로 벌어져 있으면 가로가 기준이 된다
    ch = max(need_h, need_w / ar)

    W, H = im.size
    if cw > W:                              # 사진 밖으로 나가면 비율을 지키며 줄인다
        cw, ch = W, W / ar
    if ch > H:
        ch, cw = H, H * ar

    cy += ch * drop                         # 얼굴을 위쪽에 두고 아래 여백을 더 준다
    left = min(max(cx - cw / 2, 0), W - cw)
    top = min(max(cy - ch / 2, 0), H - ch)
    return im.crop((int(left), int(top), int(left + cw), int(top + ch)))


def to_photo(im, pw, ph, a, faces):
    """테두리 안에 들어갈 사진 부분만 만든다."""
    if faces:
        im = face_crop(im, faces, pw, ph, a.zoom, a.drop)
    else:
        im = crop_to_aspect(im, pw, ph, a.focus)
    if a.sharpen:
        im = im.filter(ImageFilter.UnsharpMask(radius=2, percent=90, threshold=3))
    im = im.resize((pw, ph), Image.BOX)
    if a.contrast != 1.0:
        im = ImageEnhance.Contrast(im).enhance(a.contrast)
    if a.saturation != 1.0:
        im = ImageEnhance.Color(im).enhance(a.saturation)
    return im


def shared_palette(images, colors):
    """모든 사진을 한 장으로 이어붙여 팔레트를 한 번만 뽑는다."""
    w = images[0].width
    strip = Image.new('RGB', (w, images[0].height * len(images)))
    for i, c in enumerate(images):
        strip.paste(c, (0, c.height * i))
    return strip.quantize(colors=colors, method=Image.MEDIANCUT)


def palette_image(colors):
    """색 목록으로 팔레트 이미지를 만든다.

    남는 칸을 검정으로 두면 안 된다 — 양자화가 어두운 사진 픽셀을 그 검정으로
    끌고 가서 그림자가 뭉개진다. 남는 칸은 마지막 색으로 채운다.
    """
    flat = []
    for c in colors:
        flat += list(c)
    last = list(colors[-1])
    flat += last * (256 - len(colors))
    pal = Image.new('P', (1, 1))
    pal.putpalette(flat)
    return pal


def frame(photo, bw, color):
    """사진에 원색 테두리와 1px 안쪽 선을 두른다."""
    if bw <= 0:
        return photo
    w = photo.width + (bw + 1) * 2
    h = photo.height + (bw + 1) * 2
    card = Image.new('RGB', (w, h), color)
    inner = Image.new('RGB', (photo.width + 2, photo.height + 2), INNER_LINE)
    inner.paste(photo, (1, 1))
    card.paste(inner, (bw, bw))
    return card


def kb(n):
    return '%.1fK' % (n / 1024.0)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('folder', help='사진이 든 폴더')
    p.add_argument('--out', default='cards', help='출력 폴더 (기본 cards)')
    p.add_argument('--size', default='96x120', help='카드 전체 크기 (기본 96x120)')
    p.add_argument('--colors', type=int, default=48, help='사진에 쓸 색 수 (기본 48)')
    p.add_argument('--border', type=int, default=0,
                   help='원색 테두리 두께 px. 0 이면 없음 (권장 4~6)')
    p.add_argument('--face', action='store_true',
                   help='얼굴을 찾아 그 주변으로 자른다 (opencv 필요)')
    p.add_argument('--face-model', default=DEFAULT_MODEL, help='YuNet onnx 경로')
    p.add_argument('--zoom', type=float, default=1.6,
                   help='--face 일 때 얼굴 상자의 몇 배로 자를지 (작을수록 확대, 기본 1.6). '
                        '2.0 은 96px 타일에서 얼굴이 작아 잘 안 보인다')
    p.add_argument('--drop', type=float, default=0.10,
                   help='--face 일 때 얼굴을 위로 올리는 정도 (기본 0.10)')
    p.add_argument('--focus', type=float, default=0.32,
                   help='얼굴을 못 찾았을 때 쓰는 세로 크롭 중심. 0=위, 1=아래')
    p.add_argument('--contrast', type=float, default=1.15)
    p.add_argument('--saturation', type=float, default=1.25)
    p.add_argument('--sharpen', action='store_true', default=True)
    p.add_argument('--no-sharpen', dest='sharpen', action='store_false')
    p.add_argument('--dither', action='store_true', help='디더링 켜기 (기본 끔)')
    p.add_argument('--cols', type=int, default=6, help='스프라이트 시트 열 수')
    a = p.parse_args()

    tw, th = (int(v) for v in a.size.lower().split('x'))
    bw = max(0, a.border)
    pw, ph = tw - (bw + 1) * 2, th - (bw + 1) * 2      # 테두리 안쪽 = 사진 크기
    if pw < 8 or ph < 8:
        sys.exit('테두리가 너무 두껍다. --border 를 줄여라.')

    paths = find_photos(a.folder)
    os.makedirs(a.out, exist_ok=True)
    bcols = border_colors(len(paths))

    print('사진 %d장 → 카드 %dx%d (사진 %dx%d + 테두리 %dpx) · 사진 %d색'
          % (len(paths), tw, th, pw, ph, bw, a.colors))
    print('크롭 %s · 대비 %.2f · 채도 %.2f · 언샵 %s · 디더 %s\n'
          % ('얼굴 (zoom %.1f, drop %.2f)' % (a.zoom, a.drop) if a.face
             else '고정 (focus %.2f)' % a.focus,
             a.contrast, a.saturation,
             'O' if a.sharpen else 'X', 'O' if a.dither else 'X'))

    det = make_detector(a.face_model) if a.face else None
    photos, found = [], []
    for q in paths:
        im = Image.open(q).convert('RGB')
        faces = find_faces(det, im) if det else []
        found.append(len(faces))
        photos.append(to_photo(im, pw, ph, a, faces))
    if det:
        missed = [os.path.basename(p) for p, n in zip(paths, found) if not n]
        print('  얼굴 검출: %d장에서 평균 %.1f명%s\n'
              % (sum(1 for n in found if n), sum(found) / max(1, sum(1 for n in found if n)),
                 '' if not missed else '   못 찾음(고정 크롭): ' + ', '.join(missed)))
    pal = shared_palette(photos, a.colors)
    dither = Image.FLOYDSTEINBERG if a.dither else Image.NONE

    # 최종 팔레트 = 사진 색 + 테두리 원색 + 안쪽 선. 테두리는 사진 양자화에
    # 끼어들지 않으므로 원색이 그대로 남는다.
    raw = pal.getpalette()[:a.colors * 3]
    photo_cols = [tuple(raw[i * 3:i * 3 + 3]) for i in range(a.colors)]
    final_cols = photo_cols + (bcols + [INNER_LINE] if bw else [])
    final_pal = palette_image(final_cols)

    total = 0
    out = []
    for i, (path, photo) in enumerate(zip(paths, photos)):
        q = photo.quantize(palette=pal, dither=dither).convert('RGB')
        card = frame(q, bw, bcols[i]).quantize(palette=final_pal, dither=Image.NONE)
        name = 'card_%02d.png' % (i + 1)
        dst = os.path.join(a.out, name)
        card.save(dst, optimize=True)
        size = os.path.getsize(dst)
        total += size
        out.append(card)
        swatch = '#%02X%02X%02X' % bcols[i] if bw else '-'
        print('  %-14s %-8s ← %-30s %7s'
              % (name, swatch, os.path.basename(path)[:30], kb(size)))

    # 스프라이트 시트
    cols = min(a.cols, len(out))
    rows = (len(out) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * tw, rows * th), (0, 0, 0))
    for i, q in enumerate(out):
        sheet.paste(q.convert('RGB'), ((i % cols) * tw, (i // cols) * th))
    sheet_q = sheet.quantize(palette=final_pal, dither=Image.NONE)
    sheet_path = os.path.join(a.out, 'sheet.png')
    sheet_q.save(sheet_path, optimize=True)
    sheet_size = os.path.getsize(sheet_path)

    css = ['.card{width:%dpx;height:%dpx;background-image:url(sheet.png);'
           'background-repeat:no-repeat;image-rendering:pixelated}' % (tw, th)]
    for i in range(len(out)):
        css.append('.card-%d{background-position:-%dpx -%dpx}'
                   % (i + 1, (i % cols) * tw, (i // cols) * th))
    with open(os.path.join(a.out, 'cards.css'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(css) + '\n')

    body = ''.join('<div class="card card-%d"></div>' % (i + 1) for i in range(len(out)))
    html = ('<!DOCTYPE html><meta charset="utf-8"><title>카드 미리보기</title>'
            '<link rel="stylesheet" href="cards.css">'
            '<style>body{background:#101219;margin:0;padding:20px}'
            '.row{display:flex;flex-wrap:wrap;gap:8px}'
            '.card{border-radius:6px}'
            '.big{zoom:3;margin-top:24px;gap:3px}</style>'
            '<div class="row">%s</div><div class="row big">%s</div>' % (body, body))
    with open(os.path.join(a.out, 'preview.html'), 'w', encoding='utf-8') as f:
        f.write(html)

    print('\n낱장 %d개 합계 %s   시트 1장 %s (%dx%d)   팔레트 %d색'
          % (len(out), kb(total), kb(sheet_size), sheet.width, sheet.height,
             len(final_cols)))
    print('확인: %s' % os.path.join(a.out, 'preview.html').replace('\\', '/'))


if __name__ == '__main__':
    main()
