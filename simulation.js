// simulation.js 修复版
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

        // 核心修复：确保容器在移动端可以接收事件
        this.stage.on('contentContextmenu', (e) => { e.evt.preventDefault(); }); 
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        setTimeout(() => {
            const container = document.getElementById('container'); // 重新获取宽高
            this.stage.width(container.offsetWidth);
            this.stage.height(container.offsetHeight);
            this.layer.batchDraw();
        }, 400); // 增加延迟，确保旋转动画彻底完成
    }

    addPump(id, x, y) {
        const grp = new Konva.Group({ x, y, cursor: 'pointer', listening: true }); // 显式开启监听
        const rect = new Konva.Rect({ width: 90, height: 50, fill: '#2c3e50', cornerRadius: 5 });
        const light = new Konva.Circle({ x: 20, y: 25, radius: 8, fill: 'red' });
        const txt = new Konva.Text({ text: id, x: 35, y: 20, fill: 'white', fontSize: 12, listening: false }); // 文字不响应事件，防止挡住点击

        grp.add(rect, light, txt);
        
        // 修复：针对移动端优化 tap 响应
        const trigger = (e) => {
            // 防止点击穿透或多次触发
            if (e.evt) e.evt.preventDefault();
            const newState = this.devices[id].state === 'OFF' ? 'ON' : 'OFF';
            this.onAction(id, newState);
        };

        grp.on('click tap', trigger);

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
