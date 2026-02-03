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

        //如果有组件移动，重绘所有连线，移动过程中就重绘
        this.devLayer.on('dragmove dragend', () => {
            this.reDrawConnections();
        });

        const aGauge = new Gauge({
            layer: this.devLayer,
            id: 'aGa',
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
        //把这个设备对象存到devices里，方便后续操作
        this.devices['aGauge'] = aGauge;

        const pGauge = new Gauge({
            layer: this.devLayer,
            id: 'pGa',
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
        this.devices['pGauge'] = pGauge;//把这个设备对象存到devices里，方便后续操作

        const myPower = new DCPower({
            layer: this.devLayer,
            id: 'dcP',
            name: '直流电源24V',
            x: 50,
            y: 50,
            voltage: 24,
            onTerminalClick: this.onTermClick.bind(this)
        })
        this.devices['dcPower'] = myPower;//把这个设备对象存到devices里，方便后续操作

        const myTrans = new PressureTransmitter({
            layer: this.devLayer,
            id: 'pTr',
            name: '压力变送器',
            onTerminalClick: this.onTermClick.bind(this)
        });
        this.devices['pTr'] = myTrans;//把这个设备对象存到devices里，方便后续操作


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


    checkCircuit() {
        // 在这里实现电路检查逻辑,可以遍历 this.conns 来检查连线是否正确，先过滤出所有wire类型的连线
        const wireConns = this.conns.filter(conn => conn.type === 'wire');
        // 从DC24V电源的正极开始，进行连接关系追踪，检查是否最终连接到了压力变送器的正极，压力变送器的负极是否连接到了电流表的正极，电流表的负极是否连接到了DC24V电源的负极。总共3个连接，如果都成立，则电路正确，如果有任何一个不成立，则电路错误。直流电源的电压必须大于等于20V，才算电路正确。fromTermId和toTermId分别是端子的ID,正反接线都要考虑。
        const checkConn = (fromTermId, toTermId, connections) => {
            return connections.some(conn => conn.from === fromTermId && conn.to === toTermId ||
                conn.from === toTermId && conn.to === fromTermId);
        }
        return (checkConn('dcP_term_p', 'pTr_term_p', wireConns) &&
            checkConn('pTr_term_n', 'aGa_term_p', wireConns) &&
            checkConn('aGa_term_n', 'dcP_term_n', wireConns) &&
            wireConns.length === 3 &&
            this.devices['dcPower'].getValue() >= 20)

    }

    updateState(devId, state) {
        const node = this.stage.findOne('#' + devId);
        if (!node) return;
        /*点击后，更新该设备的状态 */

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
                    stroke: conn.type === 'wire' ? (this.checkCircuit()?'#e74c3c':'#c9bebd') : '#3498db', // 根据类型设置颜色
                    strokeWidth: conn.type === 'wire' ? 4 : 8, // 线宽
                    lineCap: conn.type === 'wire' ? 'round' : 'square', // 根据类型设置线帽样式
                    lineJoin: 'round'  // 连接处样式
                });
                this.lineLayer.add(line); // 添加连线到连线图层
            };
        });
        this.lineLayer.draw();// 重绘连线图层
    }






}