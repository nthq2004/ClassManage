import { Gauge } from './guage.js';
import { DCPower } from './dcpower.js';
import { PressureTransmitter } from './pressuretrans.js';

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
        this.devLayer = new Konva.Layer();
        this.stage.add(this.devLayer);
        this.lineLayer = new Konva.Layer();
        this.stage.add(this.lineLayer);
        /*这是设备操作的主处理逻辑函数，由main.js定义*/
        this.onAction = onAction;
        this.isLocked = false;
        /*这是设备对象数组，每个设备都是一个group，可根据id找到对应设备的group，devices[Pump]就获得Pump的group，可对group内的组件（圆形、矩形、线条）进行操作 */
        this.devices = {};
        /*构造函数里面，一般会调用初始化函数 */
        this.selectedTerminal = null; // 当前选中的端子,用于连线操作。
        this.conns = []; // 存储所有连线对象的数组。
        this.init();
    }

    init() {

        //如果有组件移动，重绘所有连线
        this.devLayer.on('dragend', () => {
            this.reDrawConnections();
        });

        const aGauge = new Gauge({
            layer: this.devLayer,
            id: 'gaugeCurrent',
            name: '电流表mA',
            x: 180,
            y: 400,
            min: 0,
            max: 20,
            value: 10.6,
            radius: 70,
            type: 'aGauge',
            onTerminalClick: this.onTermClick.bind(this)
        })

        const pGauge = new Gauge({
            layer: this.devLayer,
            id: 'gaugePressure',
            name: '压力表bar',
            x: 280,
            y: 400,
            min: 0,
            max: 2,
            value: 3.6,
            radius: 70,
            type: 'pGauge',
            onTerminalClick: this.onTermClick.bind(this)
        })

        const myPower = new DCPower({
            layer: this.devLayer,
            id: 'dcPower',
            name: '直流电源24V',
            x: 50,
            y: 50,
            voltage: 24,
            onTerminalClick: this.onTermClick.bind(this)
        })

        const myTrans = new PressureTransmitter({
            layer: this.devLayer,
            id: 'pTr',
            name: '压力变送器',
            onTerminalClick: this.onTermClick.bind(this)
        });
        myTrans.update(1, 1.2);

        this.devLayer.draw();
    }

    onTermClick(termShape) {
        if (!termShape) return;
        // 首次选择
        if (!this.selectedTerminal) {
            this.selectedTerminal = termShape;
            termShape.stroke('#f1c40f');
            termShape.strokeWidth(4);
            this.devLayer.draw();
            return;
        }
        // 取消选择同一端子
        if (this.selectedTerminal === termShape) {
            this.selectedTerminal.stroke('#333');
            this.selectedTerminal.strokeWidth(2);
            this.selectedTerminal = null;
            this.devLayer.draw();
            return;
        }
        // 不同端子，若类型相同则建立连接
        if (this.selectedTerminal.getAttr('connType') === termShape.getAttr('connType')) {
            this.conns.push({
                from: this.selectedTerminal.getAttr('termId'),
                to: termShape.getAttr('termId'),
                type: termShape.getAttr('connType')
            });
            // 外部可通过 onAction 处理新连线事件（可选）
            this.onAction('conn', this.conns);
        }
        // 清除选择样式
        this.selectedTerminal.stroke('#333');
        this.selectedTerminal.strokeWidth(2);
        this.selectedTerminal = null;
        this.reDrawConnections();
        this.devLayer.draw();
    }
    /*每一个功能设备都是一个group，典型包括外壳、小组件、文字等，name属性用.查找，代表一类设备或一类属性，id属性用#查找，代表独一无二节点 */
    /*     createComp(id, x, y, color, label) {
            const light = new Konva.Circle({ x: 135, y: 15, radius: 6, fill: 'red', name: 'status' });
            //为组件定义点击处理函数，首先功能设备主要是启停，设置work属性，OFF表示停止，ON表示正在工作，点击后状态取反，存入newState,调用状态更新函数和用户定义的函数。状态更新函数是改变设备本身的显示状态。
            // 使用自定义点击检测
            group.on('click tap', (e) => {
                if (this.isLocked) return;
                // 阻止冒泡，防止多重触发
                e.cancelBubble = true;
                const newState = group.getAttr('work') === 'ON' ? 'OFF' : 'ON';
                this.updateState(id, newState);
                this.onAction(id, newState);
            });
            //有了以下指令，根据仿真系统对象，可根据id访问所有的设备group 
            this.devices[id] = group;
        } */

    /*     createActionBtn(id, x, y, color, label) {
            //这些是功能按键，不是设备，没有device的name属性 
            btn.add(new Konva.Text({ text: label, x: 35, y: 14, fill: '#fff', listening: false }));
            btn.on('click tap', () => {
                if (this.isLocked) return;
                //告诉main.js这个功能按键被点击了，完全交给外面处理 
                this.onAction(id, 'TRIGGER');
        } */

    updateState(id, state) {
        const node = this.stage.findOne('#' + id);
        if (!node) return;
        /*点击后，更新该设备的状态 */
        node.setAttr('work', state);
        /*设备都有name属性为status的状态灯 */
        const light = node.findOne('.status');
        if (light) light.fill(state === 'ON' ? '#2ecc71' : 'red');
        this.devLayer.batchDraw();
    }

    // 重绘所有连线
    reDrawConnections() {
        this.lineLayer.destroyChildren();// 清除现有连线
        this.conns.forEach(conn => {
            const fromTerm = this.stage.findOne('#' + conn.from);// 获取起始端子
            const toTerm = this.stage.findOne('#' + conn.to);// 获取终止端子
            if (fromTerm && toTerm) {  // 确保端子存在
                const fromPos = fromTerm.getAbsolutePosition(); // 获取端子在舞台上的绝对位置
                const toPos = toTerm.getAbsolutePosition(); // 获取端子在舞台上的绝对位置
                const line = new Konva.Line({  // 创建新连线
                    points: [fromPos.x, fromPos.y, toPos.x, toPos.y],  // 起点和终点坐标
                    stroke: conn.type === 'wire' ? '#e74c3c' : '#3498db', // 根据类型设置颜色
                    strokeWidth: conn.type === 'wire'?4:8, // 线宽
                    lineCap: conn.type === 'wire'?'round':'square', // 根据类型设置线帽样式
                    lineJoin: 'round'  // 连接处样式
                });
                this.lineLayer.add(line); // 添加连线到连线图层
            };
        });
        this.lineLayer.draw();// 重绘连线图层
    }
}