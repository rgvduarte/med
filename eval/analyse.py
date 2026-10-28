"""Scores the evaluation runs against FracAtlas labels and applies the pre-registered decision rules.

    python3 -I eval/analyse.py <FracAtlas dir> eval/results > eval/RESULTS.md
"""
import json
import math
import sys
from pathlib import Path

ACCEPT_REGION = {
    'hand': {'wrist-hand', 'elbow', 'long-bones'},
    'leg': {'knee', 'ankle-foot', 'long-bones', 'hip-pelvis'},
    'hip': {'hip-pelvis'},
    'shoulder': {'shoulder'},
}


def wilson(k, n, z=1.96):
    if n == 0:
        return (float('nan'), float('nan'), float('nan'))
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return p, max(0.0, c - h), min(1.0, c + h)


def fmt(k, n):
    p, lo, hi = wilson(k, n)
    return f'{k}/{n} = **{p:.2f}** (IC 95% {lo:.2f}–{hi:.2f})'


def load(path):
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()] if Path(path).exists() else []


def gt_boxes(data_dir):
    coco = json.loads((Path(data_dir) / 'Annotations' / 'COCO JSON' / 'COCO_fracture_masks.json').read_text())
    images = {im['id']: im for im in coco['images']}
    boxes = {}
    for a in coco['annotations']:
        im = images[a['image_id']]
        x, y, w, h = a['bbox']
        boxes.setdefault(im['file_name'], []).append((x / im['width'], y / im['height'], w / im['width'], h / im['height']))
    return boxes


def hit(row, boxes):
    d = row.get('data') or {}
    if not all(k in d for k in ('x1', 'y1', 'x2', 'y2')):
        return False
    cx, cy = (d['x1'] + d['x2']) / 2000, (d['y1'] + d['y2']) / 2000
    for x, y, w, h in boxes.get(row['image_id'], []):
        mx, my = w * 0.1, h * 0.1
        if x - mx <= cx <= x + w + mx and y - my <= cy <= y + h + my:
            return True
    return False


def main(data_dir, results_dir):
    out = ['# Avaliação da IA integrada — resultados', '', 'Protocolo e critérios: [PROTOCOL.md](PROTOCOL.md). Gerado por `eval/analyse.py`.', '']
    rows = load(Path(results_dir) / 'qwen3.5-2b-fracture.jsonl')
    if rows:
        fx = [r for r in rows if r['fractured'] == 1]
        nf = [r for r in rows if r['fractured'] == 0]
        flag = lambda r: (r.get('data') or {}).get('fracture') in ('yes', 'uncertain')
        tp = sum(flag(r) for r in fx)
        tn = sum(not flag(r) for r in nf)
        invalid = sum(1 for r in rows if r.get('error'))
        sens, sens_lo, _ = wilson(tp, len(fx))
        spec = tn / len(nf) if nf else float('nan')
        boxes = gt_boxes(data_dir)
        flagged_fx = [r for r in fx if flag(r)]
        hits = sum(hit(r, boxes) for r in flagged_fx)
        ok = len(rows) == 100 and sens >= 0.85 and sens_lo >= 0.75 and spec >= 0.50 and invalid <= 5
        out += [
            '## A. Rastreio de fratura — Qwen3.5 2B',
            '',
            f'- Imagens avaliadas: {len(rows)} ({len(fx)} com fratura, {len(nf)} sem)',
            f'- **Sensibilidade** (sinal «yes»/«uncertain» com fratura): {fmt(tp, len(fx))}',
            f'- **Especificidade** («no» sem fratura): {fmt(tn, len(nf))}',
            f'- Respostas inválidas: {invalid}',
            f'- Localização (centro da caixa dentro da fratura, nas fraturas assinaladas): {fmt(hits, len(flagged_fx))}',
            f'- Respostas: ' + ', '.join(f'{k} {sum(1 for r in rows if (r.get("data") or {}).get("fracture") == k)}' for k in ('yes', 'uncertain', 'no')),
            '',
            'Por região (sensibilidade · especificidade):',
            '',
        ]
        for part in ('hand', 'leg', 'hip', 'shoulder'):
            pf = [r for r in fx if r['part'] == part]
            pn = [r for r in nf if r['part'] == part]
            out.append(f'- {part}: {sum(flag(r) for r in pf)}/{len(pf)} · {sum(not flag(r) for r in pn)}/{len(pn)}')
        ms = sorted(r['ms'] for r in rows)
        out += ['', f'Tempo mediano por imagem (CPU, 4 núcleos): {ms[len(ms) // 2] / 1000:.0f} s', '']
        out += [f'**Decisão pré-registada:** {"ATIVAR «regiões a rever» no computador" if ok else "NÃO ativar — a IA integrada continua só com triagem"}.', '']

    for key, label in (('lfm2.5-vl-450m', 'B. Triagem — LFM2.5-VL 450M (telemóvel)'), ('qwen3.5-2b', 'C. Triagem — Qwen3.5 2B (computador)')):
        rows = load(Path(results_dir) / f'{key}-triage.jsonl')
        if not rows:
            continue
        good = sum(1 for r in rows if (r.get('data') or {}).get('region') in ACCEPT_REGION[r['part']])
        modality = sum(1 for r in rows if (r.get('data') or {}).get('modality') == 'XR')
        invalid = sum(1 for r in rows if r.get('error'))
        acc, _, _ = wilson(good, len(rows))
        out += [
            f'## {label}',
            '',
            f'- Região anatómica compatível: {fmt(good, len(rows))}',
            f'- Modalidade = radiografia: {fmt(modality, len(rows))}',
            f'- Respostas inválidas: {invalid}',
        ]
        if key == 'lfm2.5-vl-450m':
            verdict = 'manter' if acc >= 0.80 else 'rotular como experimental' if acc >= 0.60 else 'retirar a região da triagem no telemóvel'
            out += ['', f'**Decisão pré-registada:** {verdict}.']
        out.append('')
    print('\n'.join(out))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
