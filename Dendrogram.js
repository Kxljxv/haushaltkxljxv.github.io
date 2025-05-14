const DEBUG = {
    enabled: false,
    panel: null,
    log: function(message, data = null) {
        console.log(`[Debug] ${message}`, data);
        if (this.panel) {
            const line = document.createElement('div');
            line.textContent = `${new Date().toISOString().split('T')[1].split('.')[0]} - ${message}`;
            this.panel.insertBefore(line, this.panel.firstChild);
            if (this.panel.children.length > 50) this.panel.lastChild.remove();
        }
    },
    init: function() {
        this.panel = document.getElementById('debug-panel');
        document.getElementById('debug-toggle').onclick = () => {
            this.enabled = !this.enabled;
            this.panel.style.display = this.enabled ? 'block' : 'none';
        };
    }
};

const LABEL_PRIORITY = [
    "Titelbezeichnung",
    "Gruppenbezeichnung",
    "Obergruppenbezeichnung",
    "Kapitelbezeichnung",
    "Einzelplanbezeichnung",
    "Bereichsbezeichnung"
];

const MIN_NODE_SIZE = 8;
const MAX_NODE_SIZE = 30;

class TreeNode {
    constructor(data) {
        Object.assign(this, data);
        this.id = Math.random().toString(36).substr(2, 9);
        this._expanded = false;
        this._children = null;
        this.level = data.level || 0;
        this.globalValue = data.value || 0;
    }

    async expand() {
        DEBUG.log(`Expanding node: ${this.name} (${this.folderName}) at level ${this.level}`);
        if (!this.hasChildren) return;
        if (!this._children) {
            this._children = await this.loadChildren();
        }
        this._expanded = true;
    }

    calculateNodeSizes(sizeMode) {
        if (!this._children || this._children.length === 0) return;

        switch (sizeMode) {
            case 'global':
                this.calculateGlobalSizes();
                break;
            case 'layer':
                this.calculateLayerSizes();
                break;
            case 'local':
            default:
                this.calculateLocalSizes();
                break;
        }

        // Recursively calculate sizes for children
        this._children.forEach(child => {
            if (child._expanded) {
                child.calculateNodeSizes(sizeMode);
            }
        });
    }

    calculateLocalSizes() {
        if (!this._children) return;
        
        const values = this._children.map(n => Math.abs(n.value || 0));
        const maxVal = Math.max(...values);
        const minVal = Math.min(...values);
        
        this._children.forEach(node => {
            const value = Math.abs(node.value || 0);
            if (maxVal === minVal) {
                node.symbolSize = (MIN_NODE_SIZE + MAX_NODE_SIZE) / 2;
            } else {
                const scale = (value - minVal) / (maxVal - minVal);
                node.symbolSize = MIN_NODE_SIZE + scale * (MAX_NODE_SIZE - MIN_NODE_SIZE);
            }
        });
    }

    calculateGlobalSizes() {
        const allValues = [];
        this.collectAllValues(allValues);
        
        const maxVal = Math.max(...allValues);
        const minVal = Math.min(...allValues);
        
        this._children.forEach(node => {
            const value = Math.abs(node.value || 0);
            if (maxVal === minVal) {
                node.symbolSize = (MIN_NODE_SIZE + MAX_NODE_SIZE) / 2;
            } else {
                const scale = (value - minVal) / (maxVal - minVal);
                node.symbolSize = MIN_NODE_SIZE + scale * (MAX_NODE_SIZE - MIN_NODE_SIZE);
            }
        });
    }

    calculateLayerSizes() {
        // First, collect all values for each level across all open branches
        const layerValues = new Map(); // Map<level, Array<{value: number, node: TreeNode}>>
        this.collectLayerValues(layerValues);
    
        // For each level, calculate and set sizes
        layerValues.forEach((nodes, level) => {
            const values = nodes.map(n => Math.abs(n.value || 0));
            const maxVal = Math.max(...values);
            const minVal = Math.min(...values);
    
            nodes.forEach(({node}) => {
                const value = Math.abs(node.value || 0);
                if (maxVal === minVal) {
                    node.symbolSize = (MIN_NODE_SIZE + MAX_NODE_SIZE) / 2;
                } else {
                    const scale = (value - minVal) / (maxVal - minVal);
                    node.symbolSize = MIN_NODE_SIZE + scale * (MAX_NODE_SIZE - MIN_NODE_SIZE);
                }
            });
        });
    }


