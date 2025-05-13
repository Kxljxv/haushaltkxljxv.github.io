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

// Returns an array of {id, name} for each directory in path
async function getPathTitles(path) {
  const parts = [];
  let curr = "";
  let ids = path.replace(/\/+$/, '').split('/').filter(Boolean);
  for (let i = 0; i < ids.length; ++i) {
    curr = ids.slice(0, i + 1).join("/") + "/";
    let dirJson = await fetchJSON(curr + "directory.json");
    if (!dirJson) {
      parts.push({ id: ids[i], name: ids[i] });
      continue;
    }
    let yamlFile = ids[i] + ".yaml";
    if (dirJson.files && dirJson.files.includes(yamlFile)) {
      let yaml = await fetchYAML(curr + yamlFile);
      if (yaml) {
        parts.push({ id: ids[i], name: pickLabel(yaml) });
        continue;
      }
    }
    parts.push({ id: ids[i], name: ids[i] });
  }
  return parts;
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

async function getTreeData(path = "") {
  const dirData = await fetchJSON(`${path}directory.json`);
  if (!dirData) return { children: [] };
  const children = [];
  for (const file of dirData.files.filter(f => f.endsWith(".yaml"))) {
    const yaml = await fetchYAML(`${path}${file}`);
    if (yaml && yaml.Betrag) {
      const betrag = parseFloat(yaml.Betrag);
      if (!isNaN(betrag)) {
        children.push({
          name: pickLabel(yaml),
          value: betrag,
          folderName: file.replace('.yaml', ''),
          yaml: yaml
        });
      }
    }
  }
  // Sort descending by value
  children.sort((a, b) => b.value - a.value);
  return { children };
}

async function hasSubdirectory(path, folderName) {
  const testPath = `${path}${folderName}/directory.json`;
  const subDir = await fetchJSON(testPath);
  return !!(subDir && subDir.files && subDir.files.some(f => f.endsWith(".yaml")));
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

async function renderBreadcrumb(path) {
  const nav = document.getElementById("breadcrumb");
  nav.innerHTML = "";
  const ids = path.replace(/\/+$/, '').split('/').filter(Boolean);
  let currPath = "";
  // always start with "Root"
  const rootBtn = document.createElement("button");
  rootBtn.className = "mx-0 px-2 py-0.5 glass hover:bg-blue-200 hover:text-blue-900 transition";
  rootBtn.innerText = "Root";
  rootBtn.onclick = () => {
    navStack.length = 0;
    renderTreemap("");
  };
  nav.appendChild(rootBtn);

  if (ids.length === 0) return;

  const titleParts = await getPathTitles(path);
  for (let i = 0; i < ids.length; ++i) {
    const sep = document.createElement("span");
    sep.innerText = "›";
    sep.className = "mx-1 text-gray-400";
    nav.appendChild(sep);

    currPath = ids.slice(0, i + 1).join("/") + "/";
    const crumbBtn = document.createElement("button");
    crumbBtn.className = "mx-0 px-2 py-0.5 glass hover:bg-blue-200 hover:text-blue-900 transition";
    crumbBtn.innerText = titleParts[i] ? titleParts[i].name : ids[i];
    crumbBtn.onclick = () => {
      navStack.length = 0;
      if (currPath !== path) navStack.push(...ids.slice(0, i).map((_, idx, arr) => arr.slice(0, idx + 1).join("/") + "/"));
      renderTreemap(currPath);
    };
    nav.appendChild(crumbBtn);
  }
}

async function renderTreemap(path = "") {
  await renderBreadcrumb(path);

  const treeData = await getTreeData(path);
  if (!treeData.children.length) {
    document.getElementById("main-tree").innerHTML = "Keine Daten vorhanden.";
    document.getElementById("back-btn").style.display = navStack.length > 0 ? 'block' : 'none';
    return;
  }

  // Generate gradient colors for each part
  const colors = gradientColors(treeData.children.length);

  const chartDom = document.getElementById('main-tree');
  const myChart = echarts.init(chartDom);

  // Assign color gradients to each node
  treeData.children.forEach((d, idx) => { d.itemStyle = { color: colors[idx] }; });

  function tooltipHtml(param) {
    if (!param.data) return "";
    return `
      <div class='echarts-tooltip-custom'>
        <div class='font-bold text-base mb-1'>${param.data.name}</div>
        <div class='text-xs'>
          Betrag: <b>${param.data.value.toLocaleString('de-DE')}</b>
        </div>
      </div>
    `;
  }

  const option = {
    tooltip: {
      show: true,
      trigger: 'item',
      backgroundColor: 'rgba(255,255,255,0.92)',
      borderRadius: 12,
      borderWidth: 0,
      className: 'echarts-tooltip-custom',
      textStyle: { color: '#222', fontSize: 14 },
      extraCssText: 'backdrop-filter: blur(8px);',
      formatter: tooltipHtml
    },
    series: [
      {
        type: 'treemap',
        data: treeData.children,
        roam: false,
        leafDepth: 1,
        label: {
          show: true,
          formatter: function(param) {
            return `${param.data.name}\n${param.data.value.toLocaleString('de-DE')}`;
          },
          fontSize: 13,
          color: "#111",
          overflow: 'truncate'
        },
        upperLabel: { show: false },
        itemStyle: {
          borderColor: 'rgba(255,255,255,0.2)',
          borderWidth: 1,
          gapWidth: 2
        },
        breadcrumb: { show: false }
      }
    ]
  };

  myChart.setOption(option);

  myChart.off('click');
  myChart.on('click', async function(params) {
    const part = params.data;
    if (!part || !part.folderName) return;
    const hasChildren = await hasSubdirectory(path, part.folderName);
    if (hasChildren) {
      navStack.push(path);
      renderTreemap(`${path}${part.folderName}/`);
    }
  });

  // Back button logic
  let backBtn = document.getElementById('back-btn');
  backBtn.style.display = navStack.length > 0 ? 'inline-block' : 'none';
  backBtn.onclick = () => {
    if (navStack.length > 0) {
      const prevPath = navStack.pop();
      renderTreemap(prevPath);
    }
  };

  window.addEventListener('resize', () => { myChart.resize(); });
}

window.onload = function () {
  renderTreemap("");
};
