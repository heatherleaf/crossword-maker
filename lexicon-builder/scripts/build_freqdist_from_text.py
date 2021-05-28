"""
This script build a frequency distribution from a text corpus.
The freq. distribution to a simple file with "word frequency" lines. 

The lines are sorted in reversed frequency order (the most common first).
"""

import sys
import nltk
import fileinput

fd = nltk.FreqDist()

ctr = 0
for line in fileinput.input():
    fd.update(w.upper() for w in nltk.word_tokenize(line) if w.isalpha())
    ctr += 1
    if ctr % 10000 == 0:
        print(f"{ctr:6d}: {len(fd):8d}", file=sys.stderr)

try:
    for w, n in fd.most_common():
        print(w, n)
except (BrokenPipeError, IOError):
    pass # https://stackoverflow.com/a/26738736

sys.stderr.close()
