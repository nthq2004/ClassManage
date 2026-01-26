export class SimulationEngine {
    constructor(containerId, onAction) {
        this.container = document.getElementById(containerId);
        this.stage = new Konva.Stage({
            container: containerId,
            width: this.container.offsetWidth,
            height: this.container.offsetHeight
        });
        this.layer = new Konva.Layer();
        this.stage.add(this.layer);
        this.onAction = onAction;
        this.isLocked = false;
        
        this.setupComponents();
        window.addEventListener('resize', () => this.fitStage());
    }

    fitStage() {
        this.stage.width(this.container.offsetWidth);
        this.stage.height(this.container.offsetHeight);
        this.layer.batchDraw();
    }

    setupComponents() {
        // 定义冷却系统核心组件
        this.drawDevice('Engine', 50, 50, '#e67e22', '柴油机');
        this.drawDevice('Pump', 50, 200, '#3498db', '水泵');
        this.drawDevice('Valve', 300, 200, '#9b59b6', '三通调节阀');
        this.drawDevice('Cooler', 300, 50, '#1abc9c', '淡水冷却器');
        this.layer.draw();
    }

    drawDevice(id, x, y, color, label) {
        const group = new Konva.Group({ x, y, id, draggable: true });
        group.add(new Konva.Rect({ width: 100, height: 60, fill: color, stroke: '#fff', cornerRadius: 5 }));
        group.add(new Konva.Text({ text: label, x: 5, y: 25, fill: 'white', fontSize: 12, fontStyle: 'bold' }));
        const light = new Konva.Circle({ x: 90, y: 10, radius: 5, fill: 'red', name: 'status' });
        group.add(light);

        group.on('click tap', () => {
            if (this.isLocked) return;
            const state = group.getAttr('work') === 'ON' ? 'OFF' : 'ON';
            this.updateDevice(id, state);
            this.onAction(id, state);
        });

        this.layer.add(group);
    }

    updateDevice(id, state) {
        const dev = this.stage.findOne('#' + id);
        if (dev) {
            dev.setAttr('work', state);
            dev.findOne('.status').fill(state === 'ON' ? '#2ecc71' : 'red');
            this.layer.batchDraw();
        }
    }
}