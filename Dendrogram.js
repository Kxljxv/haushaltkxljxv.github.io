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

// Helper for breadcrumb titles
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

async function hasSubdirectory(path, folderName) {
  const testPath = `${path}${folderName}/directory.json`;
  const subDir = await fetchJSON(testPath);
  return !!(subDir && subDir.files && subDir.files.some(f => f.endsWith(".yaml")));
}

// This function only fetches direct children, not recursive (for dynamic expansion)
async function getChildren(path = "") {
  const dirData = await fetchJSON(`${path}directory.json`);
  if (!dirData) return [];
  const children = [];
  for (const file of dirData.files.filter(f => f.endsWith(".yaml"))) {
    const yaml = await fetchYAML(`${path}${file}`);
    if (yaml && yaml.Betrag) {
      const betrag = parseFloat(yaml.Betrag);
      if (isNaN(betrag)) continue;
      const folderName = file.replace('.yaml', '');
      let hasChildren = await hasSubdirectory(path, folderName);
      children.push({
        name: pickLabel(yaml),
        value: betrag,
        folderName,
        yaml,
        hasChildren,
        children: hasChildren ? null : undefined // null signals "collapsable but not loaded yet"
      });
    }
  }
  // Order children by value descending
  children.sort((a, b) => b.value - a.value);
  return children;
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

// Renders breadcrumb
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
    renderDendro("");
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
      renderDendro(currPath);
    };
    nav.appendChild(crumbBtn);
  }
}

// Build the top-level tree node
async function getRootTree(path = "") {
  const children = await getChildren(path);
  // Assign nice gradient color to each child node
  const colors = gradientColors(children.length);
  children.forEach((d, idx) => { d.itemStyle = { color: colors[idx] }; });
  return {
    name: path === "" ? "Root" : path.replace(/\/+$/, '').split('/').pop(),
    children: children
  };
}

// Dynamically expand children for a given node in ECharts tree option
async function expandNode(node, path) {
  if (node.children !== null && node.children !== undefined) return;
  // Fetch children for this node
  const newPath = path + node.folderName + "/";
  const children = await getChildren(newPath);
  const colors = gradientColors(children.length);
  children.forEach((d, idx) => { d.itemStyle = { color: colors[idx] }; });
  node.children = children;
}

async function renderDendro(path = "") {
  await renderBreadcrumb(path);

  const tree = await getRootTree(path);
  if (!tree || !tree.children || tree.children.length === 0) {
    document.getElementById("main-dendro").innerHTML = "Keine Daten vorhanden.";
    document.getElementById("back-btn").style.display = navStack.length > 0 ? 'block' : 'none';
    return;
  }

  const chartDom = document.getElementById('main-dendro');
  const myChart = echarts.init(chartDom);

  function tooltipHtml(param) {
    if (!param.data) return "";
    return `
      <div class='echarts-tooltip-custom'>
        <div class='font-bold text-base mb-1'>${param.data.name || ''}</div>
        <div class='text-xs'>
          Betrag: <b>${param.data.value !== undefined ? param.data.value.toLocaleString('de-DE') : ''}</b>
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
        type: 'tree',
        data: [tree],
        top: '5%',
        left: '5%',
        bottom: '5%',
        right: '20%',
        symbol: 'circle',
        symbolSize: 14,
        orient: 'LR',
        edgeShape: 'polyline',
        edgeForkPosition: '63%',
        initialTreeDepth: 2,
        lineStyle: {
          width: 2,
          color: '#aaa'
        },
        label: {
          position: 'left',
          verticalAlign: 'middle',
          align: 'right',
          fontSize: 13,
          formatter: function(param) {
            let name = param.data.name || "";
            let val = param.data.value !== undefined ? param.data.value.toLocaleString('de-DE') : "";
            return `${name}\n${val}`;
          }
        },
        leaves: {
          label: {
            position: 'right',
            verticalAlign: 'middle',
            align: 'left'
          }
        },
        expandAndCollapse: true,
        animationDuration: 350,
        animationDurationUpdate: 200
      }
    ]
  };

  myChart.setOption(option);

  // Click to expand/collapse dynamically (NO navigation)
  myChart.off('click');
  myChart.on('click', async function(params) {
    // Only expand if node has children but not yet loaded
    const node = params.data;
    // Figure out its path
    let currPathArr = [];
    if (params.treeAncestors && params.treeAncestors.length > 1) {
      // excluding root
      for (let i = 1; i < params.treeAncestors.length; ++i) {
        currPathArr.push(params.treeAncestors[i].data.folderName);
      }
    }
    let nodePath = path;
    if (currPathArr.length > 0) {
      nodePath += currPathArr.join("/") + "/";
    }
    // Only expand if node.hasChildren and !node.children
    if (node.hasChildren && (node.children === null || node.children === undefined)) {
      await expandNode(node, nodePath);
      myChart.setOption({
        series: [{
          data: [tree]
        }]
      });
    }
  });

  // Back button logic
  let backBtn = document.getElementById('back-btn');
  backBtn.style.display = navStack.length > 0 ? 'inline-block' : 'none';
  backBtn.onclick = () => {
    if (navStack.length > 0) {
      const prevPath = navStack.pop();
      renderDendro(prevPath);
    }
  };

  window.addEventListener('resize', () => { myChart.resize(); });
}

window.onload = function () {
  renderDendro("");
};
