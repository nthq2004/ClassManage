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

        // 监听屏幕尺寸变化
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        setTimeout(() => {
            this.stage.width(this.container.offsetWidth);
            this.stage.height(this.container.offsetHeight);
            this.layer.batchDraw();
        }, 500);
    }

    addPump(id, x, y) {
        const grp = new Konva.Group({ x, y, cursor: 'pointer', listening: true });
        const rect = new Konva.Rect({ width: 90, height: 50, fill: '#2c3e50', cornerRadius: 5 });
        const light = new Konva.Circle({ x: 20, y: 25, radius: 8, fill: 'red' });
        const txt = new Konva.Text({ text: id, x: 35, y: 20, fill: 'white', fontSize: 12, listening: false });

        grp.add(rect, light, txt);
        
        // 核心修复：使用 tap 和 click 组合，但防止多次触发
        const handleEvent = (e) => {
            // 停止冒泡和浏览器默认行为（如缩放）
            if (e.evt) {
                e.cancelBubble = true;
                if (e.evt.cancelable) e.evt.preventDefault();
            }
            const newState = this.devices[id].state === 'OFF' ? 'ON' : 'OFF';
            this.onAction(id, newState);
        };

        // Konva 的 tap 专门针对触屏，click 针对鼠标
        grp.on('tap click', handleEvent);

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