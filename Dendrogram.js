const LABEL_PRIORITY = [
  "Titelbezeichnung",
  "Gruppenbezeichnung",
  "Obergruppenbezeichnung",
  "Kapitelbezeichnung",
  "Einzelplanbezeichnung",
  "Bereichsbezeichnung"
];

// Add debugging function
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
      let hasChildren = await hasSubdirectory(path, folderName);
      children.push({
        name: pickLabel(yaml),
        value: betrag,
        folderName: hasChildren ? folderName : undefined,
        path: path + folderName, // Add path information
        isLeaf: !hasChildren, // Add explicit leaf indicator
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
  debug("Rendering dendrogram for path:", path);
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
        return `${params.data.name}<br/>Betrag: ${params.data.value !== undefined ? params.data.value.toLocaleString('de-DE') : ""}`;
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

  myChart.on('click', async function (params) {
    const node = params.data;
    debug("Clicked node:", node);

    // Check if the node is a leaf
    if (node.isLeaf || !node.folderName) {
      debug("Leaf node clicked:", {
        name: node.name,
        value: node.value,
        path: node.path
      });
      
      // Create a custom modal for leaf nodes
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      modal.innerHTML = `
        <div class="glass p-6 max-w-lg w-full mx-4">
          <h2 class="text-xl font-bold mb-4">${node.name}</h2>
          <p class="mb-4">Betrag: ${node.value ? node.value.toLocaleString('de-DE') : "N/A"} €</p>
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
    let nodePath = '';
    if (params.treeAncestors && params.treeAncestors.length > 0) {
      const pathParts = params.treeAncestors
        .slice(1) // Skip root
        .map(ancestor => ancestor.data.folderName)
        .filter(Boolean);
      nodePath = pathParts.join('/') + '/';
    }

    nodePath = path + nodePath + node.folderName + '/';
    debug("Loading children for path:", nodePath);

    // Load new children
    if (!node.children || node.children.length === 0) {
      node.children = await getChildren(nodePath);
    }

    // Update chart
    myChart.setOption({
      series: [{ data: [rootNode] }]
    });
  });

  window.addEventListener('resize', () => myChart.resize());
}

window.onload = function () {
  renderDendro("");
};
