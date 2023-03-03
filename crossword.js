
var dom;

const config = {
    width: 15,
    height: 10,
    alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖÜ",
    maxresults: 100,
};


// Change this to true if you want debugging information
const DEBUG = false;


window.addEventListener('DOMContentLoaded', initialize);

function initialize() {
    dom = {
        crossword: {
            container: document.querySelector("#main-container"),
            title:     document.querySelector("#crossword-title"),
            table:     document.querySelector("#crossword-table"),
            theme:     document.querySelector("#crossword-theme"),
            clues:     document.querySelector("#clues-container"),
            horizclues:document.querySelector("#horizontal-clues"),
            vertclues: document.querySelector("#vertical-clues"),
        },
        info: {
            dictselect:   document.querySelector("#info-dictselect"),
            hidesolution: document.querySelector("#hide-solution"),
            languages:    document.querySelector("#ui-languages"),
        },
        wordlist: {
            container: document.querySelector("#wordlist-container"),
            heading:   document.querySelector("#wordlist-heading"),
            intro:     document.querySelector("#wordlist-intro"),
            filter:    document.querySelector("#wordlist-filter"),
            content:   document.querySelector("#wordlist-content"),
        },
        buttons: {
            reset:   document.querySelector("#button-reset"),
            help:    document.querySelector("#button-help"),
            wordlist:document.querySelector("#button-wordlist"),
            upload:  document.querySelector("#button-upload-dictionary"),
            resize:  document.querySelectorAll(".button-resize"),
        },
    };
    i18n_initialize();

    dom.buttons.help.addEventListener('click', show_help);
    dom.info.dictselect.addEventListener('change', select_dictionary);
    dom.info.hidesolution.addEventListener('change', show_hide_solution);
    dom.buttons.upload.addEventListener('change', upload_dictionary);
    dom.buttons.reset.addEventListener('click', clear_crossword);
    document.addEventListener('mouseup', on_mouse_up);
    for (let btn of dom.buttons.resize) {
        btn.addEventListener('click', resize_crossword.bind(btn));
    }

    make_editable(dom.crossword.title);

    load_crossword() || init_crossword(config.width, config.height);
    populate_dictionaries();
    select_dictionary();
    save_and_redraw_crossword();
    console.log("Finished initialization");
}

function show_help() {
    alert(`
Markera en rad eller kolumn för att få förslag på ord,
klicka sedan på ett förslag för att lägga till det.

Dubbelklicka på en bokstav för att ta bort det ordet.
Dubbelklicka på en tom ruta för att skriva in en ledtråd.
`);
}

function show_hide_solution() {
    deselect_crossword();
    let hidden = dom.info.hidesolution.checked;
    dom.crossword.container.classList.toggle("hide-solution", hidden);
}

function make_editable(element) {
    element.contentEditable = true;
    element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            document.activeElement.blur();
        }
    });
    element.addEventListener('blur', (event) => {
        element.innerText = element.innerText.trim();
        save_and_redraw_crossword();
    });
}


////////////////////////////////////////////////////////////////////////////////
// Dictionaries

var the_dictionaries = {};
var default_dictionaries;

function select_dictionary() {
    deselect_crossword();
    let name = dom.info.dictselect.value;
    if (name in the_dictionaries) {
        save_and_redraw_crossword();
        return;
    }
    
    if (typeof default_dictionaries == "object" && name in default_dictionaries) {
        console.log(`Loading dictionary ${name} from ${default_dictionaries[name]}`);
        var script = document.createElement('script');
        script.setAttribute('src', default_dictionaries[name]);
        script.setAttribute('type', 'text/javascript');
        script.addEventListener('load', save_and_redraw_crossword);
        document.querySelector("head").appendChild(script);
        delete default_dictionaries[name];
    }
}

