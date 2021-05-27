
var dom;

const config = {
    width: 15,
    height: 10,
    alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖÜ",
    maxresults: 200,
};


function initialize() {
    dom = {
        crossword: {
            container: document.getElementById("crossword-container"),
            table:     document.getElementById("crossword-table"),
        },
        info: {
            dictselect:document.getElementById("info-dictselect"),
            dictname:  document.getElementById("info-dictname"),
            dictsize:  document.getElementById("info-dictsize"),
        },
        wordlist: {
            container: document.getElementById("wordlist-container"),
            heading:   document.getElementById("wordlist-heading"),
            intro:     document.getElementById("wordlist-intro"),
            filter:    document.getElementById("wordlist-filter"),
            wrapper:   document.getElementById("wordlist-filter-wrapper"),
            content:   document.getElementById("wordlist-content"),
        },
        buttons: {
            reset:   document.getElementById("button-reset"),
            help:    document.getElementById("button-help"),
            reload:  document.getElementById("button-wordlist-reload"),
            addword: document.getElementById("button-wordlist-addword"),
            upload:  document.getElementById("button-upload-dictionary"),
            resize:  document.getElementsByClassName("button-resize"),
        },
    };

    dom.buttons.help.onclick = show_help;
    init_crossword(config.width, config.height);
    init_dictionary();
    clear_wordlist();
}

function show_help() {
    alert(`
Markera en rad eller kolumn för att få förslag på ord,
klicka sedan på ett förslag för att lägga till det.

Dubbelklicka på en bokstav för att ta bort det ordet.
Dubbelklicka på en tom ruta för att skriva in en ledtråd.
`);
}


////////////////////////////////////////////////////////////////////////////////
// Dictionary

if (typeof dictionaries === "undefined")
    var dictionaries = {};

var the_dictionary;

function init_dictionary() {
    dom.info.dictselect.onchange = select_dictionary;
    dom.buttons.upload.onchange = upload_dictionary;
    for (let name in dictionaries) {
        add_dictionary(name, dictionaries[name]);
    }
    dom.info.dictselect.selectedIndex = 0;
    select_dictionary();
}

function add_dictionary(name, dict) {
    dictionaries[name] = convert_dictionary(dict);
    let opt = document.createElement('option');
    opt.value = name;
    opt.text = `${name} (${dictionary_size(name)} ord)`;
    dom.info.dictselect.add(opt);
    console.log(`Added dictionary: ${name}, size ${dictionary_size(name)} words`);
}

function dictionary_size(name) {
    let size = 0;
    for (let subdict of Object.values(dictionaries[name])) {
        size += Object.keys(subdict).length;
    }
    return size;
}

function convert_dictionary(dict) {
    let dictionary = {};
    function add_to_dict(word, value=true) {
        word = word.toUpperCase();
        if (!dictionary[word.length]) dictionary[word.length] = {};
        dictionary[word.length][word] = value;
    }
    let isword = new RegExp("^[" + config.alphabet + "]+$", "i");
    let not_added = 0;
    if (typeof dict === "string") {
        // The dictionary is a string of one word per line
        // Optionally, a second "word" in the line is a Base64-encoded binary word vector
        for (let line of dict.split(/[\r\n]+/)) {
            line = line.trim().split(/\s+/);
            if (line.length >= 1) {
                let word = line[0];
                if (!isword.test(word)) {
                    not_added++;
                    // console.warn(`Not a word: "${line[0]}" -- not adding`);
                } else if (line.length == 1) {
                    add_to_dict(word);
                } else if (line.length == 2) {
                    let vector = parse_base64_bitvector(line[1]);
                    if (!vector) {
                        not_added++;
                        // console.warn(`Not a base64 bitvector: "${line.join(' ')}" -- not adding`);
                    } else {
                        add_to_dict(word, vector);
                    }
                } else {
                    let vector = parse_wordvector(line.slice(1));
                    if (vector.some(isNaN)) {
                        not_added++;
                        // console.warn(`Not a word vector: "${line.join(' ')}" -- not adding`);
                    } else {
                        add_to_dict(word, vector);
                    }
                }
            }
        }
    } else {
        for (let key in dict) {
            if (isword.test(key)) {
                // The dictionary is of the form {word: value, word: value, ...}
                add_to_dict(key, dict[key]);
                if (dict[key] instanceof Array) {
                    let vals = Object.values(dict[key]);
                }
            } else if (!isNaN(Number(key))) {
                // The dictionary is of the form
                // {length: {word: value, word: value, ...}, length: {word: value, ...}, ...}
                let len = Number(key);
                for (let word in dict[key]) {
                    if (isword.test(word)) {
                        if (word.length != len) {
                            console.warn(`Not of given length ${len}: "${word}" -- adding anyway`);
                        }
                        add_to_dict(word, dict[key][word]);
                    } else {
                        not_added++;
                        // console.warn(`Not a word: "${line[0]}" -- not adding`);
                    }
                }
            } else {
                not_added++;
                // console.warn(`Not a word: "${key}" -- not adding`);
            }
        }
    }
    if (not_added > 0) console.log(`--> ${not_added} words not added to dictionary`);
    // The final dictionary is of the form
    // {length: {word: value, word: value, ...}, length: {word: value, ...}, ...}
    return dictionary;
}

