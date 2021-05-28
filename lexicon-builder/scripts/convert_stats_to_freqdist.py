"""
This script converts the standard corpus statistics format from Språkbanken,
to a simple file with "word frequency" lines. 

The lines are sorted in reversed frequency order (the most common first).
"""

import sys
import fileinput

fd = {}

ctr = 0
for line in fileinput.input():
    w, _pos, _lem, _, freq, _ = line.split('\t')
    if w.isalpha():
        w = w.upper()
        freq = int(freq)
        if w in fd:
            fd[w] += freq
        else:
            fd[w] = freq
    ctr += 1
    if ctr % 1000000 == 0:
        print(f"{ctr:10d}: {len(fd):8d}", file=sys.stderr)

ws = sorted(fd.items(), key=lambda i:i[1], reverse=True)

try:
    for w, n in ws:
        if n <= 1:
            break
        print(w, n)
except (BrokenPipeError, IOError):
    pass # https://stackoverflow.com/a/26738736

sys.stderr.close()