    collectLayerValues(layerValues) {
        if (!this._children) return;
    
        this._children.forEach(node => {
            if (!layerValues.has(node.level)) {
                layerValues.set(node.level, []);
            }
            // Only include nodes that don't have children or aren't expanded
            if (!node.hasChildren || !node._expanded) {
                layerValues.get(node.level).push({value: node.value, node: node});
            }
    
            // If the node is expanded, collect its children's values
            if (node._expanded) {
                node.collectLayerValues(layerValues);
            }
        });
    }

    setLayerNodeSizes(targetLevel, minVal, maxVal) {
        if (!this._children) return;

        this._children.forEach(node => {
            if (node.level === targetLevel) {
                const value = Math.abs(node.value || 0);
                if (maxVal === minVal) {
                    node.symbolSize = (MIN_NODE_SIZE + MAX_NODE_SIZE) / 2;
                } else {
                    const scale = (value - minVal) / (maxVal - minVal);
                    node.symbolSize = MIN_NODE_SIZE + scale * (MAX_NODE_SIZE - MIN_NODE_SIZE);
                }
            }

            if (node._expanded) {
                node.setLayerNodeSizes(targetLevel, minVal, maxVal);
            }
        });
    }

    collectAllValues(values) {
        if (this.value) {
            values.push(Math.abs(this.value));
        }
        if (this._children) {
            this._children.forEach(child => child.collectAllValues(values));
        }
    }

    collapse() {
        DEBUG.log(`Collapsing node: ${this.name} (${this.folderName}) at level ${this.level}`);
        this._expanded = false;
    }

    async loadChildren() {
        if (!this.hasChildren) return [];
        const path = this.fullPath;
        DEBUG.log(`Loading children for path: ${path} at level ${this.level}`);
        const children = await getChildren(path);
        return children.map(child => new TreeNode({
            ...child,
            level: this.level + 1
        }));
    }

    get children() {
        return this._expanded ? this._children : null;
    }

    toEChartsNode() {
        const node = {
            name: this.name,
            value: this.value,
            id: this.id,
            folderName: this.folderName,
            fullPath: this.fullPath,
            hasChildren: this.hasChildren,
            level: this.level,
            children: this.children?.map(child => child.toEChartsNode()),
            itemStyle: {
                color: this.hasChildren ? 
                    (this._expanded ? '#73c0de' : '#5470c6') : 
                    '#91cc75'
            }
        };

        if (!this.hasChildren || this.symbolSize) {
            node.symbolSize = this.symbolSize || MIN_NODE_SIZE;
        }

        return node;
    }
}

class DendrogramManager {
    constructor() {
        this.root = null;
        this.chart = null;
        this.currentPath = "";
        this.sizeMode = 'local'; // default to local sizing
        this.zoomLevel = 1;
    }

    async initialize() {
        DEBUG.log('Initializing DendrogramManager');
        this.root = new TreeNode({
            name: "Root",
            fullPath: "",
            hasChildren: true,
            folderName: "",
            level: 0,
            symbolSize: MIN_NODE_SIZE
        });
        
        this.setupControls();
        await this.root.expand();
        this.setupChart();
        this.updateNodeSizes();
        this.render();
    }

    setupControls() {
        // Zoom controls
        document.getElementById('zoom-in').onclick = () => this.zoom(1.2);
        document.getElementById('zoom-out').onclick = () => this.zoom(0.8);
        document.getElementById('zoom-reset').onclick = () => this.resetZoom();

        // Size mode selector
        document.getElementById('size-mode').onchange = (e) => {
            this.sizeMode = e.target.value;
            this.updateNodeSizes();
            this.render();
        };
    }

    zoom(factor) {
        this.zoomLevel *= factor;
        this.chart.setOption({
            series: [{
                zoom: this.zoomLevel
            }]
        });
    }