function select_dictionary() {
    deselect_crossword();
    let name = dom.info.dictselect.value;
    the_dictionary = dictionaries[name];
    console.log(`Selected dictionary: ${name}`);
}

function upload_dictionary() {
    let files = dom.buttons.upload.files;
    if (files.length != 1) return;
    const file = files[0];
    let reader = new FileReader();
    reader.onload = () => {
        if (reader.result) {
            add_dictionary(file.name, reader.result);
            dom.info.dictselect.value = file.name;
            select_dictionary();
        }
    };
    reader.onerror = (e) => alert(e.target.error.name);
    reader.readAsText(file);
}



////////////////////////////////////////////////////////////////////////////////
// Cells 

function cell_x(cell) {
    return cell.cellIndex;
}

function cell_y(cell) {
    return cell.parentElement.rowIndex;
}

function move_to_cell(cell, dx, dy) {
    return crossword_cell(cell_x(cell) + dx, cell_y(cell) + dy);
}

function next_cell(cell, horiz) {
    return move_to_cell(cell, horiz, !horiz);
}

function prev_cell(cell, horiz) {
    return move_to_cell(cell, -horiz, -!horiz);
}

function cell_isletter(cell)  {
    let val = cell_value(cell);
    return val && val.length == 1;
}

function cell_isblocked(cell) {
    let val = cell_value(cell);
    return val && val.length > 1;
}

function cell_isempty(cell) {
    return !cell_value(cell);
}

function clear_cell(cell) {
    set_cell_value(cell, "");
}

function cell_value(cell) {
    return cell.innerText;
}

function set_cell_value(cell, val) {
    cell.innerText = val;
    cell.classList.toggle("blocked", val.length > 1);
}

function cell_clue(cell) {
    let val = cell_value(cell);
    let result = window.prompt("Skriv en ledtråd (avbryt för att ta bort ledtråden)", val);
    if (result && result.length > 1) {
        set_cell_value(cell, result);
    } else {
        clear_cell(cell);
    }
}

function select_cell(cell) {
    cell.classList.add("selected");
}

function deselect_all_cells() {
    for (let c of dom.crossword.table.querySelectorAll(".selected")) {
        c.classList.remove("selected");
    }
}


////////////////////////////////////////////////////////////////////////////////
// The crossword

var the_crossword;

function init_crossword(width, height) {
    the_crossword = {
        cwords: [],
        theme: {
            words: [],
            vector: null,
            sim: 0,
        },
        selection: {
            start: null,
            cword: null,
        },
    };
    for (let y = 0; y < height; y++) {
        insert_crossword_row(y, width);
    }
    document.onmouseup = on_mouse_up;
    dom.buttons.reset.onclick = clear_crossword;
    for (let btn of dom.buttons.resize) {
        btn.onclick = resize_crossword.bind(btn);
    }
}

