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
    return null;
  }
}

const navStack = [];

async function getPieData(path = "") {
  const dirData = await fetchJSON(`${path}directory.json`);
  if (!dirData) return [];
  const data = [];
  for (const file of dirData.files.filter(f => f.endsWith(".yaml"))) {
    const yaml = await fetchYAML(`${path}${file}`);
    if (yaml && yaml.Betrag) {
      const betrag = parseFloat(yaml.Betrag);
      if (!isNaN(betrag)) {
        data.push({
          value: betrag,
          name: pickLabel(yaml),
          folderName: file.replace('.yaml', ''),
        });
      }
    }
  }
  // Sort descending by value
  data.sort((a, b) => b.value - a.value);
  return data;
}

async function hasSubdirectory(path, folderName) {
  // Try to fetch the subdirectory's directory.json
  const testPath = `${path}${folderName}/directory.json`;
  const subDir = await fetchJSON(testPath);
  return !!(subDir && subDir.files && subDir.files.some(f => f.endsWith(".yaml")));
}

async function renderPie(path = "") {
  const pieData = await getPieData(path);
  if (!pieData.length) {
    document.getElementById("main-pie").innerHTML = "Keine Daten vorhanden.";
    return;
  }

  // Find min/max value for coloring
  const values = pieData.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);

  const chartDom = document.getElementById('main-pie');
  const myChart = echarts.init(chartDom);

  const option = {
    tooltip: { show: false },
    legend: { show: false },
    visualMap: {
      show: false,
      min,
      max,
      inRange: {
        color: ['#A2D5F2', '#07689F'] // light (small) to dark (big)
      },
      dimension: 0
    },
    series: [
      {
        type: 'pie',
        radius: '70%',
        data: pieData,
        label: {
          show: true,
          formatter: function(param) {
            return `${param.data.name}\n${param.data.value.toLocaleString('de-DE')}`;
          },
          fontSize: 15,
          color: "#111"
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

  // Pie click drilldown
  myChart.off('click'); // Remove old handler if any
  myChart.on('click', async function(params) {
    const part = params.data;
    if (!part || !part.folderName) return;

    const hasChildren = await hasSubdirectory(path, part.folderName);
    if (hasChildren) {
      navStack.push(path);
      renderPie(`${path}${part.folderName}/`);
    }
  });

  // Optional: back button if you want navigation
  let backBtn = document.getElementById('back-btn');
  if (backBtn) {
    backBtn.style.display = navStack.length > 0 ? 'block' : 'none';
    backBtn.onclick = () => {
      if (navStack.length > 0) {
        const prevPath = navStack.pop();
        renderPie(prevPath);
      }
    };
  }

  window.addEventListener('resize', () => { myChart.resize(); });
}

window.onload = function () {
  renderPie("");
};
