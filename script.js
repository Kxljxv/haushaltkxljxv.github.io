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
    console.log(`[fetchJSON] Fetching: ${path} Status: ${response.status}`);
    if (!response.ok) throw new Error(`Failed to fetch ${path}`);
    return await response.json();
  } catch (error) {
    console.error(`Error fetching JSON file (${path}):`, error);
    alert(`Error fetching JSON file (${path}): ${error}`);
    return null;
  }
}

async function fetchYAML(path) {
  try {
    const response = await fetch(path);
    console.log(`[fetchYAML] Fetching: ${path} Status: ${response.status}`);
    if (!response.ok) throw new Error(`Failed to fetch ${path}`);
    const text = await response.text();
    return jsyaml.load(text);
  } catch (error) {
    console.error(`Error fetching or parsing YAML file (${path}):`, error);
    // alert(`Error fetching or parsing YAML file (${path}): ${error}`);
    return null;
  }
}

const navStack = [];
let root;

async function prepareTreeData(path) {
  const dirData = await fetchJSON(`${path}directory.json`);
  if (!dirData) {
    console.warn(`[prepareTreeData] No directory.json at: ${path}directory.json`);
    return {children: []};
  }
  if (!dirData.files || !Array.isArray(dirData.files)) {
    console.warn(`[prepareTreeData] directory.json at ${path} has no files array.`);
    return {children: []};
  }

  const children = [];
  for (const file of dirData.files.filter(f => f.endsWith(".yaml"))) {
    console.log(`[prepareTreeData] Considering file: ${file}`);
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
          hasFolder: (dirData.subdirectories || []).includes(folderName)
        };
        children.push(node);
        console.log(`[prepareTreeData] Added node:`, node);
      } else {
        console.warn(`[prepareTreeData] YAML ${file} has invalid Betrag: ${yaml.Betrag}`);
      }
    } else {
      console.warn(`[prepareTreeData] YAML ${file} missing or no Betrag`);
    }
  }
  children.sort((a, b) => b.value - a.value);
  console.log("[prepareTreeData] Final children:", children);
  return {children};
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

async function renderTreemap(path = "") {
  showBackButton();
  console.log(`[renderTreemap] Rendering for path: '${path}'`);
  const tree = await prepareTreeData(path);

  // Remove old chart root if any
  if (root) {
    root.dispose();
  }

  // If no children, show a message
  if (!tree.children || tree.children.length === 0) {
    document.getElementById("chartdiv").innerHTML = "<div style='color:red;padding:2em;'>No data found for this directory.</div>";
    console.warn(`[renderTreemap] No children for path: '${path}'`);
    return;
  } else {
    document.getElementById("chartdiv").innerHTML = ""; // clear old message
  }

  // Create root element
  root = am5.Root.new("chartdiv");

  // Set themes
  root.setThemes([
    am5themes_Animated.new(root)
  ]);

  // Create series
  let series = root.container.children.push(
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

  // Set data
  series.data.setAll([tree]);

  // Tooltip
  series.set("tooltip", am5.Tooltip.new(root, {
    getFillFromSprite: false,
    labelHTML: ""
  }));

  // Custom tooltip html on hover
  series.rectangles.template.adapters.add("tooltipHTML", function(html, target) {
    const data = target.dataItem && target.dataItem.dataContext;
    if (data && data.yaml) {
      return `<b>${data.name}</b><br/>${formatYamlTooltip(data.yaml)}`;
    }
    return html;
  });

  // Enable pointer cursor for clickable fields
  series.rectangles.template.setAll({
    interactive: true,
    cursorOverStyle: "pointer"
  });

  // Click to drilldown
  series.rectangles.template.events.on("click", function(ev) {
    const data = ev.target.dataItem && ev.target.dataItem.dataContext;
    console.log("[Treemap] Rectangle clicked data:", data);
    if (data && data.hasFolder) {
      navStack.push(path);
      renderTreemap(`${path}${data.folderName}/`);
    } else if(data) {
      console.log("[Treemap] Rectangle clicked has no folder.");
    } else {
      console.log("[Treemap] Click event, but no data found.");
    }
  });

  // Debug: log rectangles after chart is ready
  series.events.on("datavalidated", function() {
    let nodes = [];
    series.rectangles.each(rect => {
      nodes.push(rect.dataItem && rect.dataItem.dataContext);
    });
    console.log("Treemap rectangles:", nodes);
  });

  console.log(`[renderTreemap] Rendered treemap for path: '${path}'`);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("back-btn").onclick = () => {
    if (navStack.length > 0) {
      const prevPath = navStack.pop();
      renderTreemap(prevPath);
    }
  };
  renderTreemap();
});