function insert_crossword_cell(x, y) {
    let row = dom.crossword.table.rows[y];
    let cell = row.insertCell(x);
    cell.onmousedown = on_mouse_down;
    cell.onmouseenter = on_mouse_enter;
    cell.ondblclick = on_dbl_click;
    cell.onclick = on_click;
}

function insert_crossword_row(y, width=null) {
    if (!width) width = crossword_width();
    let row = dom.crossword.table.insertRow(y);
    for (let x = 0; x < width; x++) {
        insert_crossword_cell(x, y);
    }
    for (let cword of the_crossword.cwords) {
        if (cword.y >= y) cword.y++;
    }
}

function insert_crossword_column(x, height=null) {
    if (!height) height = crossword_height();
    for (let y = 0; y < height; y++) {
        insert_crossword_cell(x, y);
    }
    for (let cword of the_crossword.cwords) {
        if (cword.x >= x) cword.x++;
    }
}

function delete_crossword_row(y) {
    if (crossword_height() <= 2) {
        alert("Ett korsord måste ha minst två rader!");
        return;
    }
    for (let x = 0; x < crossword_width(); x++) {
        if (!cell_isempty(crossword_cell(x, y))) {
            alert("Raden är inte tom! Ta bort alla bokstäver och ledtrådar innan du kan ta bort den.");
            return;
        }
    }
    dom.crossword.table.deleteRow(y);
    for (let cword of the_crossword.cwords) {
        if (cword.y > y) cword.y--;
    }
}

function delete_crossword_column(x) {
    if (crossword_width() <= 2) {
        alert("Ett korsord måste ha minst två kolumner!");
        return;
    }
    for (let y = 0; y < crossword_height(); y++) {
        if (!cell_isempty(crossword_cell(x, y))) {
            alert("Kolumnen är inte tom! Ta bort alla bokstäver och ledtrådar innan du kan ta bort den.");
            return;
        }
    }
    for (let y = 0; y < crossword_height(); y++) {
        dom.crossword.table.rows[y].deleteCell(x);
    }
    for (let cword of the_crossword.cwords) {
        if (cword.x > x) cword.x--;
    }
}

function crossword_height() {
    return dom.crossword.table.rows.length;
}

function crossword_width() {
    return dom.crossword.table.rows[0].cells.length;
}

function resize_crossword() {
    let gs =
        this.classList.contains("grow")   ? "grow"   :
        this.classList.contains("shrink") ? "shrink" : null;
    let dir =
        this.classList.contains("n") ? "n" :
        this.classList.contains("s") ? "s" :
        this.classList.contains("e") ? "e" :
        this.classList.contains("w") ? "w" : null;

    deselect_crossword();
    if (gs == "grow") {
        if (dir == "n" || dir == "s") {
            insert_crossword_row(dir == "n" ? 0 : crossword_height());
        } else if (dir == "e" || dir == "w") {
            insert_crossword_column(dir == "w" ? 0 : crossword_width());
        }                
    } else if (gs == "shrink") {
        if (dir == "n" || dir == "s") {
            delete_crossword_row(dir == "n" ? 0 : crossword_height()-1);
        } else if (dir == "e" || dir == "w") {
            delete_crossword_column(dir == "w" ? 0 : crossword_width()-1);
        }
    }
    redraw_crossword();
}

function crossword_cell(x, y) {
    return 0 <= x && x < crossword_width() && 0 <= y && y < crossword_height() &&
        dom.crossword.table.rows[y].cells[x];
}

function all_crossword_cells() {
    return dom.crossword.table.getElementsByTagName('td');
}

function add_word_to_crossword(cword, dryrun=false) {
    if (!dryrun) {
        console.log(`Added "${cword.word}" at ${cword.x}:${cword.y}${cword.horiz?"\u2192":"\u2193"}`);
        add_word_to_crossword(cword, true);
        the_crossword.cwords.push(cword);
        calculate_theme();
    }
    let cell = crossword_cell(cword.x, cword.y);
    for (let ch of cword.word) {
        if (cell && (cell_isempty(cell) || cell_value(cell) == ch)) {
            if (!dryrun) set_cell_value(cell, ch);
            cell = next_cell(cell, cword.horiz);
        } else {
            throw `Failed to add "${cword.word}" at ${cword.x}:${cword.y}${cword.horiz?"\u2192":"\u2193"}`;
        }
    }
}

