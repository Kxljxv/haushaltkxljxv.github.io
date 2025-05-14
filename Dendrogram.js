const LABEL_PRIORITY = [
  "Titelbezeichnung",
  "Gruppenbezeichnung",
  "Obergruppenbezeichnung",
  "Kapitelbezeichnung",
  "Einzelplanbezeichnung",
  "Bereichsbezeichnung"
];

// Helper: get the best label for a node
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
async function hasSubdirectory(path, folderName) {
  const testPath = `${path}${folderName}/directory.json`;
  const subDir = await fetchJSON(testPath);
  return !!(subDir && subDir.files && subDir.files.some(f => f.endsWith(".yaml")));
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
        folderName: folderName,
        fullPath: path + folderName + '/',
        hasChildren: hasChildren,
        _fetched: false,
        children: hasChildren ? null : undefined // null means not yet loaded, undefined means leaf
      });
    }
  }
  children.sort((a, b) => b.value - a.value);
  return children;
}

// --------- TREE STATE & UI ---------
let treeData = null;   // The single tree object used by ECharts
let currentPath = "";  // Track for breadcrumb & back-btn
let myChart = null;

async function buildRootTree() {
  treeData = {
    name: "Root",
    fullPath: "",
    children: await getChildren(""),
    _fetched: true,
    hasChildren: true
  }
}

function findNodeByPath(node, pathArr) {
  if (pathArr.length === 0) return node;
  if (!node.children) return null;
  let next = node.children.find(child => child.folderName === pathArr[0]);
  if (!next) return null;
  return findNodeByPath(next, pathArr.slice(1));
}

async function expandNodeByPath(tree, pathArr) {
  if (pathArr.length === 0) return;
  let node = tree;
  for (let folder of pathArr) {
    if (!node.children) return;
    let child = node.children.find(c => c.folderName === folder);
    if (!child) return;
    if (child.hasChildren && !child._fetched) {
      child.children = await getChildren(child.fullPath);
      child._fetched = true;
    }
    node = child;
  }
}

function collapseNodeByPath(tree, pathArr) {
  if (pathArr.length === 0) return;
  let node = tree;
  for (let i = 0; i < pathArr.length; ++i) {
    if (!node.children) return;
    let child = node.children.find(c => c.folderName === pathArr[i]);
    if (!child) return;
    if (i === pathArr.length - 1 && child.hasChildren) {
      // Collapse: set children to null (keeps the "expand" icon)
      child.children = null;
      child._fetched = false;
    }
    node = child;
  }
}

function getBreadcrumbArr(path) {
  return path.replace(/\/+$/, '').split('/').filter(Boolean);
}

// --------- UI Rendering ---------
async function renderBreadcrumb(path) {
  const nav = document.getElementById("breadcrumb");
  const backBtn = document.getElementById("back-btn");
  nav.innerHTML = "";
  const ids = getBreadcrumbArr(path);

  if (ids.length > 0) {
    backBtn.classList.remove("hidden");
    backBtn.onclick = () => {
      const newPath = ids.slice(0, -1).join("/");
      renderDendro(newPath ? newPath + "/" : "");
    };
  } else {
    backBtn.classList.add("hidden");
  }

  const rootBtn = document.createElement("button");
  rootBtn.className = "mx-0 px-2 py-0.5 glass hover:bg-blue-200 hover:text-blue-900 transition";
  rootBtn.innerText = "Root";
  rootBtn.onclick = () => renderDendro("");
  nav.appendChild(rootBtn);

  if (ids.length === 0) return;

  let currPath = "";
  for (let i = 0; i < ids.length; ++i) {
    const sep = document.createElement("span");
    sep.innerText = "›";
    sep.className = "mx-1 text-gray-400";
    nav.appendChild(sep);

    currPath += ids[i] + "/";
    const crumbBtn = document.createElement("button");
    crumbBtn.className = "mx-0 px-2 py-0.5 glass hover:bg-blue-200 hover:text-blue-900 transition";
    crumbBtn.innerText = ids[i];
    const pathForClick = currPath;
    crumbBtn.onclick = () => renderDendro(pathForClick);
    nav.appendChild(crumbBtn);
  }
}

function getEChartsOption() {
  return {
    tooltip: {
      show: true,
      trigger: 'item',
      formatter: function (params) {
        const data = params.data;
        return `${data.name}<br/>Betrag: ${data.value ? data.value.toLocaleString('de-DE') + ' €' : 'N/A'}`;
      },
      className: 'echarts-tooltip-custom'
    },
    series: [{
      type: 'tree',
      data: [treeData],
      top: '2%',
      left: '2%',
      bottom: '2%',
      right: '20%',
      symbol: 'circle',
      symbolSize: 14,
      orient: 'LR',
      expandAndCollapse: false,
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
      },
      emphasis: { focus: 'descendant' },
      animation: true,
      animationDuration: 400,
      animationEasingUpdate: 'quinticInOut'
    }]
  };
}

async function renderDendro(path = "") {
  currentPath = path;
  await renderBreadcrumb(path);
  if (!treeData) await buildRootTree();

  // Expand all ancestors up to the current path
  const pathArr = getBreadcrumbArr(path);
  await expandNodeByPath(treeData, pathArr);

  const chartDom = document.getElementById("main-dendro");
  if (!myChart) myChart = echarts.init(chartDom);
  myChart.setOption(getEChartsOption());

  // Only set one click handler
  if (!myChart._hasClickHandler) {
    myChart.on('click', async function (params) {
      const nodePathArr = findNodePath(treeData, params.data);
      if (!nodePathArr) return;
      const node = findNodeByPath(treeData, nodePathArr);
      if (!node) return;

      // LEAF: Show a modal
      if (!node.hasChildren) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
          <div class="glass p-6 max-w-lg w-full mx-4">
            <h2 class="text-xl font-bold mb-4">${node.name}</h2>
            <p class="mb-4">Betrag: ${node.value ? node.value.toLocaleString('de-DE') : "N/A"} €</p>
            <p class="mb-4 text-sm text-gray-600">Folder: ${node.folderName || 'N/A'}</p>
            <button class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Schließen</button>
          </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('button').onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        return;
      }

      // NON-LEAF: Expand/collapse in-place (toggle)
      if (!node._fetched) {
        // Expand
        node.children = await getChildren(node.fullPath);
        node._fetched = true;
      } else {
        // Collapse
        node.children = null;
        node._fetched = false;
      }
      myChart.setOption(getEChartsOption());
    });
    myChart._hasClickHandler = true;
  }

  window.onresize = () => myChart.resize();
}

// Helper: Find the node path in the treeData from the root by comparing folderName chain
function findNodePath(tree, targetData, currPath=[]) {
  if (tree === targetData) return currPath;
  if (!tree.children) return null;
  for (const child of tree.children) {
    if (child === targetData) return currPath.concat(child.folderName);
    const tryPath = findNodePath(child, targetData, currPath.concat(child.folderName));
    if (tryPath) return tryPath;
  }
  return null;
}

// --------- INIT ---------
window.onload = function () {
  renderDendro("");
};
