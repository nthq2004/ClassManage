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
        this.lastClick = 0;

        window.addEventListener('resize', () => {
            setTimeout(() => {
                this.stage.width(this.container.offsetWidth);
                this.stage.height(this.container.offsetHeight);
            }, 500);
        });
    }
    addPump(id, x, y) {
        const grp = new Konva.Group({ x, y, cursor: 'pointer', listening: true });
        grp.add(new Konva.Rect({ width: 90, height: 50, fill: '#34495e', cornerRadius: 5 }));
        const light = new Konva.Circle({ x: 20, y: 25, radius: 8, fill: '#e74c3c' });
        grp.add(light, new Konva.Text({ text: id, x: 35, y: 20, fill: 'white', fontSize: 12, listening: false }));

        const handle = (e) => {
            if (Date.now() - this.lastClick < 300) return;
            this.lastClick = Date.now();
            if (e.evt) e.evt.preventDefault();
            this.onAction(id, this.devices[id].state === 'OFF' ? 'ON' : 'OFF');
        };
        grp.on('tap click', handle);
        this.devices[id] = { light, state: 'OFF' };
        this.layer.add(grp);
        this.layer.draw();
    }
    update(id, state) {
        const d = this.devices[id];
        if (d) {
            d.state = state;
            d.light.fill(state === 'ON' ? '#2ecc71' : '#e74c3c');
            this.layer.batchDraw();
        }
    }
}