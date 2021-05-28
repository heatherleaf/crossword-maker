"""
This script builds a crossword lexicon from a file with word frequencies,
and a pretrained word embeddings file.

To reduce the size of the final lexicon, it reduces the number of dimensions, 
and makes the vectors binary (the numbers are only -1 or +1).
The binary vectors are stored as Base-64 encoded bitvectors.

The dimensionality reduction uses the algorithm from:
"Effective Dimensionality Reduction for Word Embeddings" 
https://www.aclweb.org/anthology/W19-4328/
"""

import sys
import gzip
import numpy
import base64
from sklearn.decomposition import PCA
from pathlib import Path
from time import time

TMPDIR = Path('tmp')
TMPDIR.mkdir(exist_ok=True)


starttime = time()
def log(*args, **kwargs):
    global starttime
    print(f"{time()-starttime:5.0f} s:", *args, **kwargs, file=sys.stderr)


def open_file(fname, mode):
    fname = Path(fname)
    fopen = gzip.open if fname.suffix == '.gz' else open
    return fopen(fname, mode, errors='replace')


def read_frequencies_and_embedding(freq_file, embedding_file):
    wordlist = {}
    with open_file(freq_file, "rt") as FREQ:
        for line in FREQ:
            word, freq = line.split()
            assert word.upper() not in wordlist, (word, freqdist[word], freq)
            freq = int(freq)
            if freq > 1:
                wordlist[word.upper()] = {'word': None, 'freq': freq}

    with open_file(embedding_file, "rt") as EMB:
        for n, line in enumerate(EMB):
            if n and n % 100000 == 0: print(f"Read {n} words from embedding", file=sys.stderr)
            if n == 0:
                try:
                    _size, _dimensions = map(int, line.split())
                    continue
                except:
                    pass
            vector = [v for v in line.strip().replace('\t',' ').split(' ') if v]
            word = vector.pop(0)
            vector = numpy.asarray(vector, dtype='float32')
            wdict = wordlist.get(word.upper())
            if wdict:
                if ('word' not in wdict or
                    word == word.lower() or
                    word == word.capitalize() and wdict['word'] != word.lower() or
                    word == word.upper() and wdict['word'] not in [word.lower(), word.capitalize()]
                    ):
                    wdict['word'] = word
                    wdict['vector'] = vector
                else:
                    # print(f"Skipping {word}, because {wdict['word']} already exists", file=sys.stderr)
                    pass
    return [(word, wd['vector'], wd['freq']) for word, wd in wordlist.items() if 'vector' in wd]


def reduce_dimensions(embedding, dimensions, remove_projections=None, random_state=None):
    words = list(embedding)
    model = list(embedding.values())
    in_dimensions = len(model[0])

    if remove_projections:
        log(f'PCA to get top components')
        model -= numpy.mean(model)
        pca = PCA(n_components=in_dimensions, random_state=random_state)
        pca.fit_transform(model)
        U = pca.components_

        log(f'Removing projections on top {remove_projections} components')
        for vec in model:
            for u in U[:remove_projections]:
                vec -= numpy.dot(u.transpose(), vec) * u

    mid_dim = dimensions
    if remove_projections: mid_dim += remove_projections

    if mid_dim < in_dimensions:
        log(f'PCA reduction to {mid_dim} dimensions')
        model -= numpy.mean(model)
        pca = PCA(n_components=mid_dim, random_state=random_state)
        model = pca.fit_transform(model)

    if remove_projections:
        log(f'PCA to get top components')
        model -= numpy.mean(model)
        pca = PCA(n_components=mid_dim, random_state=random_state)
        pca.fit_transform(model)
        U = pca.components_

        log(f'Removing projections on top {remove_projections} components')
        for vec in model:
            for u in U[:remove_projections]:
                vec -= numpy.dot(u.transpose(), vec) * u

        log(f'Removing the first {remove_projections} components, reducing to {dimensions} dimensions')
        model = [vec[remove_projections:] for vec in model]

    log(f'Resulting dimensions: {len(model[0])}')
    assert dimensions == len(model[0])

    reduced_embedding = dict(zip(words, model))
    return reduced_embedding


REMOVE_PROJECTIONS = 7

def build_lexicon(frequencies_file, embedding_file, lexicon_file, lexicon_size, embedding_dimensions):
    frequencies_file = Path(frequencies_file)
    embedding_file = Path(embedding_file)
    log(f"Reading frequencies and embedding: {frequencies_file} + {embedding_file}")
    wordlist = read_frequencies_and_embedding(frequencies_file, embedding_file)

    wordlist.sort(key=lambda x:x[-1], reverse=True)
    del wordlist[lexicon_size:]
    embedding = {word : vector for (word, vector, _freq) in wordlist}

    log(f"Reducing to {embedding_dimensions} dimensions")
    reduced_embedding = reduce_dimensions(embedding, dimensions=embedding_dimensions, remove_projections=REMOVE_PROJECTIONS)

    log(f"Saving binary base64 lexicon: {lexicon_file}")
    with open_file(lexicon_file, "wt") as OUT:
        for word, vector in reduced_embedding.items():
            bits = [float(n) >= 0 for n in vector]
            vector = str(base64.b64encode(numpy.packbits(bits)), 'ascii')
            print(word, vector, file=OUT)



if __name__ == '__main__':
    _, frequencies_file, embedding_file, lexicon_file, lexicon_size, embedding_dimensions = sys.argv
    lexicon_size, embedding_dimensions = map(int, [lexicon_size, embedding_dimensions])
    build_lexicon(frequencies_file, embedding_file, lexicon_file, lexicon_size, embedding_dimensions)

