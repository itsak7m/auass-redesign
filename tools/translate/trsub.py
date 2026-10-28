# Build an English record by substituting strings in the tokenized Arabic body.
import json, sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from tr import tokenize
def rec(pid, title, excerpt, pairs):
    p = json.load(open(f'content/posts/{pid}.json'))
    b, _ = tokenize(p['body'])
    for a, c in pairs:
        a = a.replace('حماه', 'حماة')
        assert a in b, (pid, a)
        b = b.replace(a, c)
    return f"=== {pid} | {p['type']}\nT: {title}\nX: {excerpt}\nB:\n{b.strip()}\n"
