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

async function preparePieData(path = "") {
  const dirData = await fetchJSON(`${path}directory.json`);
  if (!dirData) {
    console.warn("[preparePieData] No directory data found for path", path);
    return [];
  }

  const result = [];
  for (const file of dirData.files.filter(f => f.endsWith(".yaml"))) {
    const yaml = await fetchYAML(`${path}${file}`);
    if (yaml && yaml.Betrag) {
      const betrag = parseFloat(yaml.Betrag);
      if (!isNaN(betrag)) {
        result.push({
          name: pickLabel(yaml),
          value: betrag,
          labelText: `${pickLabel(yaml)} (${betrag.toLocaleString("de-DE")})`
        });
      } else {
        console.warn(`[preparePieData] Invalid Betrag in ${file}:`, yaml.Betrag);
      }
    } else {
      console.warn(`[preparePieData] No valid YAML or Betrag in ${file}`);
    }
  }
  result.sort((a, b) => b.value - a.value);
  console.debug("[preparePieData] Pie data:", result);
  return result;
}

async function renderPieChart(path = "") {
  const chartDiv = document.getElementById("chartdiv");
  if (!chartDiv) {
    console.error("No #chartdiv found in DOM.");
    return;
  }
  const data = await preparePieData(path);

  // Destroy old chart if any
  if (window.myEchart) {
    window.myEchart.dispose();
  }
  window.myEchart = echarts.init(chartDiv);

  const option = {
    title: {
      text: 'Haushaltsdaten',
      left: 'center'
    },
    tooltip: {
      trigger: 'item',
      formatter: params => {
        return `<b>${params.data.name}</b><br/>Betrag: ${params.data.value.toLocaleString("de-DE")} (${params.percent}%)`;
      }
    },
    legend: {
      orient: 'vertical',
      left: 10,
      top: 40,
      icon: "arrow",
      // Custom formatter to show arrow, title and Betrag
      formatter: name => {
        const item = data.find(d => d.name === name);
        return item ? `➔ ${item.labelText}` : name;
      },
      textStyle: {
        fontSize: 14
      }
    },
    series: [
      {
        name: 'Haushaltsdaten',
        type: 'pie',
        radius: '60%',
        center: ['60%', '50%'],
        data: data,
        label: {
          formatter: '{b} ({d}%)'
        }
      }
    ]
  };

  window.myEchart.setOption(option);

  // Debug: log click event
  window.myEchart.on('click', params => {
    console.debug("[ECharts Pie Segment Click]", params);
    // For real drilldown, you could call renderPieChart with a new path here.
  });
}

window.onload = function() {
  renderPieChart();
};
