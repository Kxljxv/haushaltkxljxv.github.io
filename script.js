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

const navStack = [];
let chart, root, series;

async function prepareTreeData(path) {
  const dirData = await fetchJSON(`${path}directory.json`);
  if (!dirData) return {children: []};

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
      }
    }
  }
  // sort biggest first for best layout
  children.sort((a, b) => b.value - a.value);
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

  // Prepare data for amCharts
  const tree = await prepareTreeData(path);

  // Clear old chart if any
  if (root) {
    root.dispose();
  }

  // Create root element
  root = am5.Root.new("chartdiv");

  // Set themes
  root.setThemes([
    am5themes_Animated.new(root)
  ]);

  // Create series
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

  // Set data
  series.data.setAll([tree]);

  // Tooltip
  series.set("tooltip", am5.Tooltip.new(root, {
    getFillFromSprite: false,
    labelText: "{category}\n{value}"
  }));

  // Custom tooltip html on hover
  series.labels.template.adapters.add("text", function(text, target) {
    if (target.dataItem && target.dataItem.dataContext && target.dataItem.dataContext.yaml) {
      return target.dataItem.dataContext.name;
    }
    return text;
  });

  series.squares.template.adapters.add("tooltipHTML", function(html, target) {
    const data = target.dataItem && target.dataItem.dataContext;
    if (data && data.yaml) {
      return `<b>${data.name}</b><br/>${formatYamlTooltip(data.yaml)}`;
    }
    return html;
  });

  // Click to drilldown
  series.squares.template.events.on("click", function(ev) {
    const data = ev.target.dataItem.dataContext;
    if (data && data.hasFolder) {
      navStack.push(path);
      renderTreemap(`${path}${data.folderName}/`);
    }
  });
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
