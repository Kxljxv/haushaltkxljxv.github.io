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
        folderName: hasChildren ? folderName : undefined, // only expandable nodes get folderName
        children: hasChildren ? [] : undefined // empty array for expandable nodes, undefined for leaves
      });
    }
  }
  children.sort((a, b) => b.value - a.value); // Sort descending by value
  return children;
}

async function hasSubdirectory(path, folderName) {
  const testPath = `${path}${folderName}/directory.json`;
  const subDir = await fetchJSON(testPath);
  return !!(subDir && subDir.files && subDir.files.some(f => f.endsWith(".yaml")));
}

async function renderBreadcrumb(path) {
  const nav = document.getElementById("breadcrumb");
  nav.innerHTML = "";
  const ids = path.replace(/\/+$/, '').split('/').filter(Boolean);
  let currPath = "";
  const rootBtn = document.createElement("button");
  rootBtn.className = "mx-0 px-2 py-0.5 glass hover:bg-blue-200 hover:text-blue-900 transition";
  rootBtn.innerText = "Root";
  rootBtn.onclick = () => renderDendro("");
  nav.appendChild(rootBtn);

  if (ids.length === 0) return;

  for (let i = 0; i < ids.length; ++i) {
    const sep = document.createElement("span");
    sep.innerText = "›";
    sep.className = "mx-1 text-gray-400";
    nav.appendChild(sep);

    currPath = ids.slice(0, i + 1).join("/") + "/";
    const crumbBtn = document.createElement("button");
    crumbBtn.className = "mx-0 px-2 py-0.5 glass hover:bg-blue-200 hover:text-blue-900 transition";
    crumbBtn.innerText = ids[i];
    crumbBtn.onclick = () => renderDendro(currPath);
    nav.appendChild(crumbBtn);
  }
}

async function renderDendro(path = "") {
  await renderBreadcrumb(path);

  const rootNode = {
    name: path === "" ? "Root" : path.replace(/\/+$/, '').split('/').pop(),
    children: await getChildren(path)
  };

  const chartDom = document.getElementById("main-dendro");
  const myChart = echarts.init(chartDom);

  const option = {
    tooltip: {
      show: true,
      trigger: 'item',
      formatter: function (params) {
        return `${params.data.name}<br/>Betrag: ${params.data.value.toLocaleString('de-DE')}`;
      }
    },
    series: [
      {
        type: 'tree',
        data: [rootNode],
        top: '2%',
        left: '2%',
        bottom: '2%',
        right: '20%',
        symbol: 'circle',
        symbolSize: 14,
        orient: 'LR',
        expandAndCollapse: true,
        initialTreeDepth: 1,
        lineStyle: {
          width: 2,
          color: '#ccc'
        },
        label: {
          position: 'left',
          verticalAlign: 'middle',
          align: 'right',
          fontSize: 12
        },
        leaves: {
          label: {
            position: 'right',
            verticalAlign: 'middle',
            align: 'left'
          }
        }
      }
    ]
  };

  myChart.setOption(option);

  myChart.on('dblclick', async function (params) {
    const node = params.data;
    if (!node.folderName) return; // Ignore leaves

    const newChildren = await getChildren(path + node.folderName + "/");
    node.children = newChildren;

    myChart.setOption({
      series: [{ data: [rootNode] }]
    });
  });

  window.addEventListener('resize', () => myChart.resize());
}

window.onload = function () {
  renderDendro("");
};