function delete_words_at_position(x, y) {
    let occupied_by = (cword) => cword.horiz
        ? y == cword.y && cword.x <= x && x < cword.x + cword.word.length
        : x == cword.x && cword.y <= y && y < cword.y + cword.word.length;
    the_crossword.cwords = the_crossword.cwords.filter(
        (cword) => occupied_by(cword)
            ? console.log(`Deleted "${cword.word}" at ${cword.x}:${cword.y}${cword.horiz?"\u2192":"\u2193"}`)
            : true
    );
    redraw_crossword();
}

function redraw_crossword() {
    deselect_crossword();
    for (let cell of all_crossword_cells()) {
        if (cell_isletter(cell)) {
            clear_cell(cell);
        }
    }
    let cwords = the_crossword.cwords;
    the_crossword.cwords = [];
    for (let cw of cwords) {
        add_word_to_crossword(cw);
    }
}

function clear_crossword() {
    let ok = confirm("Är du säker att du vill radera korsordet?");
    if (ok) {
        deselect_crossword();
        the_crossword.cwords = [];
        for (let cell of all_crossword_cells()) {
            clear_cell(cell);
        }
    }
}

function cells_to_cword(start, goal) {
    let xlen = Math.abs(cell_x(goal) - cell_x(start)),
        ylen = Math.abs(cell_y(goal) - cell_y(start));
    let horiz = xlen >= ylen;
    goal = horiz
        ? crossword_cell(cell_x(goal), cell_y(start))
        : crossword_cell(cell_x(start), cell_y(goal));
    if (xlen || ylen) {
        let dx = Math.sign(cell_x(goal) - cell_x(start)),
            dy = Math.sign(cell_y(goal) - cell_y(start));
        let cell = start;
        while (cell != goal) {
            let next = move_to_cell(cell, dx, dy);
            if (cell_isblocked(next)) break;
            cell = next;
        }
        goal = cell;
        // extend selection
        cell = move_to_cell(start, -dx, -dy);
        while (cell && cell_isletter(cell)) {
            start = cell;
            cell = move_to_cell(cell, -dx, -dy);
        }
        cell = move_to_cell(goal, dx, dy);
        while (cell && cell_isletter(cell)) {
            goal = cell;
            cell = move_to_cell(cell, dx, dy);
        }
        // swap start, goal if necessary
        if (dx + dy < 0) [start, goal] = [goal, start];
    }
    let word = new Array(horiz
                         ? 2 + cell_x(goal) - cell_x(start)
                         : 2 + cell_y(goal) - cell_y(start)
                        ).join(".");
    return {word: word, x: cell_x(start), y: cell_y(start), horiz: horiz};
}

function draw_selection() {
    deselect_all_cells();
    let sel = selected_cword();
    if (!sel) return;
    let cell = crossword_cell(sel.x, sel.y);
    for (let i = 0; i < sel.word.length; i++) {
        if (cell_isblocked(cell)) break;
        select_cell(cell);
        cell = next_cell(cell, sel.horiz);
    }
}

function infer_constraints() {
    let wordregex = "";
    let constraints = [];
    let sel = selected_cword();
    let cell = crossword_cell(sel.x, sel.y);
    for (let _c of sel.word) {
        let char;
        let constr = "?";
        if (cell_isletter(cell)) {
            wordregex += cell_value(cell);
            constraints.push("?");
        } else {
            let orthcell = prev_cell(cell, !sel.horiz);
            while (orthcell && cell_isletter(orthcell)) {
                constr = cell_value(orthcell) + constr;
                orthcell = prev_cell(orthcell, !sel.horiz);
            }
            orthcell = next_cell(cell, !sel.horiz);
            while (orthcell && cell_isletter(orthcell)) {
                constr = constr + cell_value(orthcell);
                orthcell = next_cell(orthcell, !sel.horiz);
            }
            wordregex += "?";
            constraints.push(constr);
        }
        cell = next_cell(cell, sel.horiz);
    }
    return [wordregex, constraints];
}

