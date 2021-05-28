# Crossword maker

A simple web-based tool for building your own crosswords.

Try it out yourself here: https://heatherleaf.github.io/crossword-maker/crossword.html

## Lexicons

There are 6 example lexicons:

- Svenska: Nyheter + Wikipedia (words extracted from Swedish news texts, 2001-2013, and Swedish Wikipedia)
- Svenska: Wikipedia-titlar (titles from Swedish Wikipedia, word frequencies from Swedish news + Wikipedia)
- Svenska: Bloggtexter (words extracted from Swedish blog texts, 2005-2017)
- Svenska: Twitter (words extracted from Swedish tweets, 2015-2017)
- Svenska: Nyheter från 1800-talet (words extracted from Swedish news texts, 1840-1880)
- Engelska: OANC-korpusen (words extracted from the [Open American National Corpus](https://www.anc.org/data/oanc/))

All lexicons contain the 30 000 most common words from the source texts. The Swedish lexicons are extracted from the [resources of Språkbanken Text](https://spraakbanken.gu.se/resurser).

## Word embeddings

If the words in lexicon have associated word vectors (from word embeddings), the tool calculates a theme from the current words in the crossword, and suggests new words depending on how close they are to the current theme.

All the example lexicons above have word vectors. They are 144-dimensional binary word vectors, reduced from aligned 300-dimensional word FastText embeddings, taken from here: https://fasttext.cc/docs/en/aligned-vectors.html

## Lexicon format

A lexicon is a UTF8-encoded text file with one word per line:

```
KOKBOK
SLÄGGA
KATMANDU
...
```

It is also possible to add word vectors after each word - in that case, all words vectors must have the same number of dimensions:

```
KOKBOK 0.0551 0.0961 0.0665 -0.0488 0.0220 0.0533 -0.1061 0.0236 0.1279 0.0028 ...
SLÄGGA 0.0454 0.0863 -0.0316 0.0743 0.0118 -0.0715 -0.0431 0.0855 -0.0057 -0.0264 ...
KATMANDU 0.0461 -0.1016 0.0069 -0.0144 0.0503 -0.0161 -0.0649 -0.0635 0.0266 0.0166 ...
...
```

If you have binary word vectors (i.e., every number is either -1 or +1), then you can store them very compactly as Base-64 encoded binary numbers (where bit 0 means -1 and bit 1 means +1). Here is an example of 144-dimensional binary vectors:

```
KOKBOK /fPGwOotDqxxser/
SLÄGGA N5KmB4dj4AvuHjls
KATMANDU JJs/Lz8eNbpE6KdA
...
```

## Building your own lexicon with word embeddings

There are some scripts and a Makefile in the directory `lexicon-builder`, which were used to build the example lexicons. You can hopefully be inspired to build your own lexicons from this.

The files `lexicon-builder/source/stats-XXX.txt.gz` files are not included in this repo, because they are too large. You can download them from Språkbanken's resources: https://spraakbanken.gu.se/resurser, or merge several resources.

The files `wikipedia-sv-titlar.txt` and `oanc-frequencies.txt` (in `lexicon-builder/source`) were created from the following corpora:

- Språkbanken's Wikipedia corpus: https://spraakbanken.gu.se/resurser/wikipedia-sv
- the OANC corpus: https://www.anc.org/data/oanc/download
