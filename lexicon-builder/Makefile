
SIZE = 30000
DIMENSIONS = 96

SWEDISH_LEXICA = news+wiki wikititlar bloggmix twitter kubhist
ENGLISH_LEXICA = oanc

.PHONY: help clean deepclean all swedish english
.SECONDARY:

help:
	@echo "make clean | deepclean | all | swedish | english"
	@echo " - Swedish lexica: $(SWEDISH_LEXICA)"
	@echo " - English lexica: $(ENGLISH_LEXICA)"

clean:
	rm -f lexicon-*

deepclean: clean
	rm -f freq-*

all: swedish english

swedish: $(SWEDISH_LEXICA:%=lexicon-sv-%.js)

english: $(ENGLISH_LEXICA:%=lexicon-en-%.js)


################################################################################
# Javascript lexicon files

lexicon-%.js: lexicon-%.bin64
	echo "if (typeof D === 'undefined') var D = {};" > $@
	echo "D['$*'] = \`" >> $@
	cat $< >> $@
	echo "\`;" >> $@


################################################################################
# Binary, dimensionally reduced embeddings,
# from word frequency distributions and pre-trained embeddings

MODELDIR = language-models/embeddings/fastText-aligned-1Mwords
SWEDISH_MODEL = $(MODELDIR)/aligned.sv.300.vec.gz
ENGLISH_MODEL = $(MODELDIR)/aligned.en.300.vec.gz


lexicon-sv-%.bin64: freq-sv-%.txt $(SWEDISH_MODEL)
	python scripts/build_lexicon.py $^ $@ $(SIZE) $(DIMENSIONS)

lexicon-en-oanc.bin64: freq-en-oanc.txt $(ENGLISH_MODEL)
	python scripts/build_lexicon.py $^ $@ $(SIZE) $(DIMENSIONS)


################################################################################
# Build frequency distributions

freq-sv-%.txt: source/stats-%.txt.gz
	gunzip -c $< | python scripts/convert_stats_to_freqdist.py > $@

freq-en-oanc.txt: source/oanc-frequencies.txt
	cp $< $@

# 2 x webbnyheter + wikipedia, to get an even distribution
freq-sv-news+wiki.txt: source/stats-webbnyheter.txt.gz source/stats-wikipedia.txt.gz
	cat $< $^ | gunzip -c | python scripts/convert_stats_to_freqdist.py > $@

# wikipedia titles, with frequencies from news+wiki
freq-sv-wikititlar.txt: source/wikipedia-sv-titlar.txt freq-sv-news+wiki.txt
	cat $^ | sort | \
	perl -pe 's/\n/ / unless / /' | \
	perl -ne 'print "$$1 $$2\n" if /^\S+ +(\S+) +(\S+) *$$/' | \
	sort -r -n -k2 > $@

