// simulation.js
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
        this.devices = {};
        this.onAction = onAction;

        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        // 延迟处理以等待 CSS 旋转动画完成
        setTimeout(() => {
            this.stage.width(this.container.offsetWidth);
            this.stage.height(this.container.offsetHeight);
            this.layer.batchDraw();
        }, 300);
    }

    addPump(id, x, y) {
        const grp = new Konva.Group({ x, y, cursor: 'pointer' });
        const rect = new Konva.Rect({ width: 90, height: 50, fill: '#2c3e50', cornerRadius: 5 });
        const light = new Konva.Circle({ x: 20, y: 25, radius: 8, fill: 'red' });
        const txt = new Konva.Text({ text: id, x: 35, y: 20, fill: 'white', fontSize: 12 });

        grp.add(rect, light, txt);
        // 适配手机 tap 和 PC click
        grp.on('click tap', () => {
            const newState = this.devices[id].state === 'OFF' ? 'ON' : 'OFF';
            this.onAction(id, newState);
        });

        this.devices[id] = { grp, light, state: 'OFF' };
        this.layer.add(grp);
        this.layer.draw();
    }

    update(id, state) {
        const d = this.devices[id];
        if (d) {
            d.state = state;
            d.light.fill(state === 'ON' ? '#2ecc71' : 'red');
            this.layer.batchDraw();
        }
    }
}