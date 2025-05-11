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

// Fetch directory.json and YAML data
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

async function getPieData(path = "") {
  const dirData = await fetchJSON(`${path}directory.json`);
  if (!dirData) {
    return [];
  }
  const data = [];
  for (const file of dirData.files.filter(f => f.endsWith(".yaml"))) {
    const yaml = await fetchYAML(`${path}${file}`);
    if (yaml && yaml.Betrag) {
      const betrag = parseFloat(yaml.Betrag);
      if (!isNaN(betrag)) {
        data.push({
          value: betrag,
          name: pickLabel(yaml),
        });
      }
    }
  }
  return data;
}

function renderPie(pieData) {
  const chartDom = document.getElementById('main-pie');
  const myChart = echarts.init(chartDom);

  const option = {
    tooltip: { show: false },
    legend: { show: false },
    series: [
      {
        type: 'pie',
        radius: '70%',
        data: pieData,
        label: {
          show: true,
          formatter: function(param) {
            // Show name and value with thousands separator
            return `${param.name}\n${param.value.toLocaleString('de-DE')}`;
          },
          fontSize: 15,
          color: "#111",
          alignTo: 'edge',
        },
        labelLine: {
          show: true,
          length: 18,
          length2: 10
        },
        emphasis: {
          scale: true
        }
      }
    ]
  };

  myChart.setOption(option);
  window.addEventListener('resize', () => { myChart.resize(); });
}

window.onload = async function () {
  const pieData = await getPieData("");
  renderPie(pieData);
};