function check_constraints(word, constraints) {
    for (let i = 0; i < word.length; i++) {
        let len = constraints[i].length;
        if (len > 1) {
            let wordlist = the_dictionary[len];
            if (!(wordlist && constraints[i].replace("?", word[i]) in wordlist))
                return false;
        }
    }
    return true;
}

function find_matching_words() {
    clear_wordlist();
    let found = 0;
    let [regex, constraints] = infer_constraints();
    if (regex.indexOf("?") < 0) {
        window.setTimeout(deselect_crossword, 100);
        return;
    }
    start_wordlist();
    {
        let time = -Date.now();
        let wordlen = regex.length;
        regex = new RegExp("^" + regex.replaceAll("?", "[" + config.alphabet + "]") + "$");
        let wordlist = the_dictionary[wordlen];
        if (wordlist) {
            let sel = selected_cword();
            for (let word in wordlist) {
                if (regex.test(word)) {
                    if (check_constraints(word, constraints)) {
                        found++;
                        let cword = {word:word, x:sel.x, y:sel.y, horiz:sel.horiz, value:wordlist[word]};
                        let choice = add_to_wordlist(cword);
                    }
                }
            }
        }
        time += Date.now();
        console.log(`${found} matches, in ${time} ms`);
        show_wordlist();
    }
}

function selection_start() {
    return the_crossword.selection.start;
}

function set_selection_start(cell) {
    the_crossword.selection.start = cell;
    dom.crossword.table.classList.toggle("selecting", cell != null);
}

function selected_cword() {
    return the_crossword.selection.cword;
}

function set_selected_cword(cword) {
    the_crossword.selection.cword = cword;
}

function deselect_crossword() {
    set_selection_start(null);
    set_selected_cword(null);
    clear_wordlist();
    deselect_all_cells();
}

function on_click(evt) {
    evt.preventDefault();
    deselect_crossword();
}

function on_dbl_click(evt) {
    evt.preventDefault();
    deselect_crossword();
    let cell = evt.currentTarget;
    if (cell_isletter(cell)) {
        delete_words_at_position(cell_x(cell), cell_y(cell));
    } else {
        cell_clue(cell);
    }
}

function on_mouse_up(evt) {
    evt.preventDefault();
    if (!selection_start()) return;
    if (selected_cword().word.length <= 1) {
        deselect_crossword();
        return;
    }
    set_selection_start(null);
    find_matching_words();
}

function on_mouse_down(evt) {
    evt.preventDefault();
    clear_wordlist();
    let cell = evt.currentTarget;
    set_selection_start(cell);
    set_selected_cword(cells_to_cword(cell, cell));
    draw_selection();
}

function on_mouse_enter(evt) {
    evt.preventDefault();
    if (!selection_start()) return;
    let cell = evt.currentTarget;
    set_selected_cword(cells_to_cword(selection_start(), cell));
    draw_selection();
}


////////////////////////////////////////////////////////////////////////////////
// Theme

function calculate_theme() {
    let cwords = the_crossword.cwords.filter((w) => is_wordvector(w.value));

    // The number of words in the theme group is 1/2 of the words in the crossword, but at most 5:
    let groupsize = Math.min(Math.ceil(cwords.length / 2), 5);
    if (groupsize > 1) {
        let combinations = cwords.length <= 15 ? yield_combinations : random_combinations;
        let similarities = [];
        for (let comb of combinations(cwords, groupsize, 3000)) {
            let average = average_vectors(...comb.map((w) => w.value));
            let sim = comb.reduce((sum, w) => sum + cosine_similarity(w.value, average), 0) / comb.length;
            similarities.push({
                words: comb.map((w) => w.word),
                vector: average,
                sim: sim,
            });
        }
        similarities.sort((a,b) => b.sim - a.sim);
        the_crossword.theme = similarities[0];
    }
}


