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
  // Sort big to small
  data.sort((a, b) => b.value - a.value);
  return data;
}

function getColorScale(pieData) {
  // You can adjust the color range as you like
  const colorFrom = [50, 130, 255]; // blue
  const colorTo = [255, 70, 70];   // red
  const min = pieData[pieData.length - 1]?.value || 0;
  const max = pieData[0]?.value || 1;
  return pieData.map(d => {
    // Interpolate color by value
    let t = (d.value - min) / (max - min || 1);
    let r = Math.round(colorFrom[0] + t * (colorTo[0] - colorFrom[0]));
    let g = Math.round(colorFrom[1] + t * (colorTo[1] - colorFrom[1]));
    let b = Math.round(colorFrom[2] + t * (colorTo[2] - colorFrom[2]));
    return `rgb(${r},${g},${b})`;
  });
}

function renderPie(pieData) {
  const chartDom = document.getElementById('main-pie');
  const myChart = echarts.init(chartDom);

  // Make color array by size
  const colorArr = getColorScale(pieData);

  const option = {
    tooltip: { show: false },
    legend: { show: false },
    color: colorArr,
    series: [
      {
        type: 'pie',
        radius: '70%',
        data: pieData,
        label: {
          show: true,
          formatter: function(param) {
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

  // 1. Make parts clickable
  myChart.on('click', function (params) {
    if (!params.data) return;
    // Replace with your drilldown logic if needed.
    alert(`Clicked: ${params.data.name}\nWert: ${params.data.value.toLocaleString('de-DE')}`);
    // console.log(params.data);
  });

  window.addEventListener('resize', () => { myChart.resize(); });
}

window.onload = async function () {
  const pieData = await getPieData("");
  renderPie(pieData);
};
