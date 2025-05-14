const LABEL_PRIORITY = [
  "Titelbezeichnung",
  "Gruppenbezeichnung",
  "Obergruppenbezeichnung",
  "Kapitelbezeichnung",
  "Einzelplanbezeichnung",
  "Bereichsbezeichnung"
];

function debug(message, data) {
  console.log(`[Debug] ${message}`, data);
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
  } catch (error) {
    debug(`Error fetching JSON from ${path}:`, error);
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
    debug(`Error fetching YAML from ${path}:`, error);
    return null;
  }
}

async function getChildren(path = "") {
  debug("Getting children for path:", path);
  const dirData = await fetchJSON(`${path}directory.json`);
  if (!dirData) return [];
  
  const children = [];
  for (const file of dirData.files.filter(f => f.endsWith(".yaml"))) {
    const yaml = await fetchYAML(`${path}${file}`);
    if (yaml && yaml.Betrag) {
      const betrag = parseFloat(yaml.Betrag);
      if (isNaN(betrag)) continue;
      
      const folderName = file.replace('.yaml', '');
      const hasChildren = await hasSubdirectory(path, folderName);
      
      children.push({
        name: pickLabel(yaml),
        value: betrag,
        folderName: folderName,
        fullPath: path + folderName,
        hasChildren: hasChildren,
        children: hasChildren ? [] : undefined
      });
    }
  }
  children.sort((a, b) => b.value - a.value);
  debug("Found children:", children);
  return children;
}

async function hasSubdirectory(path, folderName) {
  const testPath = `${path}${folderName}/directory.json`;
  debug("Checking for subdirectory:", testPath);
  const subDir = await fetchJSON(testPath);
  const hasChildren = !!(subDir && subDir.files && subDir.files.some(f => f.endsWith(".yaml")));
  debug(`Folder ${folderName} has children:`, hasChildren);
  return hasChildren;
}

async function renderBreadcrumb(path) {
  const nav = document.getElementById("breadcrumb");
  const backBtn = document.getElementById("back-btn");
  nav.innerHTML = "";
  
  const ids = path.replace(/\/+$/, '').split('/').filter(Boolean);
  
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

let myChart = null;
let rootData = null;

async function initializeChart() {
  if (!rootData) {
    rootData = {
      name: "Root",
      children: await getChildren(""),
      fullPath: ""
    };
  }
}

// Helper function to find a node in the tree
function findNode(tree, path) {
  if (!path || path === "") return tree;
  const parts = path.split('/').filter(Boolean);
  let current = tree;

  for (const part of parts) {
    if (!current.children) return null;
    current = current.children.find(child => child.folderName === part);
    if (!current) return null;
  }
  return current;
}

async function renderDendro(path = "") {
  debug("Rendering dendrogram for path:", path);
  await renderBreadcrumb(path);

  // Initialize root data if not exists
  await initializeChart();

  const chartDom = document.getElementById("main-dendro");
  if (!myChart) {
    myChart = echarts.init(chartDom);
  }

  const option = {
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
      data: [rootData],
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
      },
      emphasis: {
        focus: 'descendant'
      },
      animation: true,
      animationDuration: 500,
      animationEasingUpdate: 'quinticInOut'
    }]
  };

  myChart.setOption(option);

  myChart.on('click', async function (params) {
    const node = params.data;
    debug("Clicked node:", node);

    if (!node.hasChildren || !node.folderName) {
      debug("Leaf node clicked:", node);
      
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
      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };
      return;
    }

    // Handle expandable nodes
    const newPath = node.fullPath ? node.fullPath + '/' : node.folderName + '/';
    debug("Loading children for path:", newPath);

    // Find the clicked node in the tree structure
    const targetNode = findNode(rootData, node.fullPath);
    if (targetNode) {
      // Load children if they haven't been loaded yet
      if (!targetNode.children || targetNode.children.length === 0) {
        targetNode.children = await getChildren(newPath);
      }

      // Update the chart
      myChart.setOption({
        series: [{ data: [rootData] }]
      });
    }
  });

  // Handle window resize
  const resizeHandler = () => {
    if (myChart) {
      myChart.resize();
    }
  };
  window.removeEventListener('resize', resizeHandler);
  window.addEventListener('resize', resizeHandler);
}

// Initialize on page load
window.onload = function () {
  renderDendro("");
};