////////////////////////////////////////////////////////////////////////////////
// Wordlist suggestions

var the_wordlist;

function set_wordlist_heading(head) {
    dom.wordlist.heading.innerText = head;
}

function clear_wordlist() {
    set_visibility(dom.wordlist.container, false);
    set_wordlist_heading("");
    dom.wordlist.content.innerHTML = "";
    dom.wordlist.filter.value = "";
    the_wordlist = [];
}

function start_wordlist() {
    dom.wordlist.filter.oninput = show_wordlist;
    dom.buttons.reload.onclick = show_wordlist;
    dom.buttons.addword.onclick = add_filter_to_crossword;
    set_visibility(dom.wordlist.container, true);
    if (selected_cword().word)
        dom.wordlist.filter.maxLength = selected_cword().word.length;
    else
        dom.wordlist.filter.removeAttribute('maxLength');
}

function set_visibility(elem, visible) {
    elem.style.display = visible ? "" : "none";
}

function add_filter_to_crossword() {
    let newword = selected_cword();
    newword.word = dom.wordlist.filter.value.toUpperCase();
    add_word_to_crossword(newword);
}

function show_wordlist() {
    dom.wordlist.intro.innerHTML = "";
    dom.wordlist.content.innerHTML = "";
    let notletter = new RegExp("[^" + config.alphabet + "]", "g");
    let filtervalue = dom.wordlist.filter.value;
    filtervalue = filtervalue.toUpperCase().replaceAll(notletter, "");
    dom.wordlist.filter.value = filtervalue;
    let regex = filtervalue.replaceAll("", ".*");
    regex = new RegExp("^" + regex + "$");
    let filtered = the_wordlist.filter((cw) => cw.word.match(regex));
    console.log(`Filtered ${the_wordlist.length} words --> ${filtered.length} words`);
    dom.wordlist.intro.innerHTML = "Filtrera genom att skriva bokstäver i sökrutan:";
    set_visibility(dom.buttons.reload, filtered.length > config.maxresults);
    set_visibility(dom.buttons.addword, dom.wordlist.filter.value.length == selected_cword().word.length);

    if (the_crossword.theme.sim > 0) {
        shuffle_by_vector_similarity(filtered, the_crossword.theme.sim, the_crossword.theme.vector);
    } else {
        shuffle(filtered);
    }

    if (the_wordlist.length == 0) {
        set_wordlist_heading("Inga ord passar");
        dom.wordlist.intro.innerHTML = "Vill du lägga till ett eget ord?";
    } else if (filtered.length > config.maxresults) {
        set_wordlist_heading(`Visar ${config.maxresults} ord av ${the_wordlist.length} passande`);
        dom.wordlist.intro.innerHTML = 
            "För många resultat, jag visar bara ett slumpmässigt urval.<br/>" +
            "Filtrera genom att skriva bokstäver i sökrutan:";
        filtered.length = config.maxresults;
    } else if (filtered.length == the_wordlist.length) {
        set_wordlist_heading(`Visar ${filtered.length} passande ord`);
        dom.wordlist.intro.innerHTML = "Filtrera genom att skriva bokstäver i sökrutan:";
    } else {
        set_wordlist_heading(`Visar ${filtered.length} ord av ${the_wordlist.length} passande`);
        dom.wordlist.intro.innerHTML = "Filtrera genom att skriva bokstäver i sökrutan:";
    }
    // filtered.sort((a,b) => a.word.localeCompare(b.word));
    for (let cw of filtered) {
        let btn = document.createElement('button');
        dom.wordlist.content.append(btn);
        btn.innerText = cw.word;
        btn.onclick = (() => {
            add_word_to_crossword(cw);
            deselect_crossword();
        }).bind(the_crossword);
    }
    window.setTimeout(() => dom.wordlist.filter.focus(), 100);
}

function add_to_wordlist(word) {
    the_wordlist.push(word);
}

////////////////////////////////////////////////////////////////////////////////
// Utilities for selecting and shuffling