function add_dictionary(name, dict) {
    the_dictionaries[name] = {};
    let added = not_added = 0;
    function add_to_dict(word, value=true) {
        added++;
        word = word.toUpperCase();
        if (!the_dictionaries[name][word.length]) the_dictionaries[name][word.length] = {};
        the_dictionaries[name][word.length][word] = value;
    }
    let isword = new RegExp("^[" + config.alphabet + "]+$", "i");
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

    console.log(`Loaded ${added} words from dictionary: ${name}` + (not_added>0 ? ` (${not_added} words not added)`: ""));
    populate_dictionaries();
    dom.info.dictselect.value = name;
}

function populate_dictionaries() {
    if (typeof dom == "undefined") return;
    clear_element(dom.info.dictselect);
    for (let name in the_dictionaries) {
        let dictsize = 0;
        for (let subdict of Object.values(the_dictionaries[name])) {
            dictsize += Object.keys(subdict).length;
        }
        let opt = document.createElement('option');
        opt.text = `${name} (${dictsize} ord)`;
        opt.value = name;
        dom.info.dictselect.add(opt);
    }
    
    if (typeof default_dictionaries == "undefined") return;
    for (let name in default_dictionaries) {
        if (name in the_dictionaries) continue;
        let opt = document.createElement('option');
        opt.text = `[Inte inläst] ${name}`;
        opt.value = name;
        dom.info.dictselect.add(opt);
    }
}

function lookup_dictionary(len) {
    try {
        return the_dictionaries[dom.info.dictselect.value][len];
    } catch(e) {
        return null;
    }
}

function upload_dictionary() {
    let files = dom.buttons.upload.files;
    if (files.length !== 1) return;
    const file = files[0];
    let reader = new FileReader();
    reader.addEventListener('load', () => {
        if (reader.result) {
            add_dictionary(file.name, reader.result);
        }
    });
    reader.addEventListener('error', (e) => alert(e.target.error.name));
    reader.readAsText(file);
}



////////////////////////////////////////////////////////////////////////////////
// Cells 

function cell_x(cell) {
    return cell.closest('td').cellIndex;
}

function cell_y(cell) {
    return cell.closest('tr').rowIndex;
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
    let val = cell && cell_value(cell);
    return val && val.length === 1;
}

function cell_isblocked(cell) {
    let val = cell && cell_value(cell);
    return val && val.length > 1;
}

function cell_isempty(cell) {
    return !cell_value(cell);
}

function clear_cell(cell) {
    set_cell_value(cell, "");
    cell.classList.value = "cwcell";
    cell.dataset.cluenr = "";
}

function cell_value(cell) {
    return cell.innerText;
}

function set_cell_value(cell, val) {
    cell.innerText = val;
    cell.classList.toggle("blocked", val.length > 1);
}

function toggle_blocked_cell(cell) {
    let val = cell_value(cell);
    if (val && val.length > 1) {
        clear_cell(cell);
    } else {
        set_cell_value(cell, "##");
    }
    save_and_redraw_crossword();
}


function selected_cells() {
    return Array.from(dom.crossword.table.querySelectorAll(".selected"));
}

function select_cell(cell) {
    cell.classList.add("selected");
}

function deselect_all_cells() {
    for (let c of selected_cells()) {
        c.classList.remove("selected");
    }
}

function selected_start_cell() {
    return dom.crossword.table.querySelector(".selected-start");
}

function deselect_start_cell() {
    let cell = selected_start_cell();
    if (cell) cell.classList.remove("selected-start");
    dom.crossword.table.classList.remove("selecting");
}

function select_start_cell(cell) {
    deselect_start_cell();
    cell.classList.add("selected-start");
    dom.crossword.table.classList.add("selecting");
}


////////////////////////////////////////////////////////////////////////////////
// The crossword

function init_crossword(width, height) {
    clear_cwords();
    clear_element(dom.crossword.table);

    for (let y = 0; y < height; y++) {
        insert_crossword_row(y, width);
    }
    deselect_crossword();
}

