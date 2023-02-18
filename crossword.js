
var dom;

const config = {
    width: 15,
    height: 10,
    alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖÜ",
    maxresults: 200,
};


// Change this to true if you want debugging information
const DEBUG = false;


window.addEventListener('DOMContentLoaded', initialize);

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

    dom.buttons.help.addEventListener('click', show_help);
    init_dictionaries();
    load_crossword() || init_crossword(config.width, config.height);
    console.log("Finished initialization");
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
// Dictionaries

if (typeof D === "undefined") var D = {};

var the_dictionaries = {};

function init_dictionaries() {
    dom.info.dictselect.addEventListener('change', deselect_crossword);
    dom.buttons.upload.addEventListener('change', upload_dictionary);
    for (let name in D) {
        add_dictionary(name, D[name]);
    }
    console.log("Finished loading dictionaries");
}

function add_dictionary(name, dict) {
    the_dictionaries[name] = {};
    function add_to_dict(word, value=true) {
        word = word.toUpperCase();
        if (!the_dictionaries[name][word.length]) the_dictionaries[name][word.length] = {};
        the_dictionaries[name][word.length][word] = value;
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
                } else if (line.length === 1) {
                    add_to_dict(word);
                } else if (line.length === 2) {
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
                        if (word.length !== len) {
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
    // The final dictionary is of the form
    // {length: {word: value, word: value, ...}, length: {word: value, ...}, ...}

    let dictsize = 0;
    for (let subdict of Object.values(the_dictionaries[name])) {
        dictsize += Object.keys(subdict).length;
    }

    let opt = document.createElement('option');
    opt.value = name;
    opt.text = `${name} (${dictsize} ord)`;
    dom.info.dictselect.add(opt);
    console.log(`Added dictionary: ${name}, size ${dictsize} words` +
                (not_added>0 ? ` (${not_added} words not added)`: ""));
}

function lookup_dictionary(len) {
    return the_dictionaries[dom.info.dictselect.value][len];
}

function upload_dictionary() {
    let files = dom.buttons.upload.files;
    if (files.length !== 1) return;
    const file = files[0];
    let reader = new FileReader();
    reader.addEventListener('load', () => {
        if (reader.result) {
            add_dictionary(file.name, reader.result);
            dom.info.dictselect.value = file.name;
        }
    });
    reader.addEventListener('error', (e) => alert(e.target.error.name));
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
    return val && val.length === 1;
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
    cell.classList.value = "";
}

function cell_value(cell) {
    return cell.innerText;
}

function set_cell_value(cell, val) {
    cell.innerText = val;
    cell.classList.toggle("blocked", val.length > 1);
}

function edit_cell_clue(cell) {
    let val = cell_value(cell);
    let result = window.prompt("Skriv en ledtråd (avbryt för att ta bort ledtråden)", val);
    if (result && result.length > 1) {
        set_cell_value(cell, result);
    } else {
        clear_cell(cell);
    }
    save_crossword();
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
        theme: null,
        selection: {
            start: null,
            cells: null,
        },
    };

    dom.crossword.table.innerHTML = null;

    for (let y = 0; y < height; y++) {
        insert_crossword_row(y, width);
    }
    document.addEventListener('mouseup', on_mouse_up);
    dom.buttons.reset.addEventListener('click', clear_crossword);
    for (let btn of dom.buttons.resize) {
        btn.addEventListener('click', resize_crossword.bind(btn));
    }
    deselect_crossword();
}

function insert_crossword_cell(x, y) {
    let row = dom.crossword.table.rows[y];
    let cell = row.insertCell(x);
    cell.addEventListener('mousedown', on_mouse_down);
    cell.addEventListener('mouseenter', on_mouse_enter);
    cell.addEventListener('dblclick', on_dbl_click);
    cell.addEventListener('click', on_click);
}

function insert_crossword_row(y, width=null) {
    if (!width) width = crossword_width();
    let row = dom.crossword.table.insertRow(y);
    for (let x = 0; x < width; x++) {
        insert_crossword_cell(x, y);
    }
}

function insert_crossword_column(x, height=null) {
    if (!height) height = crossword_height();
    for (let y = 0; y < height; y++) {
        insert_crossword_cell(x, y);
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

    if (gs === "grow") {
        if (dir === "n" || dir === "s") {
            insert_crossword_row(dir === "n" ? 0 : crossword_height());
        } else if (dir === "e" || dir === "w") {
            insert_crossword_column(dir === "w" ? 0 : crossword_width());
        }                
    } else if (gs === "shrink") {
        if (dir === "n" || dir === "s") {
            delete_crossword_row(dir === "n" ? 0 : crossword_height()-1);
        } else if (dir === "e" || dir === "w") {
            delete_crossword_column(dir === "w" ? 0 : crossword_width()-1);
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

function add_word_to_crossword(word) {
    let cells = the_crossword.selection.cells;
    cells.forEach((cell, i) => {
        let ch = word.charAt(i);
        if (cell && (cell_isempty(cell) || cell_value(cell) === ch)) {
            set_cell_value(cell, ch);
        } else {
            throw `Failed to add "${word}" at ${cell_x(cells[0])}:${cell_y(cells[0])}`;
        }
    });
    console.log(`Added "${word}" at ${cell_x(cells[0])}:${cell_y(cells[0])}`);
    the_crossword.cwords.push(cells);
    redraw_crossword();
    save_crossword();
}

function cells_to_word(cells) {
    return cells.map((c) => cell_isletter(c) ? cell_value(c) : ".").join("");
}

function redraw_crossword() {
    deselect_crossword();
    let occupied_cells = new Map();
    for (let cword of the_crossword.cwords) {
        for (let i = 0; i < cword.length; i++) {
            let cell = cword[i];
            let css_class = occupied_cells.get(cell);
            if (!css_class && 0 < i && i < cword.length - 1) {
                if (cell_x(cword[i-1]) === cell_x(cell) && cell_x(cell) < cell_x(cword[i+1])) {
                    css_class = 'right-turn';
                } else if (cell_x(cword[i-1]) < cell_x(cell) && cell_x(cell) === cell_x(cword[i+1])) {
                    css_class = 'down-turn';
                }
            } 
            occupied_cells.set(cell, css_class);
        }
    }
    for (let cell of all_crossword_cells()) {
        if (occupied_cells.has(cell)) {
            cell.classList.value = occupied_cells.get(cell);
            cell.classList.add("letter");
        } else if (!cell_isblocked(cell)) {
            clear_cell(cell);
        }
    }
    calculate_theme();
}

function delete_words_at_cell(cell) {
    deselect_crossword();
    let occupied_by = (cword) => cword.some((c) => c === cell);
    let to_remove = the_crossword.cwords.filter(occupied_by);
    if (to_remove.length === 0) return;
    let ok = confirm("Är du säker att du vill ta bort " +
                     (to_remove.length>1 ? "orden " : "ordet ") +
                     to_remove.map((cw) => cells_to_word(cw)).join(" och ") + "?");
    if (!ok) return;
    the_crossword.cwords = the_crossword.cwords.filter((cw) => !occupied_by(cw));
    redraw_crossword();
}

function clear_crossword() {
    let ok = confirm("Är du säker att du vill radera korsordet?");
    if (!ok) return;
    deselect_crossword();
    the_crossword.cwords = [];
    for (let cell of all_crossword_cells()) clear_cell(cell);
    redraw_crossword();
    save_crossword();
}

function calculate_selection(start, goal) {
    let xlen = Math.abs(cell_x(goal) - cell_x(start)),
        ylen = Math.abs(cell_y(goal) - cell_y(start));
    let horiz = xlen >= ylen;
    let newgoal = horiz
        ? crossword_cell(cell_x(goal), cell_y(start))
        : crossword_cell(cell_x(start), cell_y(goal));
    if (xlen || ylen) {
        let dx = Math.sign(cell_x(newgoal) - cell_x(start)),
            dy = Math.sign(cell_y(newgoal) - cell_y(start));
        let cell = start;
        while (cell !== newgoal) {
            let next = move_to_cell(cell, dx, dy);
            if (cell_isblocked(next)) break;
            cell = next;
        }
        newgoal = cell;
        // extend selection
        cell = move_to_cell(start, -dx, -dy);
        while (cell && cell_isletter(cell)) {
            start = cell;
            cell = move_to_cell(cell, -dx, -dy);
        }
        cell = move_to_cell(newgoal, dx, dy);
        while (cell && cell_isletter(cell)) {
            newgoal = cell;
            cell = move_to_cell(cell, dx, dy);
        }
        // swap start, goal if necessary
        if (dx + dy < 0) [start, newgoal] = [newgoal, start];
    }

    let wordlen = 1 + cell_x(newgoal) - cell_x(start) + cell_y(newgoal) - cell_y(start);
    let cell = start, cells = [];
    for (let i = 0; i < wordlen; i++) {
        cells.push(cell);
        cell = next_cell(cell, horiz);
    }

    let crossing_words = the_crossword.cwords.filter((cw) => cw.some((c) => c === newgoal));
    if (crossing_words.length > 0) {
        if (horiz  && cell_x(newgoal) === cell_x(goal) && cell_y(newgoal) < cell_y(goal) ||
            !horiz && cell_y(newgoal) === cell_y(goal) && cell_x(newgoal) < cell_x(goal) ||
            horiz  && newgoal.classList.contains('down-turn') ||
            !horiz && newgoal.classList.contains('right-turn'))
        {
            for (let cw of crossing_words) {
                let i = 1 + cw.indexOf(newgoal);
                if (0 < i && i < cw.length && next_cell(newgoal, !horiz) === cw[i]) {
                    while (i < cw.length) {
                        cells.push(cw[i++]);
                    }
                    break;
                }
            }
        }
    }
    return cells;
}

function draw_selection() {
    deselect_all_cells();
    let cells = the_crossword.selection.cells;
    if (!cells) return;
    cells.forEach(select_cell);
}

function infer_constraints() {
    let wordregex = "";
    let constraints = [];
    let cells = the_crossword.selection.cells;
    for (let i = 0; i < cells.length; i++) {
        let cell = cells[i];
        if (cell_isletter(cell)) {
            wordregex += cell_value(cell);
            constraints.push("?");
        } else {
            let constr = "?";
            let horiz = cell_y(cell) === cell_y(cells[i>0 ? i-1 : i+1]);
            let orthcell = prev_cell(cell, !horiz);
            while (orthcell && cell_isletter(orthcell)) {
                constr = cell_value(orthcell) + constr;
                orthcell = prev_cell(orthcell, !horiz);
            }
            orthcell = next_cell(cell, !horiz);
            while (orthcell && cell_isletter(orthcell)) {
                constr = constr + cell_value(orthcell);
                orthcell = next_cell(orthcell, !horiz);
            }
            wordregex += "?";
            constraints.push(constr);
        }
    }
    console.log(`Constraints: ${wordregex} / ${constraints.join(", ")}`);
    return [wordregex, constraints];
}

function check_constraints(word, constraints) {
    for (let i = 0; i < word.length; i++) {
        let len = constraints[i].length;
        if (len > 1) {
            let wordlist = lookup_dictionary(len);
            if (!(wordlist && constraints[i].replace("?", word[i]) in wordlist))
                return false;
        }
    }
    return true;
}

function deselect_crossword() {
    the_crossword.selection.cells = null;
    the_crossword.selection.start = null;
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
        delete_words_at_cell(cell);
    } else {
        edit_cell_clue(cell);
    }
}

function on_mouse_up(evt) {
    evt.preventDefault();
    if (!the_crossword.selection.start) return;
    if (the_crossword.selection.cells.length <= 1) {
        deselect_crossword();
        return;
    }
    the_crossword.selection.start = null;
    find_matching_words();
}

function on_mouse_down(evt) {
    evt.preventDefault();
    clear_wordlist();
    let cell = evt.currentTarget;
    the_crossword.selection.start = cell;
    the_crossword.selection.cells = calculate_selection(cell, cell);
    draw_selection();
}

function on_mouse_enter(evt) {
    evt.preventDefault();
    if (!the_crossword.selection.start) return;
    let cell = evt.currentTarget;
    the_crossword.selection.cells = calculate_selection(the_crossword.selection.start, cell);
    draw_selection();
}

////////////////////////////////////////////////////////////////////////////////
// Import/export

function export_crossword() {
    return {
        width: crossword_width(),
        height: crossword_height(),
        cwords: the_crossword.cwords
            .map(cells => cells.map(cell => ({
                x: cell_x(cell),
                y: cell_y(cell)
            }))),
        cells: Array.from(all_crossword_cells()).map(export_cell)
    };
}

function export_cell(cell) {
    return cell.innerText;
}

function import_crossword(raw_crossword) {
    init_crossword(raw_crossword.width, raw_crossword.height);

    Array.from(all_crossword_cells())
        .forEach(function (cell, idx) { import_cell(cell, raw_crossword.cells[idx]) });
    the_crossword.cwords = raw_crossword.cwords
        .map(word_coords => word_coords.map(coord => crossword_cell(coord.x, coord.y)));

    redraw_crossword();
}

function import_cell(cell, raw_cell) {
    set_cell_value(cell, raw_cell);
}

function save_crossword() {
    window.localStorage.crossword = JSON.stringify(export_crossword());
}

function load_crossword() {
    try {
        import_crossword(JSON.parse(window.localStorage.crossword));
        return true;
    } catch (e) {
        return false;
    }
}

////////////////////////////////////////////////////////////////////////////////
// Theme

const THEME_CONSTANTS = {
    min_avg_sim: 0,
    min_best_sim: 0.15,
    min_word_sim: 0.15,
    min_sim_multiplier: 0.5,
};

function calculate_theme() {
    // Collect all cross-words that have a wordvector
    let cwords = the_crossword.cwords.flatMap((cells) => {
        let word = cells_to_word(cells);
        let wordlist = lookup_dictionary(word.length);
        if (!wordlist) return [];
        let vector = wordlist[word];
        if (!is_wordvector(vector)) return [];
        return {vector:vector, cells:cells, word:word};
    });

    // Clear the highlighted cross-words
    the_crossword.theme = null;
    for (let cell of all_crossword_cells()) {
        cell.classList.remove("theme");
    }
    if (DEBUG) document.getElementById("debug-theme").innerText = "";

    // We need at least 3 words to be able to infer a theme
    if (cwords.length <= 2) return;

    // The theme is the word that is the closest to all other words
    let theme_avg_sim = -1, theme_all_sims = null, theme_word = null;
    for (let word of cwords) {
        let all_sims = cwords.map((other) => cosine_similarity(word.vector, other.vector));
        let avg_sim = all_sims.reduce((sum, sim) => sum + sim, 0) / all_sims.length;
        if (avg_sim > theme_avg_sim) {
            theme_avg_sim = avg_sim;
            theme_all_sims = all_sims;
            theme_word = word;
        }
    }

    // The best similarity is the 2nd highest (because the highest is always 1)
    let best_sim = theme_all_sims.reduce((max, sim) => sim < 0.99 && sim > max ? sim : max, 0);

    // Both the average and best similarity have to be good enough
    if (theme_avg_sim <= THEME_CONSTANTS.min_avg_sim
        || best_sim <= THEME_CONSTANTS.min_best_sim) return;
    the_crossword.theme = theme_word.vector;

    // Find the cross-words that are close enough to the theme word
    let theme_group = cwords.filter(
        (word, i) => theme_all_sims[i] >= best_sim * THEME_CONSTANTS.min_sim_multiplier
            && theme_all_sims[i] >= THEME_CONSTANTS.min_word_sim
    );
    // Highlight them
    for (let word of theme_group)
        for (let cell of word.cells)
            cell.classList.add("theme");

    if (DEBUG) {
        let debuginfo = `Theme: ${theme_word.word} (avg sim ${theme_avg_sim.toFixed(2)})` +
            " — group: " + theme_group.map(
                (w,i) => `${w.word} (${cosine_similarity(theme_word.vector, w.vector).toFixed(2)})`
            ).join(", ");
        console.log(debuginfo);
        document.getElementById("debug-theme").innerText = debuginfo;
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

function find_matching_words() {
    clear_wordlist();
    let found = 0;
    let [regex, constraints] = infer_constraints();
    if (regex.indexOf("?") < 0) {
        window.setTimeout(deselect_crossword, 100);
        return;
    }

    dom.wordlist.filter.addEventListener('input', show_wordlist);
    dom.buttons.reload.addEventListener('click', show_wordlist);
    dom.buttons.addword.addEventListener('click', add_filter_to_crossword);
    set_visibility(dom.wordlist.container, true);
    if (the_crossword.selection.cells.length > 0)
        dom.wordlist.filter.maxLength = the_crossword.selection.cells.length;
    else
        dom.wordlist.filter.removeAttribute('maxLength');

    let time = -Date.now();
    let wordlen = regex.length;
    regex = new RegExp("^" + regex.replaceAll("?", "[" + config.alphabet + "]") + "$");
    let wordlist = lookup_dictionary(wordlen);
    if (wordlist) {
        for (let word in wordlist) {
            if (regex.test(word)) {
                if (check_constraints(word, constraints)) {
                    found++;
                    the_wordlist.push({word:word, value:wordlist[word]});
                }
            }
        }
    }
    time += Date.now();
    console.log(`${found} matches, in ${time} ms`);
    show_wordlist();
}

function add_filter_to_crossword() {
    if (filter_can_be_added()) {
        let word = dom.wordlist.filter.value.toUpperCase();
        add_word_to_crossword(word);
    }
}

function filter_can_be_added() {
    return dom.wordlist.filter.value.length === the_crossword.selection.cells.length &&
        new RegExp('^' + cells_to_word(the_crossword.selection.cells) + '$').test(dom.wordlist.filter.value);
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
    set_visibility(dom.buttons.addword, filter_can_be_added());

    if (the_crossword.theme) {
        shuffle_by_vector_similarity(filtered, the_crossword.theme);
    } else {
        shuffle(filtered);
    }

    if (the_wordlist.length === 0) {
        set_wordlist_heading("Inga ord passar");
        dom.wordlist.intro.innerHTML = "Vill du lägga till ett eget ord?";
    } else if (filtered.length > config.maxresults) {
        set_wordlist_heading(`Visar ${config.maxresults} ord av ${the_wordlist.length} passande`);
        dom.wordlist.intro.innerHTML = 
            "För många resultat, jag visar bara ett slumpmässigt urval.<br/>" +
            "Filtrera genom att skriva bokstäver i sökrutan:";
        filtered.length = config.maxresults;
    } else if (filtered.length === the_wordlist.length) {
        set_wordlist_heading(`Visar ${filtered.length} passande ord`);
        dom.wordlist.intro.innerHTML = "Filtrera genom att skriva bokstäver i sökrutan:";
    } else {
        set_wordlist_heading(`Visar ${filtered.length} ord av ${the_wordlist.length} passande`);
        dom.wordlist.intro.innerHTML = "Filtrera genom att skriva bokstäver i sökrutan:";
    }
    for (let cw of filtered) {
        let btn = document.createElement('button');
        dom.wordlist.content.append(btn);
        btn.innerHTML = cw.word;
        if (DEBUG) {
            let debuginfo = cw.sim ? `<span class="debug">${cw.sim.toFixed(2)}</span>` : "";
            btn.innerHTML += debuginfo;
        }
        btn.addEventListener('click', () => {
            add_word_to_crossword(cw.word);
        });
    }
    window.setTimeout(() => dom.wordlist.filter.focus(), 100);
}


////////////////////////////////////////////////////////////////////////////////
// Generic utilities

function set_visibility(elem, visible) {
    elem.style.display = visible ? "" : "none";
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

function shuffle_by_vector_similarity(words, simvector) {
    for (let w of words) {
        w.sim = is_wordvector(w.value) ? cosine_similarity(w.value, simvector) : 0;
        w.rank = Math.random() ** Math.max(w.sim, 0.01);
    }
    words.sort((w,v) => w.rank - v.rank || w.word - v.word);
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
