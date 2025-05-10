// Priority list for label selection
const LABEL_PRIORITY = [
    "Titelbezeichnung",
    "Gruppenbezeichnung",
    "Obergruppenbezeichnung",
    "Kapitelbezeichnung",
    "Einzelplanbezeichnung",
    "Bereichsbezeichnung"
];

// Helper: Pick highest-priority label from YAML object
function pickLabel(yamlObj) {
    for (const key of LABEL_PRIORITY) {
        if (yamlObj[key]) return yamlObj[key];
    }
    return "Unbenannt";
}

// Fetch JSON file (directory listing)
async function fetchJSON(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to fetch ${path}`);
        return await response.json();
    } catch (error) {
        console.error(`Error fetching JSON file (${path}):`, error);
        return null;
    }
}

// Fetch and parse YAML file
async function fetchYAML(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to fetch ${path}`);
        const text = await response.text();
        return jsyaml.load(text);
    } catch (error) {
        console.error(`Error fetching or parsing YAML file (${path}):`, error);
        return null;
    }
}

// Main rendering function
async function renderTreemap(path = "") {
    const container = document.getElementById("treemap");
    container.innerHTML = ""; // Remove old SVGs/divs

    const dirData = await fetchJSON(`${path}directory.json`);
    if (!dirData) {
        container.textContent = "Fehler beim Laden der Daten.";
        return;
    }

    // Gather data
    const entries = [];
    for (const file of dirData.files.filter(f => f.endsWith(".yaml"))) {
        const yaml = await fetchYAML(`${path}${file}`);
        if (yaml && yaml.Betrag) {
            const betrag = parseFloat(yaml.Betrag);
            if (!isNaN(betrag)) {
                entries.push({
                    name: pickLabel(yaml),
                    betrag: betrag,
                    folderName: file.replace(".yaml", ""),
                    hasFolder: dirData.subdirectories.includes(file.replace(".yaml", ""))
                });
            }
        }
    }

    if (entries.length === 0) {
        container.textContent = "Keine gültigen Daten gefunden.";
        return;
    }

    // Sort descending by betrag (largest first)
    entries.sort((a, b) => b.betrag - a.betrag);

    // D3 Treemap: Build hierarchy
    const root = d3.hierarchy({children: entries})
        .sum(d => d.betrag);

    // Get container size
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Treemap layout
    d3.treemap()
        .size([width, height])
        .paddingOuter(2)
        .paddingInner(2)
        (root);

    // To get the biggest in the upper-right, smallest in lower-left,
    // mirror horizontally and vertically
    // (d3 fills from top-left, so we flip by subtracting positions from width/height)
    for (const node of root.leaves()) {
        const d = node.data;
        const x = width - node.x1; // horizontal mirror
        const y = height - node.y1; // vertical mirror
        const w = node.x1 - node.x0;
        const h = node.y1 - node.y0;

        const div = document.createElement("div");
        div.className = "treemap-rect";
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
        div.style.width = `${w}px`;
        div.style.height = `${h}px`;
        div.textContent = d.name;

        if (d.hasFolder) {
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                renderTreemap(`${path}${d.folderName}/`);
            });
        } else {
            div.style.cursor = "default";
        }

        container.appendChild(div);
    }
}

// Init
renderTreemap();
