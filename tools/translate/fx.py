import json,sys
def fx(i,pairs,field='body'):
    f=f'content/posts/{i}.json';s=open(f).read();p=json.loads(s)
    for a,c in pairs:
        if a not in p[field]: print('MISS',i,a); continue
        p[field]=p[field].replace(a,c)
    open(f,'w').write(json.dumps(p,ensure_ascii=False,indent=1 if s.startswith('{\n "') else 2)+('\n' if s.endswith('\n') else ''))
