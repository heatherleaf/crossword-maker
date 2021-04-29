
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
            content:   document.getElementById("wordlist-content"),
        },
        buttons: {
            reset:   document.getElementById("button-reset"),
            help:    document.getElementById("button-help"),
            // redraw:  document.getElementById("button-redraw"),
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
    if (typeof(dict) === "string") {
        dict = convert_words_to_dictionary(dict);
    }
    dictionaries[name] = dict;
    let opt = document.createElement('option');
    opt.value = name;
    opt.text = `${name} (${dictionary_size(name)} ord)`;
    dom.info.dictselect.add(opt);
}

function dictionary_size(name) {
    let size = 0;
    for (let subdict of Object.values(dictionaries[name])) {
        size += Object.keys(subdict).length;
    }
    return size;
}

function convert_words_to_dictionary(text) {
    let words = text.split(/\s+/).filter((w) => w);
    let dictionary = {};
    let isword = new RegExp("^[" + config.alphabet + "]+$");
    for (let w of words) {
        w = w.toUpperCase();
        if (isword.test(w)) {
            if (!dictionary[w.length]) dictionary[w.length] = {};
            dictionary[w.length][w] = true;
        }
    }
    return dictionary;
}

function select_dictionary() {
    deselect_crossword();
    let name = dom.info.dictselect.value;
    the_dictionary = dictionaries[name];
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
    // dom.buttons.redraw.onclick = redraw_crossword;
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
    window.setTimeout(() => {
        let time = -Date.now();
        let wordlen = regex.length;

        regex = new RegExp("^" + regex.replaceAll("?", "\\w") + "$");
        let wordlist = the_dictionary[wordlen];
        if (wordlist) {
            let sel = selected_cword();
            for (let word in wordlist) {
                if (regex.test(word)) {
                    if (check_constraints(word, constraints)) {
                        found++;
                        let cword = {word:word, x:sel.x, y:sel.y, horiz:sel.horiz};
                        let choice = add_to_wordlist(cword);
                    }
                }
            }
        }

        time += Date.now();
        console.log(`${found} matches, in ${time} ms`);
        show_wordlist();
    }, 100);
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
// Wordlist

var the_wordlist;

function set_wordlist_heading(head) {
    dom.wordlist.heading.innerText = head;
}

function clear_wordlist() {
    set_visibility(dom.wordlist.filter, false);
    set_visibility(dom.wordlist.container, false);
    set_wordlist_heading("");
    dom.wordlist.content.innerHTML = "";
    dom.wordlist.filter.value = "";
    the_wordlist = [];
}

function start_wordlist() {
    dom.wordlist.filter.oninput = filter_wordlist;
    set_wordlist_heading("Searching...");
    set_visibility(dom.wordlist.container, true);
}

function show_wordlist() {
    filter_wordlist();
    dom.wordlist.filter.focus();
}

function set_visibility(elem, visible) {
    if (!visible) elem.blur();
    elem.style.visibility = visible ? "visible" : "hidden";
}

function filter_wordlist() {
    dom.wordlist.intro.innerHTML = "";
    dom.wordlist.content.innerHTML = "";
    set_visibility(dom.wordlist.filter, the_wordlist.length);
    if (the_wordlist.length == 0) {
        set_wordlist_heading("Inga ord passar");
        return;
    }
    let regex = dom.wordlist.filter.value.toUpperCase().replaceAll("", ".*");
    regex = new RegExp("^" + regex + "$");
    let filtered = the_wordlist.filter((cw) => cw.word.match(regex));
    console.log(`Filtered ${the_wordlist.length} words --> ${filtered.length} words`);
    dom.wordlist.intro.innerHTML = "Filtrera genom att skriva bokstäver i sökrutan:";
    if (filtered.length <= config.maxresults) {
        if (filtered.length == the_wordlist.length) {
            set_wordlist_heading(`Visar ${filtered.length} passande ord`);
        } else {
            set_wordlist_heading(`Visar ${filtered.length} ord av ${the_wordlist.length} passande`);
        }
    } else {
        set_wordlist_heading(`Visar ${config.maxresults} ord av ${the_wordlist.length} passande`);
        dom.wordlist.intro.innerHTML = 
            "För många resultat, jag visar bara ett slumpmässigt urval.<br/>" + dom.wordlist.intro.innerHTML;
        while (filtered.length > config.maxresults) {
            filtered.splice(Math.floor(Math.random() * filtered.length), 1);
        }
    }
    for (let cw of filtered) {
        let btn = document.createElement('button');
        dom.wordlist.content.append(btn);
        btn.innerText = cw.word;
        btn.onclick = (() => {
            add_word_to_crossword(cw);
            deselect_crossword();
        }).bind(the_crossword);
    }
}

function add_to_wordlist(word) {
    the_wordlist.push(word);
}
