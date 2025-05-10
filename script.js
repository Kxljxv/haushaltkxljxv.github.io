const LABEL_PRIORITY = [
    "Titelbezeichnung",
    "Gruppenbezeichnung",
    "Obergruppenbezeichnung",
    "Kapitelbezeichnung",
    "Einzelplanbezeichnung",
    "Bereichsbezeichnung"
];

function pickLabel(yamlObj) {
    for (const key of LABEL_PRIORITY) {
        if (yamlObj[key]) return yamlObj[key];
    }
    return "Unbenannt";
}

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

// Helper for building data for amCharts
async function buildTreemapData(path, dirData = null) {
    if (!dirData) dirData = await fetchJSON(`${path}directory.json`);
    if (!dirData) return [];
    const entries = [];
    for (const file of dirData.files.filter(f => f.endsWith(".yaml"))) {
        const yaml = await fetchYAML(`${path}${file}`);
        if (yaml && yaml.Betrag) {
            const betrag = parseFloat(yaml.Betrag);
            if (!isNaN(betrag)) {
                entries.push({
                    name: pickLabel(yaml),
                    value: betrag,
                    folderName: file.replace('.yaml', ''),
                    hasFolder: dirData.subdirectories.includes(file.replace('.yaml', ''))
                });
            }
        }
    }
    return entries;
}

async function renderTreemap(path = "") {
    // Remove old root if present
    if (window.am5root) window.am5root.dispose();

    let dirData = await fetchJSON(`${path}directory.json`);
    if (!dirData) {
        document.getElementById("treemap").innerHTML = "Fehler beim Laden der Daten.";
        return;
    }
    let entries = await buildTreemapData(path, dirData);

    if (!entries || entries.length === 0) {
        document.getElementById("treemap").innerHTML = "Keine gültigen Daten gefunden.";
        return;
    }

    // Create root and chart
    let root = am5.Root.new("treemap");
    window.am5root = root; // for proper dispose later

    root.setThemes([am5themes_Animated.new(root)]);

    let chart = root.container.children.push(
      am5percent.Treemap.new(root, {
        singleBranchOnly: false,
        homeText: "Zurück",
        valueField: "value",
        categoryField: "name",
        childDataField: "children",
        layoutAlgorithm: "squarified",
        width: am5.p100,
        height: am5.p100,
      })
    );

    // When a rectangle is clicked
    chart.series.children.each(series => {
        series.labels.template.setAll({
            oversizedBehavior: "truncate",
            fill: am5.color(0x222222),
        });
    });

    chart.series.get("rectangles").events.on("click", async function(ev) {
        const dataItem = ev.target.dataItem.dataContext;
        if (dataItem.hasFolder) {
            root.dispose(); // Clear before going into folder
            await renderTreemap(`${path}${dataItem.folderName}/`);
        }
    });

    chart.data.setAll(entries);
}

renderTreemap();