    resetZoom() {
        this.zoomLevel = 1;
        this.chart.setOption({
            series: [{
                zoom: 1
            }]
        });
    }

    updateNodeSizes() {
        if (this.root) {
            this.root.calculateNodeSizes(this.sizeMode);
        }
    }

    setupChart() {
        DEBUG.log('Setting up chart');
        const dom = document.getElementById('main-dendro');
        if (this.chart) {
            this.chart.dispose();
        }
        this.chart = echarts.init(dom);

        this.chart.on('click', async (params) => {
            DEBUG.log('Chart click event', {
                id: params.data.id,
                name: params.data.name,
                level: params.data.level
            });
            await this.handleNodeClick(params.data.id);
        });

        window.addEventListener('resize', () => this.chart.resize());
    }

    async handleNodeClick(nodeId) {
        const node = this.findNodeById(nodeId, this.root);
        if (!node) {
            DEBUG.log('Node not found', nodeId);
            return;
        }

        if (!node.hasChildren) {
            this.showModal(node);
            return;
        }

        if (node._expanded) {
            node.collapse();
        } else {
            await node.expand();
        }

        this.updateNodeSizes();
        this.render();
    }

    findNodeById(id, node) {
        if (node.id === id) return node;
        if (!node._children) return null;
        for (const child of node._children) {
            const found = this.findNodeById(id, child);
            if (found) return found;
        }
        return null;
    }

    showModal(node) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="glass p-6 max-w-lg w-full mx-4">
                <h2 class="text-xl font-bold mb-4">${node.name}</h2>
                <p class="mb-4">Betrag: ${node.value ? node.value.toLocaleString('de-DE') : "N/A"} €</p>
                <p class="mb-4 text-sm text-gray-600">Folder: ${node.folderName || 'N/A'}</p>
                <p class="mb-4 text-sm text-gray-600">Level: ${node.level}</p>
                <button class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Schließen</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('button').onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    }

    render() {
        DEBUG.log('Rendering chart');
        const option = {
            tooltip: {
                trigger: 'item',
                formatter: function (params) {
                    return `${params.data.name}<br/>Level: ${params.data.level}<br/>Betrag: ${params.data.value ? params.data.value.toLocaleString('de-DE') + ' €' : 'N/A'}`;
                }
            },
            series: [{
                type: 'tree',
                data: [this.root.toEChartsNode()],
                top: '2%',
                left: '2%',
                bottom: '2%',
                right: '20%',
                symbolSize: MIN_NODE_SIZE,
                orient: 'LR',
                label: {
                    position: 'left',
                    verticalAlign: 'middle',
                    align: 'right'
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
                expandAndCollapse: true,
                animationDuration: 400,
                animationEasingUpdate: 'quinticInOut',
                initialTreeDepth: -1,
                zoom: this.zoomLevel,
                roam: true
            }]
        };

        this.chart.setOption(option);
    }
}
async function fetchJSON(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to fetch ${path}`);
        return await response.json();
    } catch (error) {
        DEBUG.log(`Error fetching JSON: ${path}`, error);
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
        DEBUG.log(`Error fetching YAML: ${path}`, error);
        return null;
    }
}

function pickLabel(yamlObj) {
    for (const key of LABEL_PRIORITY) {
        if (yamlObj[key]) return yamlObj[key];
    }
    return "Unbenannt";
}

async function hasSubdirectory(path, folderName) {
    const testPath = `${path}${folderName}/directory.json`;
    DEBUG.log(`Checking for subdirectory: ${testPath}`);
    const subDir = await fetchJSON(testPath);
    const result = !!(subDir && subDir.files && subDir.files.some(f => f.endsWith(".yaml")));
    DEBUG.log(`Subdirectory check result: ${result}`);
    return result;
}

async function getChildren(path = "") {
    DEBUG.log(`Getting children for path: ${path}`);
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
                fullPath: path + folderName + '/',
                hasChildren: hasChildren
            });
        }
    }
    children.sort((a, b) => b.value - a.value);
    DEBUG.log(`Found ${children.length} children for path: ${path}`);
    return children;
}

// Initialize
window.onload = async function() {
    DEBUG.init();
    const manager = new DendrogramManager();
    await manager.initialize();
};
