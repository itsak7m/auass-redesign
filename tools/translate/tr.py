#!/usr/bin/env python3
"""Translation batches for archive posts.

dump <repo> <outdir> full|science <chars>  -> outdir/bNN.txt + outdir/tokens.json
apply <repo> <outdir> <file.txt>            -> writes p['en'] into the posts

Batch format (one record per post):
=== <id> | <type>
T: <title>
X: <excerpt>
B:
<body html with [[Mn]] block tokens, [[In]] image tokens and href="Ln" links>
"""
import json, glob, os, re, sys

def ld(f):
    s = open(f).read()
    return s, json.loads(s)

def sv(f, s, p):
    ind = 1 if s.startswith('{\n "') else 2
    open(f, 'w').write(json.dumps(p, ensure_ascii=False, indent=ind) + ('\n' if s.endswith('\n') else ''))

def tokenize(body):
    tok = {}
    n = [0]
    def put(prefix, val):
        n[0] += 1
        k = f'{prefix}{n[0]}'
        tok[k] = val
        return k
    # whole media blocks
    body = re.sub(r'<p class="(?:yt|media-file|ext-embed)"[^>]*></p>', lambda m: '[[' + put('M', m.group(0)) + ']]', body)
    body = re.sub(r'<figure>\s*(<img [^>]*>)\s*</figure>', lambda m: '[[' + put('M', m.group(0)) + ']]', body)
    body = re.sub(r'<img [^>]*>', lambda m: '[[' + put('I', m.group(0)) + ']]', body)
    body = re.sub(r'href="([^"]*)"', lambda m: 'href="' + put('L', m.group(1)) + '"', body)
    return body, tok

def detok(body, tok):
    for k, v in tok.items():
        if k[0] in 'MI':
            body = body.replace('[[' + k + ']]', v)
        else:
            body = body.replace('href="' + k + '"', 'href="' + v + '"')
    return body

def targets(repo, mode):
    out = []
    for f in sorted(glob.glob(os.path.join(repo, 'content/posts/*.json')), key=lambda x: int(re.sub(r'\D', '', os.path.basename(x)))):
        p = json.load(open(f))
        if p['lang'] != 'ar' or p.get('en'):
            continue
        if mode == 'full' and p['type'] in ('event', 'auass', 'article'):
            out.append((f, p))
        if mode == 'science' and p['type'] == 'science':
            out.append((f, p))
    return out

def dump(repo, outdir, mode, chars):
    os.makedirs(outdir, exist_ok=True)
    tokens = {}
    batches, cur, size = [], [], 0
    for f, p in targets(repo, mode):
        rec = f"=== {p['id']} | {p['type']}\nT: {p['title']}\nX: {p.get('excerpt', '')}\n"
        if mode == 'full':
            b, tok = tokenize(p['body'])
            tokens[str(p['id'])] = tok
            rec += 'B:\n' + b.strip() + '\n'
        L = len(re.sub(r'<[^>]+>|\[\[\w+\]\]', '', rec))
        if cur and size + L > chars:
            batches.append(cur); cur, size = [], 0
        cur.append(rec); size += L
    if cur:
        batches.append(cur)
    for f in glob.glob(os.path.join(outdir, 'b*.txt')):
        os.remove(f)
    for i, b in enumerate(batches):
        open(os.path.join(outdir, f'b{i:02d}.txt'), 'w').write('\n'.join(b))
    tp = os.path.join(outdir, 'tokens.json')
    old = json.load(open(tp)) if os.path.exists(tp) else {}
    old.update(tokens)
    json.dump(old, open(tp, 'w'), ensure_ascii=False)
    print(len(batches), 'batches')

def parse(text):
    recs = {}
    for chunk in re.split(r'^=== ', text, flags=re.M)[1:]:
        head, _, rest = chunk.partition('\n'); rest = rest.rstrip('\n') + '\n'
        pid = head.split('|')[0].strip()
        m = re.match(r'T: ?(.*?)\nX: ?(.*?)\n(?:B:\n(.*))?$', rest, re.S)
        if not m:
            raise SystemExit('bad record ' + pid)
        recs[pid] = {'title': m.group(1).strip(), 'excerpt': m.group(2).strip(), 'body': (m.group(3) or '').strip()}
    return recs

def apply(repo, outdir, fn):
    tokens = json.load(open(os.path.join(outdir, 'tokens.json')))
    recs = parse(open(fn).read())
    bad = 0
    for pid, r in recs.items():
        f = os.path.join(repo, 'content/posts', pid + '.json')
        s, p = ld(f)
        en = {'title': r['title'], 'excerpt': r['excerpt']}
        if r['body']:
            tok = tokens[pid]
            src, _ = tokenize(p['body'])
            want = set(re.findall(r'\[\[\w+\]\]|href="L\d+"', src))
            got = set(re.findall(r'\[\[\w+\]\]|href="L\d+"', r['body']))
            if want != got:
                print('TOKENS', pid, 'missing', sorted(want - got), 'extra', sorted(got - want)); bad += 1
            if re.search(r'[\u0600-\u06FF]', re.sub(r'<[^>]+>', '', r['body'])):
                print('ARABIC LEFT', pid)
            en['body'] = detok(r['body'], tok)
        p['en'] = en
        sv(f, s, p)
    print('applied', len(recs), 'bad', bad)

if __name__ == '__main__':
    a = sys.argv
    if a[1] == 'dump':
        dump(a[2], a[3], a[4], int(a[5]))
    else:
        apply(a[2], a[3], a[4])
