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
let chartInstance = null;

async function preparePieData(path) {
  const dirData = await fetchJSON(`${path}directory.json`);
  if (!dirData) {
    console.warn("[preparePieData] No directory data found for path", path);
    return [];
  }
  const entries = [];
  for (const file of dirData.files.filter(f => f.endsWith(".yaml"))) {
    const yaml = await fetchYAML(`${path}${file}`);
    if (yaml && yaml.Betrag) {
      const betrag = parseFloat(yaml.Betrag);
      if (!isNaN(betrag)) {
        const folderName = file.replace(".yaml", "");
        entries.push({
          label: pickLabel(yaml),
          value: betrag,
          hasFolder: dirData.subdirectories.includes(folderName),
          folderName: folderName,
          yaml: yaml
        });
      }
    }
  }
  entries.sort((a, b) => b.value - a.value);
  return entries;
}

function getRandomColor(i) {
  // Generate visually distinct pastel colors
  const base = 200 + (i * 35) % 55;
  return `hsl(${(i * 137.5) % 360}, 70%, ${base % 60 + 35}%)`;
}

function showBackButton() {
  const btn = document.getElementById("back-btn");
  btn.style.display = navStack.length > 0 ? "block" : "none";
}

function renderTitle(path) {
  document.getElementById("chart-title").textContent = path ? `Haushalt: ${path}` : "Haushalt Pie Chart";
}

// Center Text Plugin for Chart.js 4.x
const centerTextPlugin = {
  id: 'centerText',
  afterDraw(chart, args, options) {
    if (!options.display) return;
    const { ctx, chartArea: { width, height, left, top } } = chart;
    ctx.save();
    ctx.font = options.font || 'bold 1.7rem Arial';
    ctx.fillStyle = options.color || '#222';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(options.text, left + width / 2, top + height / 2);
    ctx.restore();
  }
};

async function renderPieChart(path = "") {
  showBackButton();
  renderTitle(path);

  const pieData = await preparePieData(path);

  if (!pieData.length) {
    document.getElementById("pie-chart").replaceWith(document.createElement('canvas'));
    document.getElementById("pie-chart").id = "pie-chart";
    document.getElementById("chart-title").textContent = "Keine gültigen Daten gefunden.";
    return;
  }

  // Destroy old chart if exists
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  // Prepare Chart.js data
  const labels = pieData.map(e => e.label);
  const values = pieData.map(e => e.value);
  const bgColors = pieData.map((_, i) => getRandomColor(i));
  const sum = values.reduce((a, b) => a + b, 0);

  // Create new canvas if needed (for drilldown/back)
  let canvas = document.getElementById("pie-chart");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "pie-chart";
    document.querySelector(".relative").appendChild(canvas);
  }
  const ctx = canvas.getContext("2d");

  chartInstance = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: bgColors,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }, // No default legend
        datalabels: {
          color: '#222',
          align: 'end',
          anchor: 'end',
          font: { weight: 'bold', size: 14 },
          formatter: function(value, context) {
            return context.chart.data.labels[context.dataIndex];
          },
          // Draw a line (leader) from slice to label (arrow effect)
          listeners: {
            enter: function(context) {
              context.hovered = true;
              return true;
            },
            leave: function(context) {
              context.hovered = false;
              return true;
            }
          },
          offset: 20,
          borderRadius: 4,
          backgroundColor: null,
          borderWidth: 0,
          borderColor: null,
          display: true,
          // Use Chart.js v4's "drawTime" to draw after arcs for leader lines
          // NOTE: For real arrows, you'd need a more custom plugin, but this gives the "callout" effect.
        },
        centerText: {
          display: true,
          text: sum.toLocaleString() + " €",
          color: "#222",
          font: "bold 2.1rem Arial"
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const entry = pieData[context.dataIndex];
              let tip = `${entry.label}: ${entry.value.toLocaleString()} €`;
              Object.entries(entry.yaml).slice(0,2).forEach(([k,v]) => {
                tip += `\n${k}: ${v}`;
              });
              return tip;
            }
          }
        }
      },
      onClick: async function(evt, elements) {
        if (!elements.length) return;
        const idx = elements[0].index;
        const entry = pieData[idx];
        console.debug("[pie click]", entry);
        if (entry.hasFolder) {
          navStack.push(path);
          await renderPieChart((path && !path.endsWith("/")) ? path + "/" + entry.folderName + "/" : path + entry.folderName + "/");
        }
      }
    },
    plugins: [ChartDataLabels, centerTextPlugin]
  });
}

window.onload = function() {
  document.getElementById("back-btn").onclick = () => {
    if (navStack.length > 0) {
      const prevPath = navStack.pop();
      renderPieChart(prevPath);
    }
  };
  renderPieChart();
};
