"""짝맞추기용 카드 뒷면 한 장을 만든다.

앞면(make_cards.py 출력)과 규격을 맞춘다 - 96x120, 5px 테두리, 1px 안쪽 선.
테두리는 앞면에 쓰지 않은 금색이라 뒤집힌 카드와 뒤집힌 적 없는 카드가 섞여도
한눈에 갈린다. 안쪽은 마름모 격자 + 겹친 반지 두 개.
"""
import os
import sys
from PIL import Image

W, H = 96, 120
BORDER = 5
GOLD = (0xE8, 0xC0, 0x7A)
INNER_LINE = (0x1A, 0x1C, 0x24)
FIELD = (0x17, 0x1A, 0x24)
LATTICE = (0x28, 0x2D, 0x3E)
RING = (0x7A, 0x63, 0x40)

OUT = sys.argv[1] if len(sys.argv) > 1 else 'experiment/cards/back.png'


def diamond(px, cx, cy, r, color, x0, y0, x1, y1):
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            if abs(x - cx) + abs(y - cy) > r:
                continue
            if x0 <= x <= x1 and y0 <= y <= y1:
                px[x, y] = color


def ring(px, cx, cy, r, color, x0, y0, x1, y1):
    """두께 2px 짜리 원 테두리. 반지름을 정수로 다뤄 픽셀이 뭉개지지 않게 한다."""
    for y in range(cy - r - 1, cy + r + 2):
        for x in range(cx - r - 1, cx + r + 2):
            d2 = (x - cx) ** 2 + (y - cy) ** 2
            if not ((r - 2) ** 2 < d2 <= r ** 2):
                continue
            if x0 <= x <= x1 and y0 <= y <= y1:
                px[x, y] = color


def main():
    im = Image.new('RGB', (W, H), GOLD)
    px = im.load()

    # 1px 안쪽 선 + 바탕
    for y in range(BORDER, H - BORDER):
        for x in range(BORDER, W - BORDER):
            px[x, y] = INNER_LINE
    x0, y0 = BORDER + 1, BORDER + 1
    x1, y1 = W - BORDER - 2, H - BORDER - 2
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = FIELD

    # 마름모 격자. 행마다 반 칸씩 밀어 엇갈리게 놓는다.
    step = 16
    row = 0
    cy = y0 + 4
    while cy <= y1 + step:
        cx = x0 + 4 + (step // 2 if row % 2 else 0)
        while cx <= x1 + step:
            diamond(px, cx, cy, 3, LATTICE, x0, y0, x1, y1)
            cx += step
        cy += step // 2
        row += 1

    # 겹친 반지 두 개
    mx, my = W // 2, H // 2
    ring(px, mx - 9, my, 13, RING, x0, y0, x1, y1)
    ring(px, mx + 9, my, 13, RING, x0, y0, x1, y1)

    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    im.convert('P', palette=Image.ADAPTIVE, colors=16).save(OUT, optimize=True)
    print('wrote %s  %dx%d  %d bytes' % (OUT, W, H, os.path.getsize(OUT)))


if __name__ == '__main__':
    main()
