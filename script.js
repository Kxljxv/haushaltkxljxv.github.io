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
    console.debug("[fetchJSON]", path);
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
    console.debug("[fetchYAML]", path);
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to fetch ${path}`);
    const text = await response.text();
    return jsyaml.load(text);
  } catch (error) {
    console.error(`Error fetching or parsing YAML file (${path}):`, error);
    return null;
  }
}

const navStack = [];
let root, series;

async function prepareTreeData(path) {
  const dirData = await fetchJSON(`${path}directory.json`);
  if (!dirData) {
    console.warn("[prepareTreeData] No directory data found for path", path);
    return { children: [] };
  }

  const children = [];
  for (const file of dirData.files.filter(f => f.endsWith(".yaml"))) {
    const yaml = await fetchYAML(`${path}${file}`);
    if (yaml && yaml.Betrag) {
      const betrag = parseFloat(yaml.Betrag);
      if (!isNaN(betrag)) {
        const folderName = file.replace(".yaml", "");
        const node = {
          name: pickLabel(yaml),
          value: betrag,
          yaml: yaml,
          folderName: folderName,
          hasFolder: dirData.subdirectories.includes(folderName),
        };
        children.push(node);
      } else {
        console.warn(`[prepareTreeData] Invalid Betrag in ${file}:`, yaml.Betrag);
      }
    } else {
      console.warn(`[prepareTreeData] No valid YAML or Betrag in ${file}`);
    }
  }
  children.sort((a, b) => b.value - a.value);
  console.debug("[prepareTreeData] Children:", children);
  return { children };
}

function showBackButton() {
  const btn = document.getElementById("back-btn");
  btn.style.display = navStack.length > 0 ? "block" : "none";
}

function formatYamlTooltip(yaml) {
  return Object.entries(yaml)
    .map(([k, v]) => `<b>${k}</b>: ${v}`)
    .join('<br/>');
}

function showError(msg) {
  const chartdiv = document.getElementById("chartdiv");
  if (chartdiv) chartdiv.innerHTML = `<div style="color:red;font-weight:bold;">${msg}</div>`;
  else alert(msg);
}

function normalizePath(base, folder) {
  // Ensure we always end up with "base/folder/" with no double slash
  if (base && !base.endsWith("/")) base += "/";
  return `${base || ""}${folder}/`;
}

async function renderTreemap(path = "") {
  console.debug("[renderTreemap] path =", path);
  showBackButton();

  let tree;
  try {
    tree = await prepareTreeData(path);
  } catch (err) {
    console.error("[renderTreemap] Error in prepareTreeData:", err);
    showError("Fehler beim Datenaufbau.");
    return;
  }

  // Defensive: clear old chart/root
  if (root) {
    try { root.dispose(); } catch(e) { console.warn("root.dispose failed", e); }
    root = undefined;
  }
  const chartdiv = document.getElementById("chartdiv");
  chartdiv.innerHTML = ""; // Clear chart div

  // Defensive: check for am5, am5hierarchy
  if (typeof am5 === "undefined" || typeof am5.Root === "undefined") {
    showError("amCharts 5 core (am5) not loaded!");
    return;
  }
  if (typeof am5hierarchy === "undefined" || typeof am5hierarchy.Treemap === "undefined") {
    showError("amCharts 5 hierarchy module (am5hierarchy.js) not loaded!");
    return;
  }

  try {
    root = am5.Root.new("chartdiv");
    root.setThemes([am5themes_Animated.new(root)]);
    series = root.container.children.push(
      am5hierarchy.Treemap.new(root, {
        singleBranchOnly: false,
        downDepth: 1,
        upDepth: 1,
        valueField: "value",
        categoryField: "name",
        childDataField: "children",
        orientation: "vertical",
        nodePaddingOuter: 0,
        nodePaddingInner: 1
      })
    );

    if (!tree.children || tree.children.length === 0) {
      showError("Keine gültigen Daten gefunden.");
      return;
    }

    // Configure tooltip
    const tooltip = am5.Tooltip.new(root, {
      getFillFromSprite: false,
      labelText: "{category}"
    });

    // Create a template for items (rectangles)
    const rectangleTemplate = series.rectangles.template;

    // Apply tooltip to template
    rectangleTemplate.set("tooltip", tooltip);

    // Enable pointer cursor for clickable fields
    rectangleTemplate.setAll({
      interactive: true,
      cursorOverStyle: "pointer"
    });

    // Custom tooltip html on hover

    // Click to drilldown
    rectangleTemplate.events.on("click", function(ev) {
      const data = ev.target.dataItem && ev.target.dataItem.dataContext;
      console.debug("[rectangle click]", data);
      if (data && data.hasFolder) {
        // Use normalized path to prevent double slashes
        const nextPath = normalizePath(path, data.folderName);
        console.debug(`[drilldown] navStack.push(${path}), nextPath: ${nextPath}`);
        navStack.push(path);
        renderTreemap(nextPath);
      } else {
        console.debug("[rectangle click] No folder to drill down to for:", data);
      }
    });

    // Set data to series
    series.data.setAll([tree]);

  } catch (err) {
    console.error("[renderTreemap] amCharts rendering error:", err);
    showError("Visualisierungs-Fehler: " + err);
  }
}

window.onload = function() {
  const backBtn = document.getElementById("back-btn");
  backBtn.onclick = () => {
    if (navStack.length > 0) {
      const prevPath = navStack.pop();
      console.debug("[backBtn] Going back to:", prevPath);
      renderTreemap(prevPath);
    }
  };
  renderTreemap();
};
