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
let chart;

function showBackButton() {
  const btn = document.getElementById("back-btn");
  btn.style.display = navStack.length > 0 ? "block" : "none";
}

function formatYamlTooltip(yaml) {
  if (!yaml) return "";
  return Object.entries(yaml)
    .map(([k, v]) => `<b>${k}</b>: ${v}`)
    .join('<br/>');
}

function showError(msg) {
  const chartdiv = document.getElementById("chartdiv");
  if (chartdiv) chartdiv.innerHTML = `<div style="color:red;font-weight:bold;">${msg}</div>`;
  else alert(msg);
}

// Build ECharts treemap data recursively for current directory
async function buildTreemapData(path = "") {
  const dirData = await fetchJSON(`${path}directory.json`);
  if (!dirData) {
    console.warn("[buildTreemapData] No directory data found for path", path);
    return [];
  }
  const children = [];
  for (const file of dirData.files.filter(f => f.endsWith(".yaml"))) {
    const yaml = await fetchYAML(`${path}${file}`);
    if (yaml && yaml.Betrag) {
      const betrag = parseFloat(yaml.Betrag);
      if (!isNaN(betrag)) {
        const folderName = file.replace(".yaml", "");
        const hasFolder = dirData.subdirectories.includes(folderName);
        children.push({
          id: `${path}${file}`,
          name: pickLabel(yaml),
          value: betrag,
          hasFolder,
          yaml,
          folderName,
          // ECharts specific: mark as leaf if it's not a folder
          leaf: !hasFolder
        });
      }
    }
  }
  // Biggest first
  children.sort((a, b) => b.value - a.value);
  return children;
}

async function renderTreemap(path = "") {
  console.debug("[renderTreemap] path =", path);
  showBackButton();

  const chartdiv = document.getElementById("chartdiv");
  if (!chart) {
    chart = echarts.init(chartdiv, null, {renderer: "canvas"});
  } else {
    chart.clear();
  }

  let children;
  try {
    children = await buildTreemapData(path);
  } catch (err) {
    console.error("[renderTreemap] Error in buildTreemapData:", err);
    showError("Fehler beim Datenaufbau.");
    return;
  }

  if (!children || children.length === 0) {
    showError("Keine gültigen Daten gefunden.");
    return;
  }

  const option = {
    tooltip: {
      formatter: function(params) {
        if (params.data && params.data.yaml) {
          return `<div style="max-width:400px">${formatYamlTooltip(params.data.yaml)}</div>`;
        }
        return params.name;
      }
    },
    series: [
      {
        type: 'treemap',
        data: children,
        leafDepth: 1,
        roam: false,
        label: {
          show: true,
          formatter: '{b}',
          fontSize: 14
        },
        breadcrumb: { show: false }
      }
    ]
  };

  chart.setOption(option);

  // ECharts click event for drilldown
  chart.off('click'); // Remove any previous click
  chart.on('click', async function(params) {
    const data = params.data;
    console.debug("[treemap click]", data);
    if (data && data.hasFolder) {
      navStack.push(path);
      await renderTreemap(path + (path && !path.endsWith('/') ? '/' : '') + data.folderName + '/');
    } else {
      console.debug("[treemap click] No folder to drill down to for:", data);
    }
  });
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