function insert_crossword_cell(x, y) {
    let row = dom.crossword.table.rows[y];
    let cell = row.insertCell(x).appendChild(document.createElement('div'));
    clear_cell(cell);
    cell.addEventListener('mousedown', on_mouse_down);
    cell.addEventListener('mouseenter', on_mouse_enter);
    cell.addEventListener('dblclick', on_dbl_click);
    cell.addEventListener('click', on_click);
}

function insert_crossword_row(y, width=null) {
    if (!width) width = crossword_width();
    dom.crossword.table.insertRow(y);
    for (let x = 0; x < width; x++) {
        insert_crossword_cell(x, y);
    }
    for (let cw of get_cwords()) {
        cw.dataset.cells = JSON.stringify(get_cword_coords(cw).map((c) => ({
            x: c.x, 
            y: c.y + (c.y >= y),
        })));
    }
}

function insert_crossword_column(x, height=null) {
    if (!height) height = crossword_height();
    for (let y = 0; y < height; y++) {
        insert_crossword_cell(x, y);
    }
    for (let cw of get_cwords()) {
        cw.dataset.cells = JSON.stringify(get_cword_coords(cw).map((c) => ({
            x: c.x + (c.x >= x), 
            y: c.y,
        })));
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
    for (let cw of get_cwords()) {
        cw.dataset.cells = JSON.stringify(get_cword_coords(cw).map((c) => ({
            x: c.x, 
            y: c.y - (c.y > y),
        })));
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
    for (let cw of get_cwords()) {
        cw.dataset.cells = JSON.stringify(get_cword_coords(cw).map((c) => ({
            x: c.x - (c.x > x), 
            y: c.y,
        })));
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
    save_and_redraw_crossword();
}

function crossword_cell(x, y) {
    return 0 <= x && x < crossword_width() && 0 <= y && y < crossword_height() &&
        dom.crossword.table.rows[y].cells[x].querySelector('.cwcell');
}

function all_crossword_cells() {
    return Array.from(dom.crossword.table.querySelectorAll('.cwcell'));
}

function add_word_to_crossword(word) {
    let cells = selected_cells();
    cells.forEach((cell, i) => {
        let ch = word.charAt(i);
        if (cell && (cell_isempty(cell) || cell_value(cell) === ch)) {
            set_cell_value(cell, ch);
        } else {
            throw `Failed to add "${word}" at ${cell_x(cells[0])}:${cell_y(cells[0])}`;
        }
    });

    let covered_words = [];
    for (let covered of get_cwords()) {
        let covered_cells = get_cword_cells(covered);
        let is_covered = true;
        for (let c of covered_cells) {
            if (!cells.includes(c)) {
                is_covered = false;
                break;
            } else if (c.classList.contains('right-turn') || c.classList.contains('down-turn')) {
                break;
            }
        }
        if (is_covered) {
            covered_words.push(covered);
        }
    }

    if (covered_words.length > 0) {
        let covered_text = covered_words.map((cw) => cells_to_word(get_cword_cells(cw))).join(", ");
        console.log(`Covered words: ${covered_text}`);
        let ok = confirm(`Vill du ersätta ${covered_text} med ${cells_to_word(cells)}?`);
        if (!ok) {
            save_and_redraw_crossword();
            return;
        }
        console.log(`Replacing ${covered_text} by ${word} at ${cell_x(cells[0])}:${cell_y(cells[0])}`);
        let cluetext = covered_words.flatMap((cw) => get_clue_value(cword_clue(cw)) || []).join(" ; ");
        add_cword(cells, cluetext);
        covered_words.forEach(delete_cword);
    } else {
        console.log(`Adding ${word} at ${cell_x(cells[0])}:${cell_y(cells[0])}`);
        add_cword(cells);
    }

    delay_call(merge_cells_and_cwords);
}

function merge_cells_and_cwords() {
    for (let start_cell of all_crossword_cells()) {
        if (cell_isletter(start_cell)) {
            for (let horiz of [true, false]) {
                if (cell_isletter(prev_cell(start_cell, horiz))) continue;
                let to_merge = [];
                let cells = [];
                let cell = start_cell;
                while (cell_isletter(cell)) {
                    let cword = find_cword_starting_in_cell(cell, horiz);
                    if (cword) {
                        to_merge.push(cword);
                        cells.push(...get_cword_cells(cword));
                        horiz = is_horizontal(cells.slice(-2));
                    } else {
                        cells.push(cell);
                    }
                    cell = next_cell(cells[cells.length-1], horiz);
                }
                if (cells.length <= 1) continue;
                if (to_merge.length == 1 && cells.length == get_cword_cells(to_merge[0]).length) continue;
                if (to_merge.length >= 1) {
                    let merged_text = to_merge.map((cw) => cells_to_word(get_cword_cells(cw))).join(", ");
                    console.log(`Replacing ${merged_text} by ${cells_to_word(cells)} at ${cell_x(cells[0])}:${cell_y(cells[0])}`);
                    let cluetext = to_merge.flatMap((cw) => get_clue_value(cword_clue(cw)) || []).join(" ; ");
                    add_cword(cells, cluetext);
                    to_merge.forEach(delete_cword);
                } else {
                    console.log(`Adding ${cells_to_word(cells)} at ${cell_x(cells[0])}:${cell_y(cells[0])}`);
                    add_cword(cells);
                }
            }
        }
    }
    save_and_redraw_crossword();
}

function find_cword_starting_in_cell(cell, horiz) {
    let cwords = get_cwords().filter((cw) => {
        let cwcells = get_cword_cells(cw);
        return horiz === is_horizontal(cwcells) && cell === cwcells[0];
    });
    if (cwords.length > 1) console.error(`${cwords.length} words start in the same cell!`);
    return cwords.length ? cwords[0] : null;
}

function cells_to_word(cells) {
    return cells.map((c) => cell_isletter(c) ? cell_value(c) : ".").join("");
}

function save_and_redraw_crossword() {
    save_crossword();
    load_crossword();
    redraw_crossword();
}

function redraw_crossword() {
    deselect_crossword();
    for (let cell of all_crossword_cells()) {
        cell.dataset.cluenr = "";
        cell.classList.remove('right-turn', 'down-turn');
    }
    let occupied_cells = new Set();
    for (let cword of get_cwords()) {
        let cwcells = get_cword_cells(cword);
        cwcells[0].dataset.cluenr = cword.value;

        for (let i = 0; i < cwcells.length; i++) {
            let cell = cwcells[i];
            if (0 < i && i < cwcells.length - 1) {
                if (cell_x(cwcells[i-1]) === cell_x(cell) && cell_x(cell) < cell_x(cwcells[i+1])) {
                    cell.classList.add('right-turn');
                } else if (cell_x(cwcells[i-1]) < cell_x(cell) && cell_x(cell) === cell_x(cwcells[i+1])) {
                    cell.classList.add('down-turn');
                }
            } 
            occupied_cells.add(cell);
        }
    }
    for (let cell of all_crossword_cells()) {
        if (!(occupied_cells.has(cell) || cell_isblocked(cell)))
            clear_cell(cell);
    }
    calculate_theme();
}

function get_cwords() {
    return Array.from(dom.crossword.clues.querySelectorAll("li"));
}

function get_cword_coords(cword) {
    return JSON.parse(cword.dataset.cells);
}

function set_cword_coords(cword, cells) {
    cword.dataset.cells = JSON.stringify(cells.map(cell_to_coord));
}

function get_cword_cells(cword) {
    return get_cword_coords(cword).map(coord_to_cell);
}

function cword_clue(cword) {
    return cword.querySelector(".cluetext");
}

function get_clue_value(clue) {
    return clue.innerText;
}

function set_clue_value(clue, cluetext) {
    clue.innerText = cluetext || "";
}

function coord_to_cell(coord) {
    return crossword_cell(coord.x, coord.y);
}

function cell_to_coord(cell) {
    return {x: cell_x(cell), y: cell_y(cell)};
}

function add_cword(cells, cluetext) {
    let cword = document.createElement('li');
    set_cword_coords(cword, cells);
    let word = cells_to_word(cells);
    cword.innerHTML = `<span class="cluetext"></span> (${word.length})<span class="clueword"> = ${word}</span>`;
    let list = is_horizontal(cells) ? dom.crossword.horizclues : dom.crossword.vertclues;
    list.appendChild(cword);
    let clue = cword_clue(cword);
    make_editable(clue);
    set_clue_value(clue, cluetext);
    sort_and_number_cwords();
}

function delete_cword(cword) {
    cword.remove();
    sort_and_number_cwords();
}

function clear_cwords() {
    clear_element(dom.crossword.horizclues);
    clear_element(dom.crossword.vertclues);
    sort_and_number_cwords();
}

function is_horizontal(cells) {
    return cell_y(cells[0]) === cell_y(cells[1]);
}

function sort_and_number_cwords() {
    let cwords = get_cwords().sort((a, b) => {
        let acoord = get_cword_coords(a)[0];
        let bcoord = get_cword_coords(b)[0];
        return acoord.y - bcoord.y || acoord.x - bcoord.x;
    });
    let prev_firstcell = null;
    let num = 0;
    for (let cw of cwords) {
        let cell = get_cword_cells(cw)[0];
        if (cell !== prev_firstcell) num++;
        prev_firstcell = cell;
        cw.parentElement.appendChild(cw);
        cw.value = num;
    }
}


function delete_words_at_cell(cell) {
    deselect_crossword();
    let occupied_by = (cword) => get_cword_cells(cword).some((c) => c === cell);
    let to_remove = get_cwords().filter(occupied_by);
    if (to_remove.length === 0) return;
    let ok = confirm("Är du säker att du vill ta bort " +
                     (to_remove.length>1 ? "orden " : "ordet ") +
                     to_remove.map((cw) => cells_to_word(get_cword_cells(cw))).join(" och ") + "?");
    if (!ok) return;
    console.log("Removing " + to_remove.map((cw) => cells_to_word(get_cword_cells(cw))).join(", "));
    to_remove.forEach(delete_cword);
    save_and_redraw_crossword();
    delay_call(merge_cells_and_cwords);
}

function clear_crossword() {
    let ok = confirm("Är du säker att du vill radera korsordet?");
    if (!ok) return;
    console.log("Clearing the crossword");
    deselect_crossword();
    clear_cwords();
    all_crossword_cells().forEach(clear_cell);
    save_and_redraw_crossword();
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
        while (cell_isletter(cell)) {
            start = cell;
            cell = move_to_cell(cell, -dx, -dy);
        }
        cell = move_to_cell(newgoal, dx, dy);
        while (cell_isletter(cell)) {
            newgoal = cell;
            cell = move_to_cell(cell, dx, dy);
        }
        // swap start, goal if necessary
        if (dx + dy < 0) [start, newgoal] = [newgoal, start];
    }

    deselect_all_cells();
    let wordlen = 1 + cell_x(newgoal) - cell_x(start) + cell_y(newgoal) - cell_y(start);
    let cell = start;
    for (let i = 0; i < wordlen; i++) {
        select_cell(cell);
        cell = next_cell(cell, horiz);
    }

    let crossing_words = get_cwords().filter((cw) => get_cword_cells(cw).some((c) => c === newgoal));
    if (crossing_words.length > 0) {
        if (horiz  && cell_x(newgoal) === cell_x(goal) && cell_y(newgoal) < cell_y(goal) ||
            !horiz && cell_y(newgoal) === cell_y(goal) && cell_x(newgoal) < cell_x(goal) ||
            horiz  && newgoal.classList.contains('down-turn') ||
            !horiz && newgoal.classList.contains('right-turn'))
        {
            for (let cw of crossing_words) {
                let cwcells = get_cword_cells(cw);
                let i = 1 + cwcells.indexOf(newgoal);
                if (0 < i && i < cwcells.length && next_cell(newgoal, !horiz) === cwcells[i]) {
                    while (i < cwcells.length) {
                        select_cell(cwcells[i++]);
                    }
                    break;
                }
            }
        }
    }
}

function infer_constraints() {
    let wordregex = "";
    let constraints = [];
    let cells = selected_cells();
    for (let i = 0; i < cells.length; i++) {
        let cell = cells[i];
        if (cell_isletter(cell)) {
            wordregex += cell_value(cell);
            constraints.push("?");
        } else {
            let constr = "?";
            let horiz = cell_y(cell) === cell_y(cells[i>0 ? i-1 : i+1]);
            let orthcell = prev_cell(cell, !horiz);
            while (cell_isletter(orthcell)) {
                constr = cell_value(orthcell) + constr;
                orthcell = prev_cell(orthcell, !horiz);
            }
            orthcell = next_cell(cell, !horiz);
            while (cell_isletter(orthcell)) {
                constr = constr + cell_value(orthcell);
                orthcell = next_cell(orthcell, !horiz);
            }
            wordregex += "?";
            constraints.push(constr);
        }
    }
    if (DEBUG) console.log(`Constraints: ${wordregex} / ${constraints.join(", ")}`);
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
    clear_wordlist();
    deselect_start_cell();
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
        toggle_blocked_cell(cell);
    }
}

function on_mouse_up(evt) {
    evt.preventDefault();
    if (!selected_start_cell()) return;
    if (selected_cells().length <= 1) {
        deselect_crossword();
        return;
    }
    deselect_start_cell();
    find_matching_words();
}

function on_mouse_down(evt) {
    document.activeElement.blur();
    evt.preventDefault();
    clear_wordlist();
    let cell = evt.currentTarget;
    select_start_cell(cell);
    calculate_selection(cell, cell);
}

function on_mouse_enter(evt) {
    evt.preventDefault();
    if (!selected_start_cell()) return;
    let cell = evt.currentTarget;
    calculate_selection(selected_start_cell(), cell);
}

////////////////////////////////////////////////////////////////////////////////
// Import/export

function export_crossword() {
    return {
        title: dom.crossword.title.innerText,
        width: crossword_width(),
        height: crossword_height(),
        cwords: get_cwords().map((cw) => ({
            coords: get_cword_coords(cw),
            clue: get_clue_value(cword_clue(cw)),
        })),
        cells: all_crossword_cells().map(cell_value),
    };
}

function import_crossword(raw_crossword) {
    dom.crossword.title.innerText = raw_crossword.title;
    init_crossword(raw_crossword.width, raw_crossword.height);
    all_crossword_cells().forEach((cell, idx) => {
        set_cell_value(cell, raw_crossword.cells[idx]);
    });
    raw_crossword.cwords.forEach((cword) => {
        let cells = cword.coords.map(coord_to_cell);
        add_cword(cells, cword.clue);
    });
}

function save_crossword() {
    window.localStorage.crossword = JSON.stringify(export_crossword());
    console.log("Crossword saved");
}

function load_crossword() {
    try {
        import_crossword(JSON.parse(window.localStorage.crossword));
        console.log("Crossword loaded");
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
    let cwords = get_cwords().flatMap((cw) => {
        let cells = get_cword_cells(cw);
        let word = cells_to_word(cells);
        if (!get_vector(word)) return [];
        return {cells:cells, word:word};
    });

    // Clear the highlighted cross-words
    set_theme();
    for (let cell of all_crossword_cells()) {
        cell.classList.remove("theme");
    }
    if (DEBUG) document.querySelector("#debug-theme").innerText = "";

    // We need at least 3 words to be able to infer a theme
    if (cwords.length <= 2) return;

    // The theme is the word that is the closest to all other words
    let theme_avg_sim = -1, theme_all_sims = null, theme_word = null;
    for (let word of cwords) {
        let all_sims = cwords.map((other) => word_similarity(word.word, other.word));
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
    set_theme(theme_word.word);

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
                (w,i) => `${w.word} (${word_similarity(theme_word.word, w.word).toFixed(2)})`
            ).join(", ");
        console.log(debuginfo);
        document.querySelector("#debug-theme").innerText = debuginfo;
    }
}

function set_theme(theme) {
    dom.crossword.theme.innerText = theme || "";
}

function get_theme() {
    return dom.crossword.theme.innerText;
}

function get_vector(word) {
    let wordlist = lookup_dictionary(word.length);
    if (!wordlist) return;
    let vector = wordlist[word];
    if (!is_wordvector(vector)) return;
    return vector;
}

function word_similarity(word1, word2) {
    let vec1 = get_vector(word1);
    if (!vec1) return 0;
    let vec2 = get_vector(word2);
    if (!vec2) return 0;
    return cosine_similarity(vec1, vec2);
}


////////////////////////////////////////////////////////////////////////////////
// Wordlist suggestions

var the_wordlist;

function set_wordlist_heading(head) {
    dom.wordlist.heading.innerText = head;
}

function clear_wordlist() {
    set_visibility(dom.wordlist.container, false);
    set_visibility(dom.crossword.clues, true);
    set_wordlist_heading("");
    clear_element(dom.wordlist.content);
    dom.wordlist.filter.value = "";
    the_wordlist = [];
}

function find_matching_words() {
    clear_wordlist();
    let found = 0;
    let [regex, constraints] = infer_constraints();
    if (regex.indexOf("?") < 0) {
        delay_call(deselect_crossword);
        return;
    }

    dom.wordlist.filter.addEventListener('input', show_wordlist);
    dom.buttons.wordlist.addEventListener('click', reload_wordlist_or_add_word);
    set_visibility(dom.wordlist.container, true);
    set_visibility(dom.crossword.clues, false);
    if (selected_cells().length > 0)
        dom.wordlist.filter.maxLength = selected_cells().length;
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
                    the_wordlist.push({word:word});
                }
            }
        }
    }
    time += Date.now();
    if (DEBUG) console.log(`${found} matches, in ${time} ms`);
    show_wordlist();
}

