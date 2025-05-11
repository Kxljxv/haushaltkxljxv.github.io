const LABEL_PRIORITY = [
  "Titelbezeichnung",
  "Gruppenbezeichnung",
  "Obergruppenbezeichnung",
  "Kapitelbezeichnung",
  "Einzelplanbezeichnung",
  "Bereichsbezeichnung"
];

// For breadcrumbs
function pathParts(path) {
  const trimmed = path.replace(/\/+$/, '').replace(/^\/+/, '');
  if (!trimmed) return [];
  return trimmed.split('/').filter(Boolean);
}

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
  } catch {
    return null;
  }
}

async function fetchYAML(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to fetch ${path}`);
    const text = await response.text();
    return jsyaml.load(text);
  } catch {
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
          yaml: yaml
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

function gradientColors(n) {
  // Generates n gradient colors, inspired by the ECharts "Gradient Stacked Area" demo
  const stops = [
    ['#4F8EF7', '#3EDBF0'], // blue-cyan
    ['#A770EF', '#FDB99B'], // purple-orange
    ['#43E97B', '#38F9D7'], // green-teal
    ['#667EEA', '#764BA2'], // blue-purple
    ['#F7971E', '#FFD200'], // orange-yellow
    ['#F953C6', '#B91D73'], // pink-magenta
    ['#43CBFF', '#9708CC'], // blue-violet
    ['#11998e', '#38ef7d']  // green
  ];
  let result = [];
  for (let i = 0; i < n; ++i) {
    let s = stops[i % stops.length];
    result.push({
      type: 'linear',
      x: 0, y: 0, x2: 1, y2: 1,
      colorStops: [
        { offset: 0, color: s[0] },
        { offset: 1, color: s[1] }
      ]
    });
  }
  return result;
}

function renderBreadcrumb(path) {
  const nav = document.getElementById("breadcrumb");
  nav.innerHTML = "";
  const parts = pathParts(path);
  let crumbs = [{ name: "Root", path: "" }];
  let current = "";
  for (const p of parts) {
    current = current ? `${current}/${p}` : p;
    crumbs.push({ name: p, path: current });
  }
  for (let i = 0; i < crumbs.length; ++i) {
    const c = crumbs[i];
    const el = document.createElement("button");
    el.className = "mx-1 px-3 py-1 glass hover:bg-blue-200 hover:text-blue-900 transition";
    el.innerText = c.name;
    el.onclick = () => {
      // Go to this level
      navStack.length = 0;
      if (c.path !== path) navStack.push(...pathParts(c.path).slice(0, -1).map((_, idx, arr) => arr.slice(0, idx + 1).join("/") + "/"));
      renderPie(c.path ? c.path + "/" : "");
    };
    nav.appendChild(el);
    if (i < crumbs.length - 1) {
      const sep = document.createElement("span");
      sep.innerText = "›";
      sep.className = "mx-1 text-gray-400";
      nav.appendChild(sep);
    }
  }
}

async function renderPie(path = "") {
  renderBreadcrumb(path);

  const pieData = await getPieData(path);
  if (!pieData.length) {
    document.getElementById("main-pie").innerHTML = "Keine Daten vorhanden.";
    document.getElementById("back-btn").style.display = navStack.length > 0 ? 'block' : 'none';
    return;
  }

  // Generate gradient colors for each part
  const colors = gradientColors(pieData.length);

  const chartDom = document.getElementById('main-pie');
  const myChart = echarts.init(chartDom);

  // Apply color gradients to each segment
  pieData.forEach((d, idx) => { d.itemStyle = { color: colors[idx] }; });

  // Custom tooltip HTML
  function tooltipHtml(param) {
    if (!param.data) return "";
    return `
      <div class='echarts-tooltip-custom'>
        <div class='font-bold text-lg mb-1'>${param.data.name}</div>
        <div class='text-base'>
          Betrag: <b>${param.data.value.toLocaleString('de-DE')}</b>
        </div>
      </div>
    `;
  }

  const option = {
    tooltip: {
      show: true,
      trigger: 'item',
      backgroundColor: 'rgba(255,255,255,0.85)',
      borderRadius: 16,
      borderWidth: 0,
      className: 'echarts-tooltip-custom',
      textStyle: { color: '#222', fontSize: 16 },
      extraCssText: 'backdrop-filter: blur(12px);',
      formatter: tooltipHtml
    },
    legend: { show: false },
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
  myChart.off('click');
  myChart.on('click', async function(params) {
    const part = params.data;
    if (!part || !part.folderName) return;
    const hasChildren = await hasSubdirectory(path, part.folderName);
    if (hasChildren) {
      navStack.push(path);
      renderPie(`${path}${part.folderName}/`);
    }
  });

  // Back button logic
  let backBtn = document.getElementById('back-btn');
  backBtn.style.display = navStack.length > 0 ? 'block' : 'none';
  backBtn.onclick = () => {
    if (navStack.length > 0) {
      const prevPath = navStack.pop();
      renderPie(prevPath);
    }
  };

  window.addEventListener('resize', () => { myChart.resize(); });
}

window.onload = function () {
  renderPie("");
};
