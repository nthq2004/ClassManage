import { Gauge } from './guage.js';
/*对外声明的类，构造时要传入画布ID，和处理函数，所有的仿真对象都包含在这个文件 */
export class SimulationEngine {
    constructor(containerId, onAction) {
        this.container = document.getElementById(containerId);
        /* 仿真对象都在画布上，根据这个画布创建舞台，添加图层，设备都在图层上， */
        this.stage = new Konva.Stage({
            container: containerId,
            width: this.container.offsetWidth,
            height: this.container.offsetHeight
        });
        this.layer = new Konva.Layer();
        this.stage.add(this.layer);
        /*这是设备操作的主处理逻辑函数，由main.js定义*/
        this.onAction = onAction;
        this.isLocked = false;
        /*这是设备对象数组，每个设备都是一个group，可根据id找到对应设备的group，devices[Pump]就获得Pump的group，可对group内的组件（圆形、矩形、线条）进行操作 */
        this.devices = {};
        /*构造函数里面，一般会调用初始化函数 */
        this.init();
    }

    init() {
        // 创建船舶柴油机冷却水系统组件
        this.createComp('Diesel', 50, 80, '#e67e22', '柴油机');
        // 功能控制组
        this.createActionBtn('Pipe', 220, 80, '#27ae60', '自动连管');

        const gauge = new Gauge({
            layer:this.layer,
            id: 'gaugePressure',
            name: '压力表',
            x: 180,
            y: 400,
            min: 0,
            max: 100,
            radius: 130
        })

        this.layer.draw();
        window.addEventListener('resize', () => this.fit());
    }

    /*每一个功能设备都是一个group，典型包括外壳、小组件、文字等，name属性用.查找，代表一类设备或一类属性，id属性用#查找，代表独一无二节点 */
    createComp(id, x, y, color, label) {
        const group = new Konva.Group({ x, y, id, name: 'device' });
        group.add(new Konva.Rect({ width: 150, height: 90, fill: color, stroke: '#fff', cornerRadius: 5 }));
        /*listening: false,不参与点击事件，Canvas不会进行命中检测 */
        group.add(new Konva.Text({ text: label, x: 10, y: 35, fill: '#fff', fontStyle: 'bold', listening: false }));
        const light = new Konva.Circle({ x: 135, y: 15, radius: 6, fill: 'red', name: 'status' });
        group.add(light);
        /*为组件定义点击处理函数，首先功能设备主要是启停，设置work属性，OFF表示停止，ON表示正在工作，点击后状态取反，存入newState,调用状态更新函数和用户定义的函数。状态更新函数是改变设备本身的显示状态。 */
        // 使用自定义点击检测
        group.on('click tap', (e) => {
            if (this.isLocked) return;
            // 阻止冒泡，防止多重触发
            e.cancelBubble = true;
            const newState = group.getAttr('work') === 'ON' ? 'OFF' : 'ON';
            this.updateState(id, newState);
            this.onAction(id, newState);
        });
        this.layer.add(group);
        /*有了以下指令，根据仿真系统对象，可根据id访问所有的设备group */
        this.devices[id] = group;
    }

    createActionBtn(id, x, y, color, label) {
        /*这些是功能按键，不是设备，没有device的name属性 */
        const btn = new Konva.Group({ x, y, id });
        btn.add(new Konva.Rect({ width: 130, height: 40, fill: color, cornerRadius: 20 }));
        btn.add(new Konva.Text({ text: label, x: 35, y: 14, fill: '#fff', listening: false }));
        btn.on('click tap', () => {
            if (this.isLocked) return;
            /*告诉main.js这个功能按键被点击了，完全交给外面处理 */
            this.onAction(id, 'TRIGGER');
        });
        this.layer.add(btn);
    }

    updateState(id, state) {
        const node = this.stage.findOne('#' + id);
        if (!node) return;
        /*点击后，更新该设备的状态 */
        node.setAttr('work', state);
        /*设备都有name属性为status的状态灯 */
        const light = node.findOne('.status');
        if (light) light.fill(state === 'ON' ? '#2ecc71' : 'red');
        this.layer.batchDraw();
    }

    fit() {
        const container = this.container;
        this.stage.width(container.offsetWidth);
        this.stage.height(container.offsetHeight);
    }
}