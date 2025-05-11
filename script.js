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
let chart;

async function prepareDonutData(path) {
  const dirData = await fetchJSON(`${path}directory.json`);
  if (!dirData) {
    console.warn("[prepareDonutData] No directory data found for path", path);
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
          name: pickLabel(yaml),
          value: betrag,
          folderName,
          hasFolder: dirData.subdirectories.includes(folderName),
          yaml
        });
      }
    }
  }
  entries.sort((a, b) => b.value - a.value);
  return entries;
}

function showBackButton() {
  const btn = document.getElementById("back-btn");
  btn.classList.toggle('hidden', navStack.length === 0);
}

function formatTooltip(yaml) {
  return Object.entries(yaml)
    .map(([k, v]) => `<strong>${k}:</strong> ${v}`)
    .join('<br>');
}

async function renderDonut(path = "") {
  showBackButton();

  // Remove old chart if present
  if (chart) {
    chart.destroy();
    chart = undefined;
  }

  const ctx = document.getElementById('donut-chart').getContext('2d');
  const entries = await prepareDonutData(path);

  if (!entries.length) {
    ctx.clearRect(0, 0, 520, 520);
    ctx.font = "20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Keine gültigen Daten gefunden.", 260, 260);
    return;
  }

  // Build data arrays for Chart.js
  const labels = entries.map(e => e.name);
  const data = entries.map(e => e.value);
  const bgColors = entries.map((_,i) => `hsl(${(i*360/entries.length)|0}, 65%, 70%)`);

  chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: bgColors,
        borderWidth: 1,
      }]
    },
    options: {
      responsive: false,
      plugins: {
        legend: { position: "right" },
        tooltip: {
          enabled: true,
          callbacks: {
            label: function(context) {
              const entry = entries[context.dataIndex];
              return [
                `${entry.name}: ${entry.value.toLocaleString()}`,
                ...Object.entries(entry.yaml).map(([k, v]) => `${k}: ${v}`)
              ];
            }
          }
        }
      },
      onClick: async function(evt, elements) {
        if (elements.length > 0) {
          const idx = elements[0].index;
          const entry = entries[idx];
          console.debug("[donut click]", entry);
          if (entry && entry.hasFolder) {
            navStack.push(path);
            await renderDonut((path && !path.endsWith("/") ? path + "/" : path) + entry.folderName + "/");
          }
        }
      }
    }
  });
}

window.onload = function() {
  const backBtn = document.getElementById("back-btn");
  backBtn.onclick = () => {
    if (navStack.length > 0) {
      const prevPath = navStack.pop();
      renderDonut(prevPath);
    }
  };
  renderDonut();
};
