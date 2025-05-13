/**
 * Main JavaScript logic for visualizing data as a pie chart using ECharts.
 * Includes drilldown functionality, breadcrumb navigation, and hover tooltips.
 */

/**
 * The order of priority for picking labels (titles) from YAML files.
 * The first non-empty field in this list is used as the title of a segment.
 */
const LABEL_PRIORITY = [
  "Titelbezeichnung",
  "Gruppenbezeichnung",
  "Obergruppenbezeichnung",
  "Kapitelbezeichnung",
  "Einzelplanbezeichnung",
  "Bereichsbezeichnung"
];

/**
 * Picks the first available label from the YAML object based on LABEL_PRIORITY.
 * @param {Object} yamlObj - The parsed YAML object.
 * @returns {string} The selected label or "Unbenannt" if no label is found.
 */
function pickLabel(yamlObj) {
  for (const key of LABEL_PRIORITY) {
    if (yamlObj[key]) return yamlObj[key];
  }
  return "Unbenannt";
}

/**
 * Fetches a JSON file from the given path.
 * @param {string} path - The path to the JSON file.
 * @returns {Promise<Object|null>} The parsed JSON object or null if an error occurs.
 */
async function fetchJSON(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to fetch ${path}`);
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Fetches and parses a YAML file from the given path.
 * @param {string} path - The path to the YAML file.
 * @returns {Promise<Object|null>} The parsed YAML object or null if an error occurs.
 */
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

/**
 * Global navigation stack for tracking the navigation history.
 */
const navStack = [];

/**
 * Retrieves pie chart data for the current directory.
 * @param {string} path - The path to the directory.
 * @returns {Promise<Array>} An array of data objects for the pie chart.
 */
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

/**
 * Checks if a subdirectory exists for the given folder.
 * @param {string} path - The base path.
 * @param {string} folderName - The name of the folder to check.
 * @returns {Promise<boolean>} True if the folder contains a subdirectory, false otherwise.
 */
async function hasSubdirectory(path, folderName) {
  const testPath = `${path}${folderName}/directory.json`;
  const subDir = await fetchJSON(testPath);
  return !!(subDir && subDir.files && subDir.files.some(f => f.endsWith(".yaml")));
}

/**
 * Generates gradient colors for pie chart segments.
 * @param {number} n - The number of segments.
 * @returns {Array} An array of gradient color objects.
 */
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

/**
 * Renders the breadcrumb navigation based on the current path.
 * @param {string} path - The current directory path.
 */
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
}

/**
 * Creates a breadcrumb button.
 * @param {string} text - The text to display.
 * @param {string} path - The path associated with the breadcrumb.
 * @param {boolean} isActive - Whether the breadcrumb is the active one.
 * @returns {HTMLElement} The breadcrumb button element.
 */
function createCrumb(text, path, isActive) {
  const crumb = document.createElement("button");
  crumb.className = `glass px-2 py-0.5 ${isActive ? "bg-blue-200 text-blue-900" : ""}`;
  crumb.innerText = text;
  crumb.onclick = () => renderPie(path);
  return crumb;
}

/**
 * Renders the pie chart for the given directory.
 * @param {string} path - The directory path.
 */
async function renderPie(path = "") {
  await renderBreadcrumb(path);
  const pieData = await getPieData(path);
  const chartDom = document.getElementById('main-pie');
  const myChart = echarts.init(chartDom);
  pieData.forEach((d, idx) => { d.itemStyle = { color: gradientColors(pieData.length)[idx] }; });
  myChart.setOption({
    tooltip: { show: true, formatter: param => `${param.data.name}: ${param.data.value}` },
    series: [{ type: 'pie', data: pieData }]
  });
}

window.onload = () => renderPie("");