function reload_wordlist_or_add_word() {
    if (filter_can_be_added()) {
        let word = dom.wordlist.filter.value.toUpperCase();
        add_word_to_crossword(word);
    } else {
        show_wordlist();
    }
}

function filter_can_be_added() {
    return dom.wordlist.filter.value.length === selected_cells().length && 
        new RegExp('^' + cells_to_word(selected_cells()) + '$').test(dom.wordlist.filter.value);
}

function show_wordlist() {
    clear_element(dom.wordlist.intro);
    clear_element(dom.wordlist.content);
    let notletter = new RegExp("[^" + config.alphabet + "]", "g");
    let filtervalue = dom.wordlist.filter.value;
    filtervalue = filtervalue.toUpperCase().replaceAll(notletter, "");
    dom.wordlist.filter.value = filtervalue;
    let regex = filtervalue.replaceAll("", ".*");
    regex = new RegExp("^" + regex + "$");
    let filtered = the_wordlist.filter((cw) => cw.word.match(regex));
    if (DEBUG) console.log(`Filtered ${the_wordlist.length} words --> ${filtered.length} words`);
    dom.wordlist.intro.innerHTML = "Filtrera genom att skriva bokstäver i sökrutan:";
    if (filtered.length > 1) {
        set_visibility(dom.buttons.wordlist, true);
        dom.buttons.wordlist.title = "Slumpa nya ord";
        dom.buttons.wordlist.innerHTML = "&#x27f2;";
    } else if (filter_can_be_added()) {
        set_visibility(dom.buttons.wordlist, true);
        dom.buttons.wordlist.title = "Lägg till i korsordet";
        dom.buttons.wordlist.innerText = "Lägg till";
    } else {
        set_visibility(dom.buttons.wordlist, false);
    }
    
    if (get_theme()) {
        shuffle_by_vector_similarity(filtered, get_theme());
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
    delay_call(() => dom.wordlist.filter.focus());
}


////////////////////////////////////////////////////////////////////////////////
// Generic utilities

function set_visibility(elem, visible) {
    elem.style.display = visible ? "" : "none";
}

function clear_element(elem) {
    elem.innerHTML = "";
}

function delay_call(fn) {
    // Delay the call by just a little, so that the DOM has time to update itself before the call.
    window.setTimeout(fn, 100); // Delay by 100 ms
}

// Fisher–Yates shuffle: https://en.wikipedia.org/wiki/Fisher–Yates_shuffle
function shuffle(arr) {
    for (let i = arr.length-1; i > 0; i--) {
        let index = Math.floor((i + 1) * Math.random());
        [arr[i], arr[index]] = [arr[index], arr[i]];
    }
}

function shuffle_by_vector_similarity(words, theme) {
    for (let w of words) {
        w.sim = word_similarity(w.word, theme);
        w.rank = Math.random() ** Math.max(w.sim, 0.01);
    }
    words.sort((w,v) => w.rank - v.rank);
}


////////////////////////////////////////////////////////////////////////////////
// Internationalisation (i.e., transation of the UI)

var I18N = window.I18N || {};

function i18n_translations() {
    let radio = document.querySelector('input[name="language"]:checked');
    let lang = radio && radio.value;
    return I18N[lang] || {};
}

function i18n_create_radiobutton(lang) {
}

var i18n_default_translations = {elems: {}, elemtitles: {}, cssvars: {}};

function i18n_initialize() {
    let languages = Object.keys(I18N);
    for (let lang of languages) {
        // Create radio button for switching to the language
        let info = I18N[lang].info;
        // let div = dom.info.languages.appendChild(document.createElement("div"));
        let radio = dom.info.languages.appendChild(document.createElement("input"));
        radio.setAttribute('type', 'radio');
        radio.setAttribute('name', 'language');
        radio.setAttribute('value', lang);
        radio.setAttribute('id', 'language-' + lang);
        radio.addEventListener('change', i18n_translate_page);
        let label = dom.info.languages.appendChild(document.createElement("label"));
        label.setAttribute('for', 'language-' + lang);
        label.title = info.name || info.code;
        label.innerText = info.flag || info.code || info.name;

        // Collect all default values from the initial HTML DOM
        for (let key in I18N[lang].elems || {})
            for (let elem of document.querySelectorAll(key)) 
                i18n_default_translations.elems[key] = elem.innerText;
        for (let key in I18N[lang].elemtitles || {}) 
            for (let elem of document.querySelectorAll(key))
                i18n_default_translations.elemtitles[key] = elem.title;
        for (let key in I18N[lang].cssvars || {})
            if (value = getComputedStyle(document.documentElement).getPropertyValue(key))
                i18n_default_translations.cssvars[key] = value;
    }
    // Select the first language as default
    document.querySelector('input[name="language"]').checked = true;
    delay_call(i18n_translate_page);
}

function i18n_translate_page() {
    let translations = i18n_translations();
    if (!translations) return;
    for (let key in i18n_default_translations.elems || {})
        for (let elem of document.querySelectorAll(key))
            elem.innerText = translations.elems && translations.elems[key] || i18n_default_translations.elems[key];
    for (let key in i18n_default_translations.elemtitles || {})
        for (let elem of document.querySelectorAll(key))
            elem.title = translations.elemtitles && translations.elemtitles[key] || i18n_default_translations.elemtitles[key];
    for (let key in i18n_default_translations.cssvars || {}) {
        let value = translations.cssvars && translations.cssvars[key] || i18n_default_translations.cssvars[key];
        document.documentElement.style.setProperty(key, value);
    }
}

function i18n(strings, ...values) {
    let translations = i18n_translations().strings || {};
    function lookup(str) {
        let parts = str.match(/^(\s*)(.*?)(\s*)$/);
        return parts[1] + (translations[parts[2]] || parts[2]) + parts[3];
    };
    let result = lookup(strings[0]);
    for (let i = 0; i < values.length; i++) {
        result += values[i] + lookup(strings[i+1]);
    }
    return result;
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
