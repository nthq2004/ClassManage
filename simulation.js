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
        // 系统核心组件定义 (X, Y 坐标适配横屏视图)
        this.drawDevice('Engine', 50, 80, '#e67e22', '主机柴油机');
        this.drawDevice('Pump', 50, 250, '#3498db', '冷却水泵');
        this.drawDevice('Valve', 350, 250, '#9b59b6', '电动三通调节阀');
        this.drawDevice('Cooler', 350, 80, '#1abc9c', '淡水冷却器');
        this.drawDevice('PID', 600, 160, '#2c3e50', '数字PID调节器');
        this.layer.draw();
    }

    drawDevice(id, x, y, color, label) {
        const group = new Konva.Group({ x, y, id });
        group.add(new Konva.Rect({ width: 140, height: 80, fill: color, stroke: '#fff', strokeWidth: 2, cornerRadius: 8 }));
        group.add(new Konva.Text({ text: label, x: 10, y: 35, fill: 'white', fontSize: 13, fontStyle: 'bold', listening: false }));
        const light = new Konva.Circle({ x: 125, y: 15, radius: 7, fill: 'red', name: 'status' });
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