/**
 * Improved JS: drilldown on pie click, centered chart, robust, performant, accessible, loading/errors.
 */

const LABEL_PRIORITY = [
  "Titelbezeichnung",
  "Gruppenbezeichnung",
  "Obergruppenbezeichnung",
  "Kapitelbezeichnung",
  "Einzelplanbezeichnung",
  "Bereichsbezeichnung"
];

const cache = {};
let navStack = [];

function pickLabel(yamlObj) {
  for (const key of LABEL_PRIORITY) {
    if (yamlObj[key]) return yamlObj[key];
  }
  return "Unbenannt";
}

function showFeedback({loading = false, message = ""} = {}) {
  const overlay = document.getElementById("feedback-overlay");
  const spinner = document.getElementById("spinner");
  const msg = document.getElementById("feedback-message");
  if (loading) {
    overlay.style.display = "flex";
    spinner.style.display = "block";
    msg.style.display = "none";
  } else if (message) {
    overlay.style.display = "flex";
    spinner.style.display = "none";
    msg.innerText = message;
    msg.style.display = "block";
  } else {
    overlay.style.display = "none";
    spinner.style.display = "none";
    msg.style.display = "none";
  }
}

async function fetchJSON(path) {
  if (cache[path]) return cache[path];
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error();
    const data = await response.json();
    cache[path] = data;
    return data;
  } catch {
    return null;
  }
}

async function fetchYAML(path) {
  if (cache[path]) return cache[path];
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error();
    const text = await response.text();
    const data = jsyaml.load(text);
    cache[path] = data;
    return data;
  } catch {
    return null;
  }
}

async function getPieData(path = "") {
  const dirData = await fetchJSON(`${path}directory.json`);
  if (!dirData) return [];
  const yamlFiles = dirData.files.filter(f => f.endsWith(".yaml"));
  const maxSegments = window.innerWidth < 600 ? 10 : 25;
  let visible = yamlFiles.slice(0, maxSegments);
  let hidden = yamlFiles.slice(maxSegments);

  const data = [];
  for (const file of visible) {
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
  if (hidden.length > 0) {
    let sum = 0, count = 0;
    for (const file of hidden) {
      const yaml = await fetchYAML(`${path}${file}`);
      if (yaml && yaml.Betrag) {
        const betrag = parseFloat(yaml.Betrag);
        if (!isNaN(betrag)) {
          sum += betrag;
          count++;
        }
      }
    }
    if (sum > 0)
      data.push({
        value: sum,
        name: `Other (${count})`,
        folderName: null,
        yaml: null
      });
  }
  data.sort((a, b) => b.value - a.value || (a.name || "").localeCompare(b.name || ""));
  return data;
}

async function hasSubdirectory(path, folderName) {
  if (!folderName) return false;
  const testPath = `${path}${folderName}/directory.json`;
  const subDir = await fetchJSON(testPath);
  return !!(subDir && subDir.files && subDir.files.some(f => f.endsWith(".yaml")));
}

async function renderBreadcrumb(path) {
  const nav = document.getElementById("breadcrumb");
  nav.innerHTML = "";
  const ids = path.replace(/\/+$/, '').split('/').filter(Boolean);
  let currPath = "";
  nav.appendChild(createCrumb("Root", "", path === ""));
  for (const id of ids) {
    currPath += `${id}/`;
    nav.appendChild(createCrumb(id, currPath, currPath === path));
  }
  const backBtn = document.getElementById("back-btn");
  if (path && ids.length) {
    backBtn.style.display = "";
    backBtn.onclick = () => {
      const parent = ids.slice(0, -1).join('/');
      renderPie(parent ? parent + '/' : "");
    };
    backBtn.onkeyup = e => { if (e.key === 'Enter' || e.key === ' ') backBtn.onclick(); };
  } else {
    backBtn.style.display = "none";
  }
}

function createCrumb(text, path, isActive) {
  const crumb = document.createElement("button");
  crumb.className = `glass px-2 py-0.5 focus:outline-none focus:ring ${isActive ? "bg-blue-200 text-blue-900" : ""}`;
  crumb.innerText = text;
  crumb.tabIndex = 0;
  crumb.setAttribute("aria-current", isActive ? "page" : "false");
  crumb.onclick = () => renderPie(path);
  crumb.onkeyup = e => { if ((e.key === 'Enter' || e.key === ' ') && !isActive) crumb.onclick(); };
  return crumb;
}

async function renderPie(path = "") {
  showFeedback({ loading: true });
  await renderBreadcrumb(path);
  navStack = [path];
  let pieData;
  try {
    pieData = await getPieData(path);
  } catch (e) {
    showFeedback({ message: "Fehler beim Laden der Daten." });
    return;
  }
  showFeedback({});
  const chartDom = document.getElementById('main-pie');
  // Dispose previous chart to avoid memory leaks
  if (window.myChart) {
    try { window.myChart.dispose(); } catch {}
    window.myChart = null;
  }
  if (!pieData.length) {
    showFeedback({ message: "Keine Daten in diesem Verzeichnis verfügbar." });
    chartDom.innerHTML = "";
    return;
  }
  window.myChart = echarts.init(chartDom, null, { renderer: "canvas" });
  pieData.forEach((d, idx) => { d.itemStyle = { color: gradientColors(pieData.length)[idx] }; });

  const total = pieData.reduce((sum, d) => sum + d.value, 0);
  window.myChart.setOption({
    tooltip: {
      show: true,
      formatter: param => {
        const pct = total ? ` (${((param.data.value / total) * 100).toFixed(1)}%)` : '';
        return `${param.data.name}: ${param.data.value}${pct}`;
      },
      extraCssText: 'pointer-events:auto;'
    },
    series: [{
      type: 'pie',
      data: pieData,
      radius: window.innerWidth < 600 ? '60%' : '70%',
      center: ['50%', '50%'],
      label: {
        formatter: '{b}: {d}%',
        color: "#1e293b",
        fontSize: window.innerWidth < 600 ? 10 : 13,
      },
      emphasis: { scale: 1.06 }
    }]
  });

  // Drilldown on click (only if subdirectory exists)
  window.myChart.off('click');
  window.myChart.on('click', async (params) => {
    const folder = params.data.folderName;
    if (folder) {
      showFeedback({ loading: true });
      if (await hasSubdirectory(path, folder)) {
        renderPie(`${path}${folder}/`);
      } else {
        showFeedback({ message: "Keine weiteren Unterdaten vorhanden." });
        setTimeout(() => showFeedback({}), 1100);
      }
    }
  });
}

function gradientColors(n) {
  const stops = [
    ['#4F8EF7', '#3EDBF0'],
    ['#A770EF', '#FDB99B'],
    ['#43E97B', '#38F9D7'],
    ['#667EEA', '#764BA2'],
    ['#F7971E', '#FFD200'],
    ['#F953C6', '#B91D73'],
    ['#43CBFF', '#9708CC'],
    ['#11998e', '#38ef7d']
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

// Accessibility: keyboard navigation for main pie div
window.onload = () => renderPie("");