// Fisher–Yates shuffle:
// https://en.wikipedia.org/wiki/Fisher–Yates_shuffle
function shuffle(arr) {
    for (let i = arr.length-1; i > 0; i--) {
        let index = Math.floor((i + 1) * Math.random());
        [arr[i], arr[index]] = [arr[index], arr[i]];
    }
}

function shuffle_by_vector_similarity(words, defaultsim, simvector) {
    for (let w of words) {
        let sim = defaultsim;
        if (is_wordvector(w.value)) {
            sim = cosine_similarity(w.value, simvector);
        }
        // w.rank = -sim;
        w.rank = Math.random() ** sim;
        // w.rank = 1 - sim + Math.random() / 10;
        // w.rank = Math.random() * (1 - sim);
        // w.rank = -(Math.random() ** (1.0 / sim));
        w.sim = sim;
    }
    words.sort((w,v) => w.rank - v.rank);
}

// Generator yielding all possible combinations
// Note: (15 choose 5) > 3000 and (20 choose 5) > 15000
// so for larger crosswords we should use random sampling instead
function* yield_combinations(arr, k) {
    if (arr.length == k) yield arr;
    else if (k == 0) yield [];
    else {
        for (let rest of yield_combinations(arr.slice(1), k-1)) yield [arr[0], ...rest];
        for (let rest of yield_combinations(arr.slice(1), k)) yield rest;
    }
}

// Generator yielding `max` random combinations
// Note 1: this shuffles the array in-place!
// Note 2: this might yield duplicates
function* random_combinations(arr, k, max) {
    for (let i = 0; i < max; i++) {
        shuffle(arr);
        yield arr.slice(0, k);
    }
}


////////////////////////////////////////////////////////////////////////////////
// Word vectors

function parse_base64_bitvector(base64string) {
    try {
        return Uint8Array.from(atob(base64string), c => c.charCodeAt(0));
    } catch(e) {
        return null;
    }
}

function expand_bitvector(vector) {
    if (vector instanceof Uint8Array) {
        return new Int8Array(8 * vector.length).map(
            (_,i) => vector[Math.floor(i / 8)] & (128 >> (i % 8)) ? 1 : -1
        );
    } else {
        return vector;
    }
}

function lookup_vector(vector, i) {
    if (vector instanceof Uint8Array) {
        return vector[Math.floor(i / 8)] & (128 >> (i % 8)) ? 1 : -1;
    } else {
        return vector[i];
    }
}

function is_wordvector(vector) {
    return vector && vector.BYTES_PER_ELEMENT;
}

function parse_wordvector(vector) {
    if (typeof(vector) === "string") {
        vector = vector.trim().split(/\s+/);
    }
    vector = vector.map(parseFloat);
    if (!vector.every(isFinite)) {
        return null;
    } else if (!vector.every(Number.isInteger)) {
        return Float32Array.from(vector);
    } else if (vector.every((n) => -128 <= n && n <= 127)) {
        return Int8Array.from(vector);
    } else if (vector.every((n) => -32768 <= n && n <= 32767)) {
        return Int16Array.from(vector);
    } else {
        return null;
    }
}

function add_vectors(vec, ...vectors) {
    return expand_bitvector(vec).map(
        (val, i) => vectors.reduce((sum, v) => sum + lookup_vector(v, i), val)
    );
}

function average_vectors(vec, ...vectors) {
    let size = 1 + vectors.length;
    return expand_bitvector(vec).map(
        (val, i) => vectors.reduce((sum, v) => sum + lookup_vector(v, i), val) / size
    );
}

function dot_product(vec1, vec2) {
    return expand_bitvector(vec1).reduce((sum, val, i) => sum + val * lookup_vector(vec2, i), 0);
}

function cosine_similarity(vec1, vec2) {
    return (dot_product(vec1, vec2)) / (magnitude(vec1) * magnitude(vec2));
}

function magnitude(vec) {
    return Math.sqrt(expand_bitvector(vec).reduce((sum, val) => sum + val*val, 0));
}
