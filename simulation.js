import { Gauge } from './guage.js';  //下层设备对象依赖的类，比如仪表类
import { DCPower } from './dcpower.js'; //下层设备对象依赖的类，比如直流电源类
import { PressureTransmitter } from './pressuretrans.js'; //下层设备对象依赖的类，比如压力变送器类
import { TeeConnector } from './teeconn.js'; //下层设备对象依赖的类，比如T型管接头类
import { PressureRegulator } from './presreg.js'; //下层设备对象依赖的类，比如调压阀类
import { StopValve } from './stopvalve.js'; //截止阀 
import { AirBottle } from './airbottle.js'; //空气瓶
import { Multimeter } from './multimeter.js'; //万用表
import { AdjustableResistor } from './adjres.js'; //调节电阻
import { LeakDetector } from './leakdetect.js';


/*对外声明的类，构造时要传入画布ID，和处理函数，所有的仿真对象都包含在这个文件 */
export class SimulationEngine {
    //构造函数，传入画布容器ID和设备操作处理函数（上层传给本层系统的回调函数）。
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
        this.uiLayer = new Konva.Layer();
        this.stage.add(this.uiLayer);
        /*这是设备操作的主处理逻辑函数，由main.js定义*/
        this.onAction = onAction;
        this.locked = false; //仿真锁定状态，默认为false，表示可以操作。当教师端在演示模式下时，锁定学生端的操作权限，设置locked=true；当教师端在练习模式下，只有被选中的学生可以操作，其他学生locked=true；教师端自己在练习模式下locked=true，不能操作模型。
        /*这是设备对象数组，每个设备都是一个group，可根据id找到对应设备的group，devices[Pump]就获得Pump的group，可对group内的组件（圆形、矩形、线条）进行操作 */
        this.devices = {};
        this.conns = []; // 存储所有连线对象的数组。
        // 简单的历史快照，用于实现撤销/重做
        this._history = [];
        this._historyIndex = -1;
        this._historyMax = 100;

        this.pTransMax = 1.0; //默认压力变送器量程最大值1MPa
        this.pGaugeMax = 10; //默认压力表量程最大值10bar

        this.steps = []; // 演示步骤列表，每项包含 { msg: '步骤说明', act: () => { ... } }，act 是执行该步骤的函数
        this.workflow = []; //评估步骤列表，每项包括{ msg: '步骤说明', act: () => { ... } }，act 检查该步骤操作是否正确的函数。

        this.pressureMap = {}; //所有气路端子的压力视图，可确定气路的通断和气路设备的工作状态
        this.selectedTerminal = null; // 当前选中的端子,用于连线操作。
        this.isProcessing = false; // 关键：防死循环锁

        this.init();/*构造函数里面，一般会调用初始化函数 */
        // 启动物理仿真计时器（用于处理气瓶耗气等随时间变化的逻辑）
        this.startPhysicsTimer();
        // 初始快照
        this._recordSnapshot();
    }

    init() {
        //在画布左边生成两个工具箱，一个是设备工具箱，包括电源、变送器、执行器等，另一个是仿真工具箱，包括自动连线、自动连管、重置接线、单步仿真、撤销操作等功能按钮

        //如果有组件移动，重绘所有连线，移动过程中就重绘
        this.devLayer.on('dragmove dragend', () => {
            this.updateAllDevices();
        });
        //如何为设备自动生成id，如果是新建设备，可以用设备类型加上一个递增数字，比如dcPower_01,dcPower_02等，如果是从预设模板加载的设备，就用模板里定义的id。

        const aGauge = new Gauge({
            layer: this.devLayer,
            id: 'aGa',
            name: '电流表mA',
            min: 0,
            max: 20,
            type: 'aGauge',
            onTerminalClick: this.onTermClick.bind(this)
        })
        //把这个设备对象存到devices里，方便后续操作
        this.devices['aGa'] = aGauge;

        const pGauge = new Gauge({
            layer: this.devLayer,
            x: 480,
            y: 140,
            id: 'pGa',
            name: '压力表bar',
            min: 0,
            max: this.pGaugeMax || 10,
            type: 'pGauge',
            onTerminalClick: this.onTermClick.bind(this),
        })
        this.devices['pGa'] = pGauge;//把这个设备对象存到devices里，方便后续操作

        const myPower = new DCPower({
            layer: this.devLayer,
            id: 'dcP',
            name: '直流电源24V',
            onTerminalClick: this.onTermClick.bind(this),
            onStateChange: this.reportDevState.bind(this)
        })
        this.devices['dcP'] = myPower;//把这个设备对象存到devices里，方便后续操作

        const myTrans = new PressureTransmitter({
            layer: this.devLayer,
            id: 'pTr',
            name: '压力变送器',
            rangeMax: this.pTransMax || 1.0, // 量程最大值1MPa
            onTerminalClick: this.onTermClick.bind(this),
            onStateChange: this.reportDevState.bind(this)
        });
        this.devices['pTr'] = myTrans;//把这个设备对象存到devices里，方便后续操作

        const tConn = new TeeConnector({
            layer: this.devLayer,
            id: 'tCo',
            name: 'T型管接头',
            direction: 'left',
            onTerminalClick: this.onTermClick.bind(this),
        });
        this.devices['tCo'] = tConn;//把这个设备对象存到devices里，方便后续操作 

        const pReg = new PressureRegulator({
            layer: this.devLayer,
            id: 'pRe',
            name: '调压阀',
            onTerminalClick: this.onTermClick.bind(this),
            onStateChange: this.reportDevState.bind(this),
        });
        this.devices['pRe'] = pReg;//把这个设备对象存到devices里，方便后续操作  

        const stValve = new StopValve({
            layer: this.devLayer,
            id: 'stV',
            name: '截止阀',
            onTerminalClick: this.onTermClick.bind(this),
            onStateChange: this.reportDevState.bind(this),
        });
        this.devices['stV'] = stValve;//

        const caBot = new AirBottle({
            layer: this.devLayer,
            id: 'caB',
            name: '压缩空气瓶',
            onTerminalClick: this.onTermClick.bind(this),
        });
        this.devices['caB'] = caBot;

        const mulMeter = new Multimeter({
            layer: this.devLayer,
            id: 'muM',
            name: '万用表',
            onTerminalClick: this.onTermClick.bind(this),
            onStateChange: this.reportDevState.bind(this),
        });
        this.devices['muM'] = mulMeter;

        const adjRes = new AdjustableResistor({
            layer: this.devLayer,
            id: 'pRr',
            name: '调节电阻',
            onTerminalClick: this.onTermClick.bind(this),
            onStateChange: this.reportDevState.bind(this),
        });
        this.devices['pRr'] = adjRes;

        const leakD = new LeakDetector({
            layer: this.devLayer,
            id: 'leD',
            name: '泄漏检测器',
            getTerminals: this.getPipeTerminals.bind(this),
        });
        this.devices['leD'] = leakD;
        //topInfo显示当前步骤说明，在仿真操作演示过程中，根据预设的步骤列表，依次更新topInfo的文本内容，引导用户完成实验操作。最后一步是实验完成，提示用户3秒后关闭信息框。关闭函数隐藏topInfo，并清空文本内容。
        this._bindRepairLogic();    //绑定演示步骤和评估步骤的逻辑函数，定义在后面，主要是设置步骤列表和实现showTopInfo函数。
        this.topInfo = new Konva.Text({
            id: 'topInfo',
            x: 300,
            y: 20,
            text: '',
            fontSize: 24,
            fontStyle: 'bold',
            fill: '#e74c3c',
            shadowColor: '#e74c3c',
            shadowBlur: 10,
            shadowOpacity: 0.8,
        });
        this.uiLayer.add(this.topInfo);
        this.stepIdx = 0; // 演示步骤索引
        this.showTopInfo = (msg) => {
            this.topInfo.text(msg);
            this.uiLayer.draw();
        };
        this.steps = [
            { msg: "1. 24V电源(+) -> 负载电阻(+)", act: () => this.addConnectionAnimated({ from: 'dcP_wire_p', to: 'pRr_wire_p', type: 'wire' }) },
            { msg: "2. 负载电阻(-)-> 压力变送器(+)", act: () => this.addConnectionAnimated({ from: 'pRr_wire_n', to: 'pTr_wire_p', type: 'wire' }) },
            { msg: "3.  压力变送器(-) -> 电流表(+)", act: () => this.addConnectionAnimated({ from: 'pTr_wire_n', to: 'aGa_wire_p', type: 'wire' }) },
            { msg: "4. 电流表(-) -> 24V电源(-)", act: () => this.addConnectionAnimated({ from: 'aGa_wire_n', to: 'dcP_wire_n', type: 'wire' }) },
            { msg: "5. 空气瓶出口 -> 截止阀右端", act: () => this.addConnectionAnimated({ from: 'caB_pipe_o', to: 'stV_pipe_o', type: 'pipe' }) },
            { msg: "6. 截止阀左端 -> 调节阀入口", act: () => this.addConnectionAnimated({ from: 'stV_pipe_i', to: 'pRe_pipe_i', type: 'pipe' }) },
            { msg: "7. 调节阀出口 -> T型管下端", act: () => this.addConnectionAnimated({ from: 'pRe_pipe_o', to: 'tCo_pipe_l', type: 'pipe' }) },
            { msg: "8. T型管上端 -> 压力表", act: () => this.addConnectionAnimated({ from: 'tCo_pipe_r', to: 'pGa_pipe_i', type: 'pipe' }) },
            { msg: "9. T型管左端 -> 压力变送器气压口", act: () => this.addConnectionAnimated({ from: 'tCo_pipe_u', to: 'pTr_pipe_i', type: 'pipe' }) },
            { msg: "10. 按下24V电源键,接通电源", act: async () => { await this.sleep(2000); this.devices['dcP'].setValue(true, 24); } },
            { msg: "11. 合上截止阀,变送器气压为0,电流应为4mA.", act: async () => { await this.sleep(2000); this.devices['stV'].setValue(true); this.devices['pRe'].setPressure = 0; this.devices['pRe'].update(); this.updateAllDevices(); } },
            { msg: `12. 将压力调节到${0.25 * this.pTransMax}MPa,变送器电流应为8mA.`, act: async () => { await this.sleep(2000); this.devices['pRe'].setPressure = 2.5 * this.pTransMax; this.devices['pRe'].update(); this.updateAllDevices(); } },
            { msg: `13. 将压力调节到${0.5 * this.pTransMax}MPa,变送器电流应为12mA.`, act: async () => { await this.sleep(2000); this.devices['pRe'].setPressure = 5 * this.pTransMax; this.devices['pRe'].update(); this.updateAllDevices(); } },
            { msg: `14. 将压力调节到${0.75 * this.pTransMax}MPa,变送器电流应为16mA.`, act: async () => { await this.sleep(2000); this.devices['pRe'].setPressure = 7.5 * this.pTransMax; this.devices['pRe'].update(); this.updateAllDevices(); } },
            { msg: `15. 将压力调节到${this.pTransMax}MPa,变送器电流应为20mA.`, act: async () => { await this.sleep(2000); this.devices['pRe'].setPressure = 10 * this.pTransMax; this.devices['pRe'].update(); this.updateAllDevices(); } },
            { msg: "演示完成,延时3s关闭此信息框.", act: () => setTimeout(() => this.topInfo.hide(), 3000) },
        ];
        this.uiLayer.draw();
        this.devLayer.draw();
    }
    //物理计时器，处理随时间变化的属性。
    startPhysicsTimer() {
        const anim = new Konva.Animation((frame) => {
            if (!frame) return;
            // 检查空气瓶是否需要耗气
            const bottle = this.devices['caB'];
            if (bottle && bottle.isConsuming) {
                // 内部仅减小数值，不触发 updateAllDevices
                // 物理数值的变动会在下一帧通过 updateAllDevices 渲染
                this.updateAllDevices();
            }
        }, this.deviceLayer);

        anim.start();
    }
    // 记录当前快照（conns 和设备关键状态），作为历史栈的一项
    _recordSnapshot() {
        try {
            const connsCopy = JSON.parse(JSON.stringify(this.conns));
            const devStates = {};
            Object.entries(this.devices).forEach(([id, dev]) => {
                devStates[id] = {     //记录设备的参数，这是参数变化是由于用户操作引起的，回放时直接覆盖当前状态即可。
                    isOn: dev.isOn ?? null,
                    voltage: dev.voltage ?? null,  //电源有开关和电压两个参数
                    zeroAdj: dev.zeroAdj ?? null,
                    spanAdj: dev.spanAdj ?? null,  //变送器有零点和量程两个参数
                    isOpen: dev.isOpen ?? null,  //截止阀有开关参数
                    setPressure: dev.setPressure ?? null,  //调压阀有设定压力参数
                };
            });
            const snap = { conns: connsCopy, devStates };
            // 截断前向历史，此次操作后，当前历史索引之后的历史都无效了，所以要删除掉，然后把新快照添加到历史栈中，并更新索引。
            this._history.splice(this._historyIndex + 1);
            this._history.push(snap);
            if (this._history.length > this._historyMax) this._history.shift(); // 超出最大历史长度，删除最旧的一项
            this._historyIndex = this._history.length - 1; // 更新索引到最新

        } catch (e) {
            console.warn('记录快照失败', e);
        }
    }
    // 应用历史快照到当前仿真
    _applySnapshot(index) {
        if (index < 0 || index >= this._history.length) return;
        const snap = this._history[index];
        try {
            this.conns = JSON.parse(JSON.stringify(snap.conns));
            Object.entries(snap.devStates).forEach(([id, state]) => {
                const dev = this.devices[id];
                if (!dev) return;
                if (state.isOn !== null) dev.isOn = state.isOn;
                if (state.voltage !== null) dev.voltage = state.voltage;  //电源状态覆盖
                if (state.zeroAdj !== null) dev.zeroAdj = state.zeroAdj;
                if (state.spanAdj !== null) dev.spanAdj = state.spanAdj; //变送器状态覆盖
                if (state.isOpen !== null) dev.isOpen = state.isOpen;   //截止阀状态覆盖
                if (state.setPressure !== null) dev.setPressure = state.setPressure;    //调压阀状态覆盖

                if (dev.update) dev.update(); //参数覆盖后，调用设备的update方法，让设备根据新状态刷新显示和输出。
            });
            this.updateAllDevices();
        } catch (e) {
            console.warn('应用快照失败', e);
        }
    }
    // engine对象的延时函数，返回一个Promise，在需要等待的地方可以用await engine.sleep(ms)来调用，实现异步等待效果，避免使用setTimeout导致的回调地狱。
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    //端口点击处理函数，用于实现端口连线功能，是本层传给下层设备对象的回调函数。
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
            const [normFrom, normTo] = [this.selectedTerminal.getAttr('termId'), termShape.getAttr('termId')].sort();
            const exists = this.conns.some(c => c.from === normFrom && c.to === normTo);
            if (!exists) {
                this.conns.push({
                    from: normFrom,
                    to: normTo,
                    type: termShape.getAttr('connType')
                });
                this.onAction('conns', this.conns); // 通知上层有新连接
                this._recordSnapshot();
            }
            //如果是气路端子，只允许连接一次，连接后禁用端子点击事件
            if (termShape.getAttr('connType') === 'pipe') {
                termShape.off('mousedown touchstart');
                this.selectedTerminal.off('mousedown touchstart');
            }
        }
        // 清除选择样式
        this.selectedTerminal.stroke('#333');
        this.selectedTerminal.strokeWidth(2);
        this.selectedTerminal = null;

        this.updateAllDevices();
        this.devLayer.draw();
    }

    /**
     * 核心仿真函数：每当开关、档位或连线变化时调用，计算电路的连通性和电位分布，并更新设备状态。主要步骤：
 * 1. 初始化：收集所有电气端子，建立初始电位映射。
 * 2. 构建初始集群：根据物理导线连接关系，将端子分成若干集群。
 * 3. 动态合并：处理开关及“导通型”设备，将它们连接的集群合并。
 * 4. 路径完整性判定：检查电源正负极是否通过变送器和电阻构成闭合回路。
 * 5. 电位计算：如果路径完整，注入电源电位，并根据变送器和电阻的关系计算各端子电位。
 * 6. 更新设备状态：根据端子电位更新变送器、电流表等设备的显示值和工作状态。
     */
    updateCircuitSimulation() {
        const wireConns = this.conns.filter(c => c.type === 'wire');
        this.allTerminalIds = new Set(); // 收集所有电气端子ID
        this.eDevices = {}; // 收集所有电气设备对象，key是设备ID，value是设备对象
        const terminals = {};

        // 1. 初始化：所有端点电位清零
        Object.values(this.devices).forEach(device => {
            // 遍历设备内部定义的 terminals 数组
            if (device.terminals && Array.isArray(device.terminals)) {
                device.terminals.forEach(terminal => {
                    // 仅初始化气路端口
                    if (terminal.getAttr('connType') === 'wire') {
                        // terminal.termId 应该是类似 "acB_pipe_i" 的完整 ID
                        this.allTerminalIds.add(terminal.getAttr('termId')); // 收集所有端子ID
                        this.eDevices[terminal.getAttr('parentId')] = device; // 收集所有电气设备)
                        terminals[terminal.getAttr('termId')] = 0;
                    }
                });
            }
        });
        const psu = this.eDevices['dcP'];
        const pTr = this.eDevices['pTr'];
        const pRr = this.eDevices['pRr'];
        // const aGa = this.eDevices['aGa'];

        // 2. 构建初始集群（物理导线）
        let clusters = this._getElectricalClusters(wireConns);

        // 3. 动态合并：处理开关及“导通型”设备
        this._bridgeZeroResistanceDevices(clusters);

        // 如果电源没开，直接更新状态并退出
        if (!psu || !psu.isOn) {
            this._applyVoltageToDevices(terminals, clusters, 0, false);
            return terminals;
        }

        // 4. 定义关键节点索引
        const getRoot = (id) => clusters.findIndex(c => c.has(id));
        const posRoot = getRoot('dcP_wire_p');
        const negRoot = getRoot('dcP_wire_n');
        const pTr_pRoot = getRoot('pTr_wire_p');
        const pTr_nRoot = getRoot('pTr_wire_n');
        const res_pRoot = getRoot('pRr_wire_p');
        const res_nRoot = getRoot('pRr_wire_n');

        // 5. 路径完整性判定 (Path Trace)
        // 判定电源正负极是否通过 [电阻] 和 [变送器] 构成了闭合回路
        let isPathComplete = false;
        if (posRoot !== -1 && negRoot !== -1) {
            // 判定变送器P端是否可达正极 (直接连或通过电阻连)
            const pTrP_to_Pos = (pTr_pRoot === posRoot) ||
                (pTr_pRoot === res_pRoot && res_nRoot === posRoot) ||
                (pTr_pRoot === res_nRoot && res_pRoot === posRoot);

            // 判定变送器N端是否可达负极 (直接连或通过电阻连)
            const pTrN_to_Neg = (pTr_nRoot === negRoot) ||
                (pTr_nRoot === res_pRoot && res_nRoot === negRoot) ||
                (pTr_nRoot === res_nRoot && res_pRoot === negRoot);

            if (pTrP_to_Pos && pTrN_to_Neg) isPathComplete = true;
        }
        // 2. 物理有效性检查：负载必须两端都接线且不在同一个集群内（未被短路）
        const isPTrConnected = (pTr_pRoot !== -1 && pTr_nRoot !== -1 && pTr_pRoot !== pTr_nRoot);
        const isPRrConnected = (res_pRoot !== -1 && res_nRoot !== -1 && res_pRoot !== res_nRoot);

        // 3. 重新判定主回路连通性 (串联逻辑)
        // 只有当变送器和电阻都“双端接入”且首尾相连通往电源正负时，路径才真正完整
        let realPathComplete = isPathComplete && isPTrConnected && isPRrConnected;
        // 如果变送器内部断线或电源正端断线，则回路不能导通
        if (pTr && pTr.isBroken) realPathComplete = false;
        if (this._break && this._break.type === 'dcP_p') realPathComplete = false;
        this.connected = realPathComplete; // 更新主回路连通状态，供设备更新时参考

        const V_MAX = psu.getValue();
        // 注入电源电位
        // 如果存在电源输出断线故障，则 dcP_wire_p 输出为 0
        if (this._break && this._break.type === 'dcP_p') {
            this._setClusterVoltage(clusters, terminals, 'dcP_wire_p', 0);
        } else {
            this._setClusterVoltage(clusters, terminals, 'dcP_wire_p', V_MAX);
        }
        this._setClusterVoltage(clusters, terminals, 'dcP_wire_n', 0);

        // 特殊情况：若变送器内部断线（回路不导通），电流为 0，但电压应仍可通过导线/电阻到达各端口。
        // 此时不进行电压降扩散计算，而是将变送器与电阻两端的集群电位设置为电源正/负电位（无电压降）。
        if (pTr && pTr.isBroken) {
            // 将变送器正端与电阻正端视为与电源正端同一电位
            this._setClusterVoltage(clusters, terminals, 'pTr_wire_p', V_MAX);
            this._setClusterVoltage(clusters, terminals, 'pRr_wire_p', V_MAX);
            // 将变送器负端与电阻负端视为与电源负端同一电位
            this._setClusterVoltage(clusters, terminals, 'pTr_wire_n', 0);
            this._setClusterVoltage(clusters, terminals, 'pRr_wire_n', V_MAX);
            // 确保后续不会将变送器标记为有电流
        }

        // 6. 电位计算 (电压降扩散)
        let currentA = 0;
        if (realPathComplete) {
            pTr.setPower(true); // 变送器有电了，设置功率为1，表示正常工作状态
            // aGa.setPower(true); // 电流表有电了，设置功率为1，表示正常工作状态

            currentA = pTr.getValue(); // 从变送器读取当前实时电流 (4-20A)
            const vRes = currentA * pRr.getValue() / 1000; // 计算电阻压降


            // 多轮扩散以处理不同位置的电阻
            for (let i = 0; i < 5; i++) {
                // 处理电阻压降逻辑
                if (res_pRoot !== -1 && res_nRoot !== -1) {
                    if (terminals['pRr_wire_p'] > 0 && terminals['pRr_wire_n'] === 0) {
                        this._setClusterVoltage(clusters, terminals, 'pRr_wire_n', terminals['pRr_wire_p'] - vRes);
                    } else if (terminals['pRr_wire_n'] > 0 && terminals['pRr_wire_p'] === 0) {
                        this._setClusterVoltage(clusters, terminals, 'pRr_wire_p', terminals['pRr_wire_n'] - vRes);
                    }
                }
                // 处理变送器电位
                if (pTr_pRoot !== -1 && pTr_nRoot !== -1) {
                    // 如果N端连接了电阻的非负极侧，则N端电位为vRes，否则为0
                    const nIsNearRes = (pTr_nRoot === res_pRoot || pTr_nRoot === res_nRoot);
                    const resIsAtNeg = (res_pRoot === negRoot || res_nRoot === negRoot);
                    if (nIsNearRes && resIsAtNeg) {
                        this._setClusterVoltage(clusters, terminals, 'pTr_wire_n', vRes);
                    }
                }
            }
        }
        // 7. 更新设备显示
        this._applyVoltageToDevices(terminals, clusters, currentA, realPathComplete);
        return terminals;
    }
    /**
     * 辅助A：生成初始物理连接集群
     */
    _getElectricalClusters(wireConns) {
        const parent = {};
        const find = (i) => {
            if (parent[i] === undefined) return (parent[i] = i);
            return parent[i] === i ? i : (parent[i] = find(parent[i]));
        };
        const union = (i, j) => {
            const rootI = find(i), rootJ = find(j);
            if (rootI !== rootJ) parent[rootI] = rootJ;
        };

        wireConns.forEach(c => union(c.from, c.to));

        const clusterMap = {};
        Object.keys(parent).forEach(id => {
            const root = find(id);
            if (!clusterMap[root]) clusterMap[root] = new Set();
            clusterMap[root].add(id);
        });
        return Object.values(clusterMap);
    }
    /**
     * 辅助B：合并零电阻设备：导线、电流表、mA档、闭合的开关
     */
    _bridgeZeroResistanceDevices(clusters) {
        const bridge = (id1, id2) => {
            const i1 = clusters.findIndex(c => c.has(id1));
            const i2 = clusters.findIndex(c => c.has(id2));
            if (i1 !== -1 && i2 !== -1 && i1 !== i2) {
                clusters[i1].forEach(id => clusters[i2].add(id));
                clusters.splice(i1, 1);
            }
        };

        Object.values(this.eDevices).forEach(dev => {
            const id = dev.group.id();
            // 开关逻辑：只有不处于 isOpen 状态时才桥接
            if (id === 'swI' && !dev.isOpen) bridge('swI_wire_1', 'swI_wire_2');

            // 电流表和万用表mA档逻辑
            if (id === 'aGa') bridge('aGa_wire_p', 'aGa_wire_n');
            if (id === 'muM' && dev.mode === 'MA') bridge('muM_wire_ma', 'muM_wire_com');
        });
    }
    /**
     * 辅助 C：设置集群电位
     */
    _setClusterVoltage(clusters, terminals, termId, volt) {
        const cluster = clusters.find(c => c.has(termId));
        if (cluster) {
            cluster.forEach(id => terminals[id] = volt);
        } else {
            terminals[termId] = volt;
        }
    }
    /**
     * 辅助D：更新设备状态及显示读数
     */
    _applyVoltageToDevices(terminals, clusters, currentA, realPathComplete) {

        const getRoot = (id) => clusters.findIndex(c => c.has(id));

        // 获取所有负载的端子根索引
        const posRoot = getRoot('dcP_wire_p');
        const negRoot = getRoot('dcP_wire_n');

        const pTr_p = getRoot('pTr_wire_p');
        const pTr_n = getRoot('pTr_wire_n');
        const pRr_p = getRoot('pRr_wire_p');
        const pRr_n = getRoot('pRr_wire_n');

        //   只要电路完整，我们需要识别出构成闭合回路的所有集群根索引
        const activeClusterIndices = new Set();
        // const isPTrConnected = (pTr_p !== -1 && pTr_n !== -1 && pTr_p !== pTr_n);
        const isPRrConnected = (pRr_p !== -1 && pRr_n !== -1 && pRr_p !== pRr_n);

        if (realPathComplete) {
            activeClusterIndices.add(posRoot);
            activeClusterIndices.add(negRoot);

            // 将这些负载的端子所属的集群全部标记为“活跃”
            [pTr_p, pTr_n, pRr_p, pRr_n].forEach(idx => {
                if (idx !== -1) activeClusterIndices.add(idx);
            });
        }

        Object.values(this.eDevices).forEach(dev => {
            const devId = dev.group.id();
            if (devId === 'dcP') return;

            // 获取设备两端的集群根
            const pTerm = (devId === 'muM') ?
                (dev.mode === 'MA' ? 'muM_wire_ma' : 'muM_wire_v') : `${devId}_wire_p`;
            const nTerm = (devId === 'muM') ? 'muM_wire_com' : `${devId}_wire_n`;

            const pRoot = clusters.findIndex(c => c.has(pTerm));
            const nRoot = clusters.findIndex(c => c.has(nTerm));

            // --- 判定逻辑修正 ---
            // 只要设备所属的集群在“活跃集群集合”中，说明它就在电流通路上
            // 设备要显示电流，前提是：1.整体回路闭合 2.设备的两端都在活跃路径集群中
            const inActivePath = realPathComplete && (pRoot !== -1 && nRoot !== -1) &&
                (activeClusterIndices.has(pRoot) && activeClusterIndices.has(nRoot));

            if (devId === 'aGa' || (devId === 'muM' && dev.mode === 'MA')) {
                dev.setPower(inActivePath);
                const val = inActivePath ? currentA : 0;
                devId === 'aGa' ? dev.setValue(val) : dev.setInputValue(val);
            }

            if (devId === 'pTr') {
                dev.setPower(realPathComplete);
                dev.update();
            }
            // --- 万用表电阻档 (RES) ---
            if (devId === 'muM' && dev.mode === 'RES') {
                const vM = clusters.findIndex(c => c.has('muM_wire_v'));
                const cM = clusters.findIndex(c => c.has('muM_wire_com'));
                // 只有当表笔精准对接电阻两端（且电阻两端没被连在一起短路）时才有读数

                if (vM !== -1 && cM !== -1 && vM === cM ) {
                    // 1. 同一集群：说明通过导线或闭合开关直接连通
                    dev.setInputValue(0); // 显示接近0的数值

                } else {
                    const isMeasuringRes = isPRrConnected && (
                        (vM === pRr_p && cM === pRr_n) || (vM === pRr_n && cM === pRr_p)
                    );
                    dev.setInputValue(!inActivePath ? (isMeasuringRes ? this.devices['pRr'].getValue() : 10000000000) : 10000000000); // 如果在测量电阻且路径有效，显示电阻值，否则显示无穷大（10GΩ）
                }

            }
            if (devId === 'muM' && dev.mode === 'DCV') {
                const vTerm = 'muM_wire_v';
                const cTerm = 'muM_wire_com';

                // 获取两个表笔所属的集群索引
                const vRoot = clusters.findIndex(c => c.has(vTerm));
                const cRoot = clusters.findIndex(c => c.has(cTerm));

                // 严谨判定：
                // 只有当两个表笔都接在了“已定义”的电路节点上（即在 clusters 中）时，才显示电压
                // 如果任何一个端子没接线，它的 root 会是 -1，此时 isValid 为 false
                const isValid = (vRoot !== -1 && cRoot !== -1);

                if (isValid) {
                    const voltageDiff = terminals[vTerm] - terminals[cTerm];
                    dev.setInputValue(voltageDiff);
                } else {
                    // 只要有一根表笔悬空，读数立刻归零
                    dev.setInputValue(0);
                }
            }
            // --- 万用表蜂鸣器档 (BEEP) ---
            if (devId === 'muM' && dev.mode === 'BEEP') {
                const vM = clusters.findIndex(c => c.has('muM_wire_v'));
                const cM = clusters.findIndex(c => c.has('muM_wire_com'));

                // 只有在断电情况下测量才有意义 (模拟真实保护逻辑)
                const isPowerOff = this.devices['dcP'] && !this.devices['dcP'].isOn;

                if (vM !== -1 && cM !== -1 && vM === cM) {
                    // 1. 同一集群：说明通过导线或闭合开关直接连通
                    dev.setInputValue(0); // 显示接近0的数值
                    if (isPowerOff) dev.triggerBeep(true);
                } else {
                    // 2. 不同集群或悬空：不响
                    dev.setInputValue(10000000000);
                    dev.triggerBeep(false);
                }
            }
        });
    }


    /** 通用气路拓扑计算逻辑 */
    computeTermPress() {
        // 1. 初始化所有端子的压力为 0
        const terminalPressures = {};
        const queue = [];

        Object.values(this.devices).forEach(device => {
            // 遍历设备内部定义的 terminals 数组
            if (device.terminals && Array.isArray(device.terminals)) {
                device.terminals.forEach(terminal => {
                    // 仅初始化气路端口
                    if (terminal.getAttr('connType') === 'pipe') {
                        // terminal.termId 应该是类似 "acB_pipe_i" 的完整 ID
                        terminalPressures[terminal.getAttr('termId')] = 0;
                    }
                });
            }
        });

        // 2. 识别所有气源 (例如空气瓶)
        Object.values(this.devices).forEach(device => {
            if (device.type === 'airBottle') {
                const outPortId = `${device.group.id()}_pipe_o`;
                terminalPressures[outPortId] = device.pressure;
                queue.push(outPortId); // 将气源出口加入扩散队列
            }
        });

        // 3. 广度优先搜索 (BFS) 传播压力
        const visited = new Set();
        while (queue.length > 0) {
            const currentPortId = queue.shift();
            if (visited.has(currentPortId)) continue;
            visited.add(currentPortId);

            const currentPressure = terminalPressures[currentPortId];

            // 查找所有连接到当前端口的连线
            this.conns.forEach(conn => {
                if (conn.type !== 'pipe') return;

                let nextPortId = null;
                if (conn.from === currentPortId) nextPortId = conn.to;
                else if (conn.to === currentPortId) nextPortId = conn.from;

                if (nextPortId) {
                    // 压力通过管路平传
                    terminalPressures[nextPortId] = currentPressure;

                    // 如果该端口被标记为泄漏，则实际输入压力随机降低 10% ~ 30%
                    try {
                        const termNode = this.stage.findOne('#' + nextPortId);
                        if (termNode && termNode.getAttr && termNode.getAttr('isLeaking')) {
                            const lossRatio = 0.1 + Math.random() * 0.2; // 0.1 ~ 0.3
                            terminalPressures[nextPortId] = Math.max(0, currentPressure * (1 - lossRatio));
                        }
                    } catch (e) {
                        /* ignore */
                    }

                    // 查找该端口所属的设备，处理内部逻辑转换
                    const deviceId = nextPortId.split('_pipe_')[0];
                    const device = this.devices[deviceId];

                    if (device) {
                        this._processDevicePress(device, nextPortId, terminalPressures, queue);
                    }
                }
            });
        }
        return terminalPressures;
    }
    /**处理压力在设备内部的传递 */
    _processDevicePress(device, inputPortId, terminalPressures, queue) {
        const currentP = terminalPressures[inputPortId];
        switch (device.type) {
            case 'teeConnector': // 三通处理
                // 三通有三个口：_pipe_l, _pipe_u, _pipe_r
                ['l', 'u', 'r'].forEach(suffix => {
                    const portId = `${device.group.id()}_pipe_${suffix}`;
                    if (portId !== inputPortId) {
                        terminalPressures[portId] = currentP;
                        queue.push(portId);
                    }
                });
                break;
            case 'stopValve': // 截止阀
                if (device.isOpen) {
                    const otherPort = inputPortId.includes('_i') ? '_o' : '_i';
                    const outId = `${device.group.id()}_pipe${otherPort}`;
                    terminalPressures[outId] = currentP;
                    queue.push(outId);
                }
                break;
            case 'regulator': // 减压阀
                if (inputPortId.includes('_i')) {
                    const outId = `${device.group.id()}_pipe_o`;
                    // 减压阀计算逻辑
                    device.outputPressure = Math.min(currentP, device.setPressure);
                    terminalPressures[outId] = device.outputPressure;
                    queue.push(outId);
                }
                break;
            case 'pGauge': // 压力表/变送器 (末端设备)
                // device.update(currentP); // 直接更新显示
                break;
        }
    }
    // 设备状态变化上报处理函数,例如电源开关状态变化,变送器输入压力变化等,也可以调用上层设备逻辑函数onAction，让main.js处理
    //编写remOperation函数，接收设备ID和状态对象，根据设备类型和状态变化的内容，判断是否需要调用updateAllDevices来更新仿真状态。比如当电源开关状态变化时，需要重新计算电路连通性和压力分布，所以调用updateAllDevices；当变送器输入压力变化时，也需要重新计算压力分布，所以调用updateAllDevices；但如果是压力表的显示状态变化，就不需要调用updateAllDevices了，因为压力表的显示是由输入压力直接决定的，不会反过来影响其他设备。
    /**
     * 获取引擎下所有设备的气路端口
     * @returns {Konva.Node[]} 返回所有标记为 pipe 的端口节点数组
     */
    getPipeTerminals() {
        const pipeTerminals = [];

        // 1. 遍历所有注册的设备 (假设存储在 this.devices 中)
        Object.values(this.devices).forEach(device => {
            // 2. 检查设备是否有 terminals 属性 (存储了 Konva 节点)
            if (device.terminals) {
                Object.values(device.terminals).forEach(terminalNode => {
                    // 3. 筛选出 connType 为 pipe 的端口
                    if (terminalNode.getAttr('connType') === 'pipe') {
                        pipeTerminals.push(terminalNode);
                    }
                });
            }
        });

        return pipeTerminals;
    }

    _bindRepairLogic() {
        // 绑定所有端子（气路与电气），用于双击修复 leak / break 故障
        const allTerms = [];
        Object.values(this.devices).forEach(dev => {
            if (dev.terminals && Array.isArray(dev.terminals)) dev.terminals.forEach(t => allTerms.push(t));
        });

        allTerms.forEach(term => {
            term.off('dblclick dbltap');
            term.on('dblclick dbltap', (e) => {
                // 漏气修复
                if (term.getAttr('isLeaking')) {
                    term.setAttr('isLeaking', false);
                    // 若 LeakDetector 有清理方法则调用
                    if (this.devices['leD'] && typeof this.devices['leD'].clearAllBubbles === 'function') {
                        this.devices['leD'].clearAllBubbles();
                    }
                    this.updateAllDevices();
                    return;
                }

                // 电气断线修复（针对外部导线端口被标记为 isBroken）
                if (term.getAttr('isBroken')) {
                    term.setAttr('isBroken', false);
                    // 如果是电源输出断线，清除全局断线标记
                    if (this._break && this._break.type === 'dcP_p' && term.id() === 'dcP_wire_p') {
                        this._break = null;
                    }
                    this.updateAllDevices();
                    return;
                }

                // 变送器内部断线：双击变送器的 p 端修复
                if (term.id && term.id().startsWith('pTr_wire_')) {
                    if (this.devices['pTr'] && this.devices['pTr'].isBroken) {
                        this.devices['pTr'].isBroken = false;
                        if (this._break && this._break.type === 'pTr_internal') this._break = null;
                        this.updateAllDevices();
                        return;
                    }
                }
            });
        });
    }
    remOperation(devId, state) {
        console.log(`Device ${devId} state changed:`, state);
        switch (devId) {
            case 'ui':
                // 使用嵌套 switch 处理 UI 命令
                switch (state) {
                    case 'autoWire': this.autoWire(); break;
                    case 'stepFive': this.stepFive(); break;
                    case 'undo': this.undo(); break;
                    case 'redo': this.redo(); break;
                    case 'reset': this.resetExperiment(); break;
                    case 'workflow': this.openWorkflowPanel(false, false); break;
                    case 'test': this.openWorkflowPanel(true, false); break;
                    // case 'leakDrill': this.startLeakDrill(); break;
                    // case 'leakAssess': this.startLeakAssessment(); break;
                    // case 'breakDrill': this.startBreakDrill(); break;
                    // case 'breakAssess': this.startBreakAssessment(); break;
                    case 'close': this.closeWorkflowPanel(); break;
                    default: console.warn(`未知的 UI 指令: ${state}`);
                }
                break;

            case 'init':
                this.pGaugeMax = state.pGaugeMax;
                this.pTransMax = state.pTransMax;
                this.resetExperiment();
                break;

            case 'conns':
                // 连线状态变化
                this.conns = state;
                this.reDrawConnections();
                return; // 这里保留 return 是为了跳过最后的 updateAllDevices

            case 'dcP':
                // 电源状态变化
                this.devices['dcP'].setValue(state.isOn, state.voltage);
                break;

            case 'pTr':
                // 变送器状态变化
                this.devices['pTr'].zeroAdj = state.ZERO;
                this.devices['pTr'].spanAdj = state.SPAN;
                this.devices['pTr'].update();
                break;

            case 'stV':
                // 截止阀状态变化
                this.devices['stV'].setValue(state.isOpen);
                break;

            case 'pRe':
                // 调压阀状态变化
                this.devices['pRe'].setPressure = state.setPres;
                this.devices['pRe'].update();
                break;

            default:
                console.warn(`未识别的设备 ID: ${devId}`);
                break;
        }

        // 统一更新所有设备状态
        this.updateAllDevices();
    }
    reportDevState(devId, state) {
        //如果是电源状态变化，重新画线
        console.log(`Device ${devId} state changed:`, state);
        this.onAction(devId, state); // 通知上层设备状态变化
        this.updateAllDevices();
    }
    // 更新所有设备状态，通过遍历devices数组，调用每个设备的update方法。
    updateAllDevices() {
        if (this.isProcessing) return; // 锁住，防止内部更新再次触发自身
        this.isProcessing = true;
        try {
            // 1. 物理计算层：根据当前拓扑计算每个节点的压力
            this.pressureMap = this.computeTermPress();
            this.voltageMap = this.updateCircuitSimulation(); // 计算电路状态并更新设备显示

            // 2. 表现层更新：将计算结果推送给设备,电流直接在上个函数updateCircuitSimulation里更新了，这里只需要更新压力相关的设备即可。
            this.devices['pRe'].setValue(this.pressureMap['pRe_pipe_i']);
            this.devices['pGa'].setValue(this.pressureMap['pGa_pipe_i']);
            this.devices['pTr'].setValue(this.pressureMap['pTr_pipe_i'] / 10);

            // 3. 连线层重绘
            // 注意：不要清空整个 uiLayer（会移除 topInfo），仅重绘连线图层
            this.reDrawConnections();
        } catch (error) {
            console.error("仿真更新失败:", error);
        } finally {
            this.isProcessing = false; // 释放锁
        }
    }
    // 撤销/重做/演示/重置等控制方法
    undo() {
        if (this._historyIndex > 0) {
            this._historyIndex -= 1;
            this._applySnapshot(this._historyIndex);
            console.log('undo ->', this._historyIndex);
        } else {
            console.log('已到历史最早记录');
        }
    }
    // 恢复上一步的操作
    redo() {
        if (this._historyIndex < this._history.length - 1) {
            this._historyIndex += 1;
            this._applySnapshot(this._historyIndex);
            console.log('redo ->', this._historyIndex);
        } else {
            console.log('已到最新记录');
        }
    }
    autoWire() {
        // 自动连线示例：连接电源正极到变送器正极，变送器负极到电流表正极，电流表负极到电源负极,并且连接截止阀和调压阀的气路，连接调压阀和T型管的气路，连接T型管和压力表的气路，连接T型管和变送器的气路。
        const autoConns = [
            { from: 'dcP_wire_p', to: 'pRr_wire_p', type: 'wire' },
            { from: 'pRr_wire_n', to: 'pTr_wire_p', type: 'wire' },
            { from: 'pTr_wire_n', to: 'aGa_wire_p', type: 'wire' },
            { from: 'aGa_wire_n', to: 'dcP_wire_n', type: 'wire' },
            { from: 'caB_pipe_o', to: 'stV_pipe_o', type: 'pipe' },
            { from: 'stV_pipe_i', to: 'pRe_pipe_i', type: 'pipe' },
            { from: 'pRe_pipe_o', to: 'tCo_pipe_l', type: 'pipe' },
            { from: 'tCo_pipe_r', to: 'pGa_pipe_i', type: 'pipe' },
            { from: 'tCo_pipe_u', to: 'pTr_pipe_i', type: 'pipe' },
        ];
        autoConns.forEach(conn => {
            const exists = this.conns.some(c => c.from === conn.from && c.to === conn.to);
            if (!exists) {
                this.conns.push(conn);
            }
        });
        this._recordSnapshot();
        this.updateAllDevices();
    }
    // 5步步进：每点击一次，依次设置regulator压力：0，0.25MPa,0.5MPa,0.75MPa,1MPa。循环设置。
    stepFive() {
        const pressures = [0, 2.5 * this.pTransMax, 5 * this.pTransMax, 7.5 * this.pTransMax, 10 * this.pTransMax]; // 对应0,0.25MPa,0.5MPa,0.75MPa,1MPa
        const current = this.devices['pRe'].setPressure || 0;
        const nextIndex = (pressures.indexOf(current) + 1) % pressures.length;
        this.devices['pRe'].setPressure = pressures[nextIndex];
        this.devices['pRe'].update();
        this.devices['pTr'].setValue(this.devices['pRe'].getValue() / 10);
        this.devices['aGa'].setValue(this.devices['pTr'].getValue());
        this.updateAllDevices();
    }
    // 单步演示：做一次仿真更新
    async singleStep() {
        console.log('单步演示 ->', this.stepIdx);
        if (this.stepIdx < this.steps.length) {
            // 先显示信息文本（若是连线动画，act 会返回 Promise）
            this.showTopInfo(this.steps[this.stepIdx].msg);
            const res = this.steps[this.stepIdx].act();
            if (res && typeof res.then === 'function') {
                await res; // 等待连线动画等异步操作完成
            }
            this._recordSnapshot();
            this.stepIdx++;
        } else {
            this.stepIdx = 0;
            this.conns = [];
            this.reDrawConnections();
        }
        this.updateAllDevices();
    }
    // 演示模式：自动按步骤执行预设的操作列表，模拟用户操作演示实验过程,每步之间有适当的延时，演示完成后显示提示信息。
    async operationDemo() {
        // 重置到初始状态
        this.conns = [];
        this.reDrawConnections();
        // 依次执行预设步骤
        for (let i = 0; i < this.steps.length; i++) {
            this.showTopInfo(this.steps[i].msg);
            const res = this.steps[i].act();
            if (res && typeof res.then === 'function') {
                await res; // 等待连线动画等异步操作完成
            }
            this._recordSnapshot();
            this.updateAllDevices();
            await new Promise(r => setTimeout(r, 2000)); // 每步之间的延时
        }
    }
    // 打开参数设置界面（使用 DOM 覆盖在画布上）
    openSettingsModal() {
        if (this._settingsModalEl) return; // 已打开
        const containerRect = this.container.getBoundingClientRect();

        const overlay = document.createElement('div');
        overlay.style.position = 'absolute';
        overlay.style.left = '0';
        overlay.style.top = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(0,0,0,0.35)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = 9999;

        const panel = document.createElement('div');
        panel.style.width = '360px';
        panel.style.padding = '18px';
        panel.style.borderRadius = '8px';
        panel.style.background = '#33592b';
        panel.style.boxShadow = '0 6px 18px rgba(0,0,0,0.25)';
        panel.style.fontFamily = 'Arial, sans-serif';
        panel.style.color = '#f0f8f7f9';

        panel.innerHTML = `
            <h3 style="margin:0 0 12px 0">参数设置</h3>
            <div style="margin-bottom:10px">
                <label style="display:block;margin-bottom:6px">压力变送器 Range Max (MPa)</label>
                <select id="selPTrans" style="width:100%;padding:6px">
                    <option value="0.5">0.5</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="5">5</option>
                </select>
            </div>
            <div style="margin-bottom:14px">
                <label style="display:block;margin-bottom:6px">压力表 Max (bar)</label>
                <select id="selPGauge" style="width:100%;padding:6px">
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                    <option value="100">100</option>                    
                </select>
            </div>
            <div style="text-align:right">
                <button id="btnCancel" style="margin-right:8px;padding:6px 12px">取消</button>
                <button id="btnApply" style="padding:6px 12px;background:#2c7be5;color:#fff;border:none;border-radius:4px">应用</button>
            </div>
        `;

        overlay.appendChild(panel);
        this.container.style.position = this.container.style.position || 'relative';
        this.container.appendChild(overlay);

        // 预选当前值
        const selPTrans = panel.querySelector('#selPTrans');
        const selPGauge = panel.querySelector('#selPGauge');
        selPTrans.value = (this.pTransMax !== undefined) ? String(this.pTransMax) : '1';
        selPGauge.value = (this.pGaugeMax !== undefined) ? String(this.pGaugeMax) : '10';

        // 事件
        const close = () => {
            try { this.container.removeChild(overlay); } catch (e) { }
            this._settingsModalEl = null;
        };
        panel.querySelector('#btnCancel').addEventListener('click', () => close());
        overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });

        panel.querySelector('#btnApply').addEventListener('click', () => {
            const newPTrans = parseFloat(selPTrans.value);
            const newPGauge = parseFloat(selPGauge.value);
            // 保存参数到 engine
            this.pTransMax = newPTrans;
            this.pGaugeMax = newPGauge;
            // 按要求：调用 init() 重置系统（先清空当前设备状态以避免重复）
            try { this.resetExperiment(); } catch (e) { /* fallback */ }
            this.onAction('init', { pTransMax: newPTrans, pGaugeMax: newPGauge }); // 通知上层参数变化
            close();
        });

        this._settingsModalEl = overlay;
    }
    // 关闭设置面板（外部也可调用）
    closeSettingsModal() {
        if (this._settingsModalEl) {
            try { this.container.removeChild(this._settingsModalEl); } catch (e) { }
            this._settingsModalEl = null;
        }
    }
    // 打开理论测试对话框：5道选择题，依次出题，最后提交评分（>=4 合格）
    openTheoryTest() {
        if (this._theoryModalEl) return;
        const overlay = document.createElement('div');
        overlay.style.position = 'absolute';
        overlay.style.left = '0';
        overlay.style.top = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(0,0,0,0.45)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = 10000;

        const panel = document.createElement('div');
        panel.style.width = '560px';
        panel.style.maxWidth = '92%';
        panel.style.padding = '18px';
        panel.style.borderRadius = '8px';
        panel.style.background = '#ffffff';
        panel.style.boxShadow = '0 8px 28px rgba(0,0,0,0.3)';
        panel.style.fontFamily = 'Arial, sans-serif';
        panel.style.color = '#222';

        const questions = [
            {
                q: '压力变送器的主要功能是：', choices: ['放大电压信号', '将压力转换为标准电信号（如4-20mA）', '测量温度并输出电压', '作为压力源使用'], a: 1
            },
            {
                q: '压力变送器在无压力输入时，输出电流为0mA，最可能的原因是：',
                choices: ['零点调得过高', '供电极性接反或回路断路', '量程设置过大', '传感膜片损坏'],
                a: 1
            },
            {
                q: '使用万用表测量4-20mA回路电流时，万用表应：',
                choices: ['并联在变送器两端', '串联接入回路中', '接在电源两端', '接在负载电阻两端'],
                a: 1
            },
            {
                q: '进行压力变送器校验时，通常需要的标准设备是：',
                choices: ['示波器', '标准压力源和精密电流表', '频率计', '温度校准炉'],
                a: 1
            },
            {
                q: '压力变送器量程为0-3MPa，缓慢加压至1.5MPa，输出电流大约为：',
                choices: ['4mA', '8mA', '12mA', '16mA'],
                a: 2
            },
            {
                q: '对压力变送器进行功能测试时，以下哪项是正确步骤：',
                choices: ['直接加满量程压力', '断开回路电源', '逐点施加压力并记录输出电流', '仅检查零点即可'],
                a: 2
            }
        ];

        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <strong>理论测试</strong>
                <button id="theoryClose" style="padding:4px 8px">关闭</button>
            </div>
            <div id="theoryBody" style="min-height:140px"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
                <div id="theoryProgress" style="color:#666"></div>
                <div>
                    <button id="theoryPrev" style="margin-right:8px;padding:6px 10px;display:none">上一步</button>
                    <button id="theoryNext" style="padding:6px 10px" disabled>下一题</button>
                </div>
            </div>
        `;

        overlay.appendChild(panel);
        this.container.style.position = this.container.style.position || 'relative';
        this.container.appendChild(overlay);
        this._theoryModalEl = overlay;

        let idx = 0;
        const answers = new Array(questions.length).fill(null);

        const body = panel.querySelector('#theoryBody');
        const prog = panel.querySelector('#theoryProgress');
        const btnPrev = panel.querySelector('#theoryPrev');
        const btnNext = panel.querySelector('#theoryNext');

        const renderQuestion = () => {
            const q = questions[idx];
            prog.textContent = `第 ${idx + 1} / ${questions.length} 题`;
            body.innerHTML = '';
            const qEl = document.createElement('div');
            qEl.style.marginBottom = '10px';
            qEl.innerHTML = `<div style="font-weight:600;margin-bottom:8px">${q.q}</div>`;
            const choicesEl = document.createElement('div');
            q.choices.forEach((ch, ci) => {
                const btn = document.createElement('button');
                btn.style.display = 'block';
                btn.style.width = '100%';
                btn.style.textAlign = 'left';
                btn.style.padding = '8px 10px';
                btn.style.marginBottom = '8px';
                btn.style.border = '1px solid #cfcfcf';
                btn.style.borderRadius = '6px';
                btn.style.background = answers[idx] === ci ? '#e6f4ff' : '#fff';
                btn.textContent = ch;
                btn.addEventListener('click', () => {
                    answers[idx] = ci;
                    // 高亮选中
                    Array.from(choicesEl.children).forEach((cbtn, i) => {
                        cbtn.style.background = i === ci ? '#e6f4ff' : '#fff';
                    });
                    btnNext.disabled = false;
                    if (idx === questions.length - 1) btnNext.textContent = '提交';
                    else btnNext.textContent = '下一题';
                });
                choicesEl.appendChild(btn);
            });
            qEl.appendChild(choicesEl);
            body.appendChild(qEl);

            // 上一步按钮显隐
            btnPrev.style.display = idx > 0 ? 'inline-block' : 'none';
            btnNext.disabled = answers[idx] === null;
            btnNext.textContent = idx === questions.length - 1 ? '提交' : '下一题';
        };

        btnPrev.addEventListener('click', () => {
            if (idx > 0) {
                idx -= 1;
                renderQuestion();
            }
        });

        btnNext.addEventListener('click', () => {
            if (answers[idx] === null) return; // should not happen due to disabled
            if (idx < questions.length - 1) {
                idx += 1;
                renderQuestion();
                return;
            }
            // 最后一题，提交评分
            let score = 0;
            for (let i = 0; i < questions.length; i++) if (answers[i] === questions[i].a) score++;
            body.innerHTML = `<div style="text-align:center;padding:18px"><div style="font-size:20px;font-weight:700">答题完成</div><div style="margin-top:12px">你的得分：${score} / ${questions.length}</div><div style="margin-top:8px;font-weight:700;color:${score >= 4 ? "#2d862d" : "#c0392b"}">${score >= `${0.8 * questions.length}` ? "合格" : "不合格"}</div></div>`;
            btnPrev.style.display = 'none';
            btnNext.style.display = 'none';
            prog.textContent = '';
        });

        panel.querySelector('#theoryClose').addEventListener('click', () => {
            try { this.container.removeChild(overlay); } catch (e) { }
            this._theoryModalEl = null;
        });

        overlay.addEventListener('click', (ev) => { if (ev.target === overlay) { try { this.container.removeChild(overlay); } catch (e) { } this._theoryModalEl = null; } });

        renderQuestion();
    }
    // 打开流程演练侧栏（右侧），显示 this.workflow 列表并循环检测每步条件
    openWorkflowPanel(testMode = false, preserveWorkflow = false) {
        // testMode: true 表示评估测试模式（只显示已完成步骤，底部显示当前进行到第几步，全部完成显示评估合格）
        this._workflowTestMode = !!testMode;
        if (this._workflowPanelEl) return;
        // 确保 workflow 已初始化（仅在未保留或未设置时初始化默认流程）
        if (!preserveWorkflow || !this.workflow || this.workflow.length === 0) {
            this.workflow = [
                { msg: "1. 连接电源正极到负载电阻左端", act: () => { return this.conns.some(c => c.from === 'dcP_wire_p' && c.to === 'pRr_wire_p') || this.conns.some(c => c.from === 'pRr_wire_p' && c.to === 'dcP_wire_p') } },
                { msg: "2. 连接负载电阻右端到变送器正端", act: () => { return this.conns.some(c => c.from === 'pRr_wire_n' && c.to === 'pTr_wire_p') || this.conns.some(c => c.from === 'pTr_wire_p' && c.to === 'pRr_wire_n') } },
                { msg: "3. 连接变送器负端到电流表正极", act: () => { return this.conns.some(c => c.from === 'pTr_wire_n' && c.to === 'aGa_wire_p') || this.conns.some(c => c.from === 'aGa_wire_p' && c.to === 'pTr_wire_n') } },
                { msg: "4. 连接电流表负极到电源负极", act: () => { return this.conns.some(c => c.from === 'aGa_wire_n' && c.to === 'dcP_wire_n') || this.conns.some(c => c.from === 'dcP_wire_n' && c.to === 'aGa_wire_n') } },
                { msg: "5. 空气瓶出口连接到截止阀右端", act: () => { return this.conns.some(c => c.from === 'caB_pipe_o' && c.to === 'stV_pipe_o') || this.conns.some(c => c.from === 'stV_pipe_o' && c.to === 'caB_pipe_o') } },
                { msg: "6. 截止阀左端连接到调压阀输入端", act: () => { return this.conns.some(c => c.from === 'stV_pipe_i' && c.to === 'pRe_pipe_i') || this.conns.some(c => c.from === 'pRe_pipe_i' && c.to === 'stV_pipe_i') } },
                { msg: "7. 调压阀输出端连接到T型管下端", act: () => { return this.conns.some(c => c.from === 'pRe_pipe_o' && c.to === 'tCo_pipe_l') || this.conns.some(c => c.from === 'tCo_pipe_l' && c.to === 'pRe_pipe_o') } },
                { msg: "8. T型管上端连接到压力表输入端", act: () => { return this.conns.some(c => c.from === 'tCo_pipe_r' && c.to === 'pGa_pipe_i') || this.conns.some(c => c.from === 'pGa_pipe_i' && c.to === 'tCo_pipe_r') } },
                { msg: "9. T型管左端连接到变送器气压口", act: () => { return this.conns.some(c => c.from === 'tCo_pipe_u' && c.to === 'pTr_pipe_i') || this.conns.some(c => c.from === 'pTr_pipe_i' && c.to === 'tCo_pipe_u') } },
                { msg: "10. 按下24V电源键,接通电源", act: () => this.devices['dcP'].isOn === true },
                { msg: "11. 合上截止阀,变送器气压为0,电流应为4mA.", act: () => this.devices['stV'].isOpen === true && this.devices['pRe'].setPressure === 0 && Math.abs(this.devices['pTr'].getValue() - 4) < 0.1 },
                { msg: `12. 将压力调节到${0.25 * this.pTransMax}MPa,变送器电流应为8mA.`, act: () => Math.abs(this.devices['pRe'].setPressure - 2.5 * this.pTransMax) < 0.05 && Math.abs(this.devices['pTr'].getValue() - 8) < 0.1 },
                { msg: `13. 将压力调节到${0.5 * this.pTransMax}MPa,变送器电流应为12mA.`, act: () => Math.abs(this.devices['pRe'].setPressure - 5 * this.pTransMax) < 0.05 && Math.abs(this.devices['pTr'].getValue() - 12) < 0.1 },
                { msg: `14. 将压力调节到${0.75 * this.pTransMax}MPa,变送器电流应为16mA.`, act: () => Math.abs(this.devices['pRe'].setPressure - 7.5 * this.pTransMax) < 0.05 && Math.abs(this.devices['pTr'].getValue() - 16) < 0.1 },
                { msg: `15. 将压力调节到${this.pTransMax}MPa,变送器电流应为20mA.`, act: () => Math.abs(this.devices['pRe'].setPressure - 10 * this.pTransMax) < 0.05 && Math.abs(this.devices['pTr'].getValue() - 20) < 0.1 }
            ];
        }
        const panel = document.createElement('div');
        panel.style.position = 'absolute';
        panel.style.top = '0';
        panel.style.right = '0';
        const isMobile = window.innerHeight < 800;
        panel.style.width = isMobile ? '200px' : '340px'; // 横屏时变窄
        panel.style.fontSize = isMobile ? '12px' : '18px'; // 减小字号
        panel.style.height = '100vh';
        panel.style.maxHeight = '100dvh';
        panel.style.background = '#cdcbcb';
        panel.style.boxShadow = '-6px 0 18px rgba(0,0,0,0.2)';
        panel.style.zIndex = 9998;
        panel.style.padding = '12px';
        panel.style.boxSizing = 'border-box';
        panel.style.fontFamily = 'Arial, sans-serif';
        // panel.style.overscrollBehavior = 'none'; // 禁用滚动溢出到父级


        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <strong>操作流程</strong>
                <button id="wfClose" style="padding:4px 8px">关闭</button>
            </div>
            <div id="wfList" style="overflow:auto;height:calc(100% - 90px);padding-right:6px"></div>
            <div id="wfFooter" style="margin-top:8px;text-align:center;color:#2d862d;font-weight:bold;display:none"></div>
        `;

        this.container.style.position = this.container.style.position || 'relative';
        this.container.appendChild(panel);
        this._workflowPanelEl = panel;

        const wfList = panel.querySelector('#wfList');
        // wfList.style.position = 'relative';
        // wfList.style.overscrollBehavior = 'contain'; // 滚动仅限列表内部
        // 渲染列表：正常模式渲染全部；测试模式不显示当前与未来步骤，只显示已完成（初始为空）
        if (!this._workflowTestMode) {
            this.workflow.forEach((step, idx) => {
                const item = document.createElement('div');
                item.className = 'wf-item';
                item.dataset.idx = String(idx);
                item.style.padding = '8px';
                item.style.borderBottom = '1px solid #6c6a6a';
                item.style.cursor = 'default';
                item.style.transition = 'background .18s';
                item.innerHTML = `<div style="display:flex;align-items:center"><div style="flex:1">${step.msg}</div></div>`;
                wfList.appendChild(item);
            });
        } else {
            wfList.innerHTML = ''; // 测试模式初始不显示任何步骤（只有完成的会显示）
        }

        // 高亮第一项
        this._workflowIdx = 0;
        this._updateWorkflowUI();

        // 关闭按钮
        panel.querySelector('#wfClose').addEventListener('click', () => { this.onAction('ui', 'close'); this.closeWorkflowPanel() });

        // 开始轮询检查
        this._startWorkflowWatcher();
    }

    closeWorkflowPanel() {
        if (!this._workflowPanelEl) return;
        this._stopWorkflowWatcher();
        try { this.container.removeChild(this._workflowPanelEl); } catch (e) { }
        this._workflowPanelEl = null;
    }

    _updateWorkflowUI() {
        if (!this._workflowPanelEl) return;
        const wfList = this._workflowPanelEl.querySelector('#wfList');
        const footer = this._workflowPanelEl.querySelector('#wfFooter');

        if (this._workflowTestMode) {
            // 测试模式：只显示已完成（索引 < _workflowIdx）的步骤
            wfList.innerHTML = '';
            for (let i = 0; i < this._workflowIdx && i < this.workflow.length; i++) {
                const step = this.workflow[i];
                const item = document.createElement('div');
                item.className = 'wf-item';
                item.dataset.idx = String(i);
                item.style.padding = '8px';
                item.style.borderBottom = '1px solid #6c6a6a';
                item.style.cursor = 'default';
                item.style.background = '#ece6e6';
                item.style.color = '#088641';
                item.style.fontWeight = 'normal';
                item.innerHTML = `<div style="display:flex;align-items:center"><div style="flex:1">☑️${step.msg}</div></div>`;
                wfList.appendChild(item);
            }
            if (wfList.lastElementChild) {
                wfList.lastElementChild.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest'
                });
            }

            // footer：显示当前已进行到第几步；全部完成显示评估合格
            if (this._workflowIdx >= this.workflow.length) {
                footer.textContent = '评估合格';
                footer.style.color = '#2d862d';
                footer.style.fontWeight = 'bold';
                footer.style.display = 'block';
            } else {
                footer.textContent = `当前已进行到第 ${this._workflowIdx} 步`;
                footer.style.color = '#000';
                footer.style.fontWeight = 'normal';
                footer.style.display = 'block';
            }
        } else {
            // 常规演示模式：原先行为，高亮当前，划掉已完成
            Array.from(wfList.children).forEach(el => {
                const idx = Number(el.dataset.idx);
                if (idx === this._workflowIdx) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                el.style.textDecoration = 'none';
                if (idx === this._workflowIdx) {
                    el.style.background = '#dbdae0';
                    el.style.color = '#3c8d3c';
                    el.style.fontWeight = 'bold';
                } else if (idx < this._workflowIdx) {
                    el.style.background = '#ece6e6';
                    el.style.color = '#4b4848';
                    el.style.fontWeight = 'normal';
                    el.style.textDecoration = 'line-through';
                } else {
                    el.style.background = '#fff';
                    el.style.color = '#151414';
                    el.style.fontWeight = 'normal';
                }
            });
            if (this._workflowIdx >= this.workflow.length) {
                footer.style.display = 'block';
                footer.textContent = '演练完成';
                footer.style.color = '#2d862d';
                footer.style.fontWeight = 'bold';
            }
            else footer.style.display = 'none';

        }
    }

    _startWorkflowWatcher() {
        if (this._workflowTimer) return;
        this._workflowTimer = setInterval(() => {
            // 如果已完成，停止
            if (this._workflowIdx >= this.workflow.length) {
                this._stopWorkflowWatcher();
                this._updateWorkflowUI();
                return;
            }
            const step = this.workflow[this._workflowIdx];
            try {
                const passed = step.act();
                if (passed) {
                    this._workflowIdx += 1;
                    this._updateWorkflowUI();
                }
            } catch (e) {
                console.warn('workflow check error', e);
            }
        }, 1000);
    }

    _stopWorkflowWatcher() {
        if (this._workflowTimer) {
            clearInterval(this._workflowTimer);
            this._workflowTimer = null;
        }
    }
    // 实验重置：清除连线并重新初始化设备布局（保留舞台）
    resetExperiment() {
        // 清空连线
        this.conns = [];
        this.connected = false;
        this.devices['dcP'].setValue(false,24);
        this.devices['stV'].setValue(false);
        this.devices['pRe'].setPressure =0;
        this.uiLayer.destroyChildren(); // 清除 UI 元素
        this.lineLayer.destroyChildren(); // 清除连线

        this._history = [];
        this._historyIndex = -1;
        // 重新初始化默认设备
        this.updateAllDevices();
        this._recordSnapshot();
        console.log('实验已重置');
    }
    // 重绘所有连线
    reDrawConnections() {
        this.lineLayer.destroyChildren(); // 清除现有连线
        this.conns.forEach(conn => {
            const fromTerm = this.stage.findOne('#' + conn.from);
            const toTerm = this.stage.findOne('#' + conn.to);

            const getShapeCenter = (shape) => {
                const selfRect = shape.getSelfRect();
                const centerX = selfRect.x + selfRect.width / 2;
                const centerY = selfRect.y + selfRect.height / 2;
                const transform = shape.getAbsoluteTransform();
                return transform.point({ x: centerX, y: centerY });
            };

            if (fromTerm && toTerm) {
                let fromPos = fromTerm.getAbsolutePosition();
                let toPos = toTerm.getAbsolutePosition();

                // 1. 判定是否涉及万用表端子
                const isMuMConn = conn.from.includes('muM') || conn.to.includes('muM');
                const muMTermId = conn.from.includes('muM') ? conn.from : (conn.to.includes('muM') ? conn.to : null);

                // 2. 颜色与样式配置逻辑
                let strokeColor;
                let strokeWidth = conn.type === 'wire' ? 4 : 10;
                let lineTension = 0; // 默认直线
                let linePoints = [fromPos.x, fromPos.y, toPos.x, toPos.y];
                if (conn.type === 'wire') {
                    if (isMuMConn) {
                        // 万用表特殊连线逻辑
                        strokeWidth = 6;
                        lineTension = 0.4; // 开启贝塞尔曲线效果
                        // --- 核心修改：万用表表笔线增加中点以触发 tension ---
                        const midX = (fromPos.x + toPos.x) / 2;
                        const midY = Math.max(fromPos.y, toPos.y) + 20; // 模拟重力，让中点下垂 30 像素

                        // 重新构造点序列：[起点, 中点, 终点]
                        linePoints = [fromPos.x, fromPos.y, midX, midY, toPos.x, toPos.y];
                        // 根据端子功能上色
                        if (muMTermId.includes('com')) {
                            strokeColor = '#006400'; // 墨绿色
                        } else if (muMTermId.includes('v') || muMTermId.includes('ma')) {
                            strokeColor = '#FF4500'; // 火红色 (OrangeRed)
                        }
                    } else {
                        // 普通导线颜色
                        strokeColor = this.connected ? '#f42811' : '#ceafac';
                    }
                } else if (conn.type === 'pipe') {
                    // 气路逻辑
                    fromPos = getShapeCenter(fromTerm);
                    toPos = getShapeCenter(toTerm);
                    linePoints = [fromPos.x, fromPos.y, toPos.x, toPos.y];
                    strokeColor = ((this.pressureMap[conn.from] !== null) && this.pressureMap[conn.from] > 0) ? '#2765f4' : '#767a7a';
                }

                // 3. 创建连线
                const line = new Konva.Line({
                    points: linePoints,
                    stroke: strokeColor,
                    strokeWidth: strokeWidth,
                    lineCap: 'round',
                    lineJoin: 'round',
                    tension: lineTension, // 关键：设置此值大于0即变为贝塞尔曲线
                    shadowBlur: conn.type === 'pipe' ? 4 : 0,
                    shadowColor: '#333'
                });

                this.lineLayer.add(line);

                // 双击删除连线逻辑
                line.on('dblclick dbltap', () => {
                    this.conns = this.conns.filter(c => c !== conn);
                    this.reDrawConnections();
                    this.updateAllDevices();

                    if (conn.type === 'pipe') {
                        const fromTermShape = this.stage.findOne('#' + conn.from);
                        const toTermShape = this.stage.findOne('#' + conn.to);
                        const restoreClick = (shape) => {
                            shape.off('mousedown touchstart');
                            shape.on('mousedown touchstart', () => this.onTermClick(shape));
                        };
                        restoreClick(fromTermShape);
                        restoreClick(toTermShape);
                    }
                    this._recordSnapshot();
                });
            }
        });
        this.lineLayer.draw();
    }
    //窗口大小改变时，调整舞台大小
    resize() {
        this.stage.width(this.container.offsetWidth);
        this.stage.height(this.container.offsetHeight);
        this.reDrawConnections();
    }
    // 动画方式添加连线：3s 完成一次连线，结束后把连线加入 this.conns 并重绘
    addConnectionAnimated(conn) {
        return new Promise((resolve) => {
            const fromTerm = this.stage.findOne('#' + conn.from);
            const toTerm = this.stage.findOne('#' + conn.to);
            if (!fromTerm || !toTerm) {
                // 找不到端子，直接加入（回退）
                this.conns.push(conn);
                this.reDrawConnections();
                resolve();
                return;
            }
            const getShapeCenter = (shape) => {
                const selfRect = shape.getSelfRect();
                const centerX = selfRect.x + selfRect.width / 2;
                const centerY = selfRect.y + selfRect.height / 2;
                const transform = shape.getAbsoluteTransform();
                return transform.point({ x: centerX, y: centerY });
            };
            const fromPos = (conn.type === 'pipe') ? getShapeCenter(fromTerm) : fromTerm.getAbsolutePosition();
            const toPos = (conn.type === 'pipe') ? getShapeCenter(toTerm) : toTerm.getAbsolutePosition();

            // 临时动画线（只画一条从起点到起点，逐步扩展到终点）
            const animLine = new Konva.Line({
                points: [fromPos.x, fromPos.y, fromPos.x, fromPos.y],
                stroke: conn.type === 'wire' ? '#e41c1c' : '#78e4c9',
                strokeWidth: conn.type === 'wire' ? 6 : 10,
                lineCap: 'round',
                lineJoin: 'round',
                shadowBlur: conn.type === 'pipe' ? 6 : 0,
                shadowColor: '#333',
                opacity: 0.95,
            });
            this.lineLayer.add(animLine);
            this.lineLayer.draw();

            const duration = 3000; // ms
            const start = performance.now();
            const animate = (now) => {
                const t = Math.min(1, (now - start) / duration);
                const curX = fromPos.x + (toPos.x - fromPos.x) * t;
                const curY = fromPos.y + (toPos.y - fromPos.y) * t;
                animLine.points([fromPos.x, fromPos.y, curX, curY]);
                this.lineLayer.batchDraw();
                if (t < 1) {
                    requestAnimationFrame(animate);
                } else {
                    // 动画结束：移除临时线，加入正式连线并重绘
                    animLine.destroy();
                    this.conns.push(conn);
                    this.reDrawConnections();
                    this._recordSnapshot();
                    resolve();
                }
            };
            requestAnimationFrame(animate);
        });
    }

    /**
     * 判定当前连线是否与标准答案完全等效
     * @returns {boolean}
     */
    checkConn() {
        const target = [
            { from: 'dcP_wire_p', to: 'pRr_wire_p', type: 'wire' },
            { from: 'pRr_wire_n', to: 'pTr_wire_p', type: 'wire' },
            { from: 'aGa_wire_p', to: 'pTr_wire_n', type: 'wire' },
            { from: 'aGa_wire_n', to: 'dcP_wire_n', type: 'wire' },
            { from: 'caB_pipe_o', to: 'stV_pipe_o', type: 'pipe' },
            { from: 'pRe_pipe_i', to: 'stV_pipe_i', type: 'pipe' },
            { from: 'pRe_pipe_o', to: 'tCo_pipe_l', type: 'pipe' },
            { from: 'pGa_pipe_i', to: 'tCo_pipe_r', type: 'pipe' },
            { from: 'pTr_pipe_i', to: 'tCo_pipe_u', type: 'pipe' }
        ];

        // 1. 如果数量都不对，直接判定失败
        if (this.conns.length !== target.length) return false;

        // 2. 将用户当前的连线进行归一化处理（内部 from/to 排序）并生成唯一标识字符串
        const normalize = (conn) => {
            const [a, b] = [conn.from, conn.to].sort();
            return `${conn.type}:${a}:${b}`;
        };

        const currentSet = new Set(this.conns.map(normalize));
        const targetSet = new Set(target.map(normalize));

        // 3. 检查两个集合是否完全一致
        if (currentSet.size !== targetSet.size) return false;
        for (let item of targetSet) {
            if (!currentSet.has(item)) return false;
        }

        return true;
    }

    /** 随机在变送器或压力表的气路端口制造一个漏气点，并打开演练面板 */
    startLeakDrill() {
        const candidates = [];
        const tryPush = (id) => { const term = this.stage.findOne('#' + id); if (term) candidates.push(term); };
        tryPush('pTr_pipe_i');
        tryPush('pGa_pipe_i');
        tryPush('tCo_pipi_l');
        tryPush('tCo_pipi_r');
        tryPush('tCo_pipi_u');

        if (candidates.length === 0) {
            this.showTopInfo('未找到可注入漏点的端口');
            return;
        }
        const idx = Math.floor(Math.random() * candidates.length);
        const term = candidates[idx];
        term.setAttr('isLeaking', true);
        this.updateAllDevices();

        // 设置特定的演练流程
        this.workflow = [
            { msg: '1. 接通电路和气路', act: () => this.checkConn() },
            { msg: '2. 合上电源开关和合上截止阀', act: () => (this.devices['dcP'] && this.devices['dcP'].isOn) && (this.devices['stV'] && this.devices['stV'].isOpen) },
            { msg: `3. 将压力调节到 ${0.5 * this.pTransMax}MPa，观察漏气现象，判断漏气点 `, act: () => Math.abs((this.devices['pRe'].setPressure) - (5 * this.pTransMax)) < (0.05 * this.pTransMax) },
            { msg: '4. 使用 Leak Test 工具检测漏气', act: () => (this.devices['leD'] && this.devices['leD'].isEmitting === true) },
            { msg: '5. 关闭电源和气源', act: () => (this.devices['dcP'] && !this.devices['dcP'].isOn) && (this.devices['stV'] && !this.devices['stV'].isOpen) },
            {
                msg: '6. 修复漏气点', act: () => {
                    const terms = this.getPipeTerminals();
                    return terms.every(t => !t.getAttr('isLeaking'));
                }
            },
            { msg: '7. 合上电源和气源，确定气压表和变送器读数接近相等', act: () => (this.devices['dcP'] && this.devices['dcP'].isOn) && (this.devices['stV'] && this.devices['stV'].isOpen) && (Math.abs((this.devices['pRe'].setPressure) - (5 * this.pTransMax)) < (0.05 * this.pTransMax)) }
        ];
        this.openWorkflowPanel(false, true);
    }

    startLeakAssessment() {
        // 评估模式：先注入随机漏点，然后以测试模式打开流程面板
        const candidates = [];
        const tryPush = (id) => { const term = this.stage.findOne('#' + id); if (term) candidates.push(term); };

        tryPush('pTr_pipe_i');
        tryPush('pGa_pipe_i');
        tryPush('tCo_pipi_l');
        tryPush('tCo_pipi_r');
        tryPush('tCo_pipi_u');
        if (candidates.length === 0) {
            this.showTopInfo('未找到可注入漏点的端口');
            return;
        }
        const idx = Math.floor(Math.random() * candidates.length);
        const term = candidates[idx];
        term.setAttr('isLeaking', true);
        this.updateAllDevices();

        // 使用与演练相同的步骤，但以测试模式打开（逐步评估）
        this.workflow = [
            { msg: '1. 接通电路和气路', act: () => this.checkConn() },
            { msg: '2. 合上电源开关和合上截止阀', act: () => (this.devices['dcP'] && this.devices['dcP'].isOn) && (this.devices['stV'] && this.devices['stV'].isOpen) },
            { msg: `3. 将压力调节到 ${0.5 * this.pTransMax}MPa，观察漏气现象，判断漏气点 `, act: () => Math.abs((this.devices['pRe'].setPressure) - (5 * this.pTransMax)) < (0.05 * this.pTransMax) },
            { msg: '4. 使用 Leak Test 工具检测漏气', act: () => (this.devices['leD'] && this.devices['leD'].isEmitting === true) },
            { msg: '5. 关闭电源和气源', act: () => (this.devices['dcP'] && !this.devices['dcP'].isOn) && (this.devices['stV'] && !this.devices['stV'].isOpen) },
            {
                msg: '6. 修复漏气点', act: () => {
                    const terms = this.getPipeTerminals();
                    return terms.every(t => !t.getAttr('isLeaking'));
                }
            },
            { msg: '7. 合上电源和气源，确定气压表和变送器读数接近相等', act: () => (this.devices['dcP'] && this.devices['dcP'].isOn) && (this.devices['stV'] && this.devices['stV'].isOpen) && (Math.abs((this.devices['pRe'].setPressure) - (5 * this.pTransMax)) < (0.05 * this.pTransMax)) }
        ];

        this.openWorkflowPanel(true, true);
    }


    /** 随机注入断线：两种模式（电源输出接口断线 / 变送器内部断线） */
    startBreakDrill() {
        const choices = ['dcP_wire_p', 'pTr_internal'];
        const pick = choices[Math.floor(Math.random() * choices.length)];
        if (pick === 'dcP_wire_p') {
            const term = this.stage.findOne('#dcP_wire_p');
            if (!term) { this.showTopInfo('找不到电源输出端口'); return; }
            term.setAttr('isBroken', true);
            this._break = { type: 'dcP_p', termId: 'dcP_wire_p' };
        } else {
            // 变送器内部断线
            if (this.devices['pTr']) {
                this.devices['pTr'].isBroken = true;
                this._break = { type: 'pTr_internal' };
            }
        }

        // 设置演练流程（断线演练步骤）
        this.workflow = [
            { msg: '1. 接通电路和气路', act: () => this.checkConn() },
            { msg: '2. 合上电源和截止阀，观察电流表显示为0', act: () => (this.devices['dcP'] && this.devices['dcP'].isOn) && (this.devices['stV'] && this.devices['stV'].isOpen) && (this.devices['aGa'] && Math.abs(this.devices['aGa'].getValue() - 0) < 0.1) },
            { msg: '3. 关闭气源', act: () => (this.devices['stV'] && !this.devices['stV'].isOpen) },
            {
                msg: '4. 用万用表测电压,判断电路端点', act: () => {
                    // 学员需将万用表表笔接到对应端子，检测显示由 muM 的读数决定
                    if (!this.devices['muM']) return false;
                    // 如果是电源断线，muM 测 dcP_wire_p 到 dcP_wire_n 应为 0
                    if (this._break && this._break.type === 'dcP_p') {
                        // 只有当万用表连接到 dcP_wire_p 与 dcP_wire_n 时才判断

                        return (this.conns.some(c => (c.from === 'muM_wire_v' && c.to === 'dcP_wire_p') || (c.to === 'muM_wire_v' && c.from === 'dcP_wire_p')) &&
                            this.conns.some(c => (c.from === 'muM_wire_com' && c.to === 'dcP_wire_n') || (c.to === 'muM_wire_com' && c.from === 'dcP_wire_n')) && (this.devices['dcP'] && this.devices['dcP'].isOn) &&
                            (this.devices['muM'].mode === 'DCV') &&
                            Math.abs(this.devices['muM'].getValue() - 0) < 0.5);
                    }
                    // 如果是变送器内部断线，万用表可测得变送器 p/n 端电压等于电源电压
                    if (this._break && this._break.type === 'pTr_internal') {
                        console.log(this._break.type, this.devices['muM'].mode, this.devices['muM'].getValue(), this.devices['dcP'].getValue());
                        return (this.conns.some(c => (c.from === 'muM_wire_v' && c.to === 'pTr_wire_p') || (c.to === 'muM_wire_v' && c.from === 'pTr_wire_p')) &&
                            this.conns.some(c => (c.from === 'muM_wire_com' && c.to === 'pTr_wire_n') || (c.to === 'muM_wire_com' && c.from === 'pTr_wire_n')) && (this.devices['dcP'] && this.devices['dcP'].isOn) &&
                            (this.devices['muM'].mode === 'DCV')) && Math.abs(this.devices['muM'].getValue() - this.devices['dcP'].getValue()) < 0.5;
                    }
                    return false;
                }
            },
            {
                msg: '5. 关闭电源，修复断线故障', act: () => {
                    // 判断断线是否已修复
                    // 兼容性增强：若 this._break 已被清除（例如修复逻辑将其置空），也视为已修复。
                    if (this.devices['dcP'] && this.devices['dcP'].isOn) return false; // 必须先关闭电源
                    if (!this._break) return true;

                    if (this._break.type === 'dcP_p') {
                        const t = this.stage.findOne('#dcP_wire_p');
                        // 如果端子存在且 isBroken 为 false，则视为修复；若 _break 被外部清除，上面已返回 true
                        return (t && !t.getAttr('isBroken'));
                    }
                    if (this._break.type === 'pTr_internal') {
                        return this.devices['pTr'] && !this.devices['pTr'].isBroken;
                    }
                    return false;
                }
            },
            { msg: '6. 开启电源，确认在无气压输入情况下电流恢复为4mA', act: () => (this.devices['dcP'] && this.devices['dcP'].isOn) && (this.devices['aGa'] && Math.abs(this.devices['aGa'].getValue() - 4) < 0.5) }
        ];

        this.openWorkflowPanel(false, true);
    }

    startBreakAssessment() {
        const choices = ['dcP_wire_p', 'pTr_internal'];
        const pick = choices[Math.floor(Math.random() * choices.length)];
        if (pick === 'dcP_wire_p') {
            const term = this.stage.findOne('#dcP_wire_p');
            if (!term) { this.showTopInfo('找不到电源输出端口'); return; }
            term.setAttr('isBroken', true);
            this._break = { type: 'dcP_p', termId: 'dcP_wire_p' };
        } else {
            if (this.devices['pTr']) {
                this.devices['pTr'].isBroken = true;
                this._break = { type: 'pTr_internal' };
            }
        }

        // 使用与演练相同的步骤，但以评估模式打开
        this.workflow = [
            { msg: '1. 接通电路和气路', act: () => this.checkConn() },
            { msg: '2. 合上电源和截止阀，观察电流表显示为0', act: () => (this.devices['dcP'] && this.devices['dcP'].isOn) && (this.devices['stV'] && this.devices['stV'].isOpen) && (this.devices['aGa'] && Math.abs(this.devices['aGa'].getValue() - 0) < 0.1) },
            { msg: '3. 关闭气源', act: () => (this.devices['stV'] && !this.devices['stV'].isOpen) },
            {
                msg: '4. 用万用表测电压,判断电路断点', act: () => {
                    // 学员需将万用表表笔接到对应端子，检测显示由 muM 的读数决定
                    if (!this.devices['muM']) return false;
                    // 如果是电源断线，muM 测 dcP_wire_p 到 dcP_wire_n 应为 0
                    if (this._break && this._break.type === 'dcP_p') {
                        // 只有当万用表连接到 dcP_wire_p 与 dcP_wire_n 时才判断

                        return (this.conns.some(c => (c.from === 'muM_wire_v' && c.to === 'dcP_wire_p') || (c.to === 'muM_wire_v' && c.from === 'dcP_wire_p')) &&
                            this.conns.some(c => (c.from === 'muM_wire_com' && c.to === 'dcP_wire_n') || (c.to === 'muM_wire_com' && c.from === 'dcP_wire_n')) && (this.devices['dcP'] && this.devices['dcP'].isOn) &&
                            (this.devices['muM'].mode === 'DCV') &&
                            Math.abs(this.devices['muM'].getValue() - 0) < 0.5);
                    }
                    // 如果是变送器内部断线，万用表可测得变送器 p/n 端电压等于电源电压
                    if (this._break && this._break.type === 'pTr_internal') {
                        console.log(this._break.type, this.devices['muM'].mode, this.devices['muM'].getValue(), this.devices['dcP'].getValue());
                        return (this.conns.some(c => (c.from === 'muM_wire_v' && c.to === 'pTr_wire_p') || (c.to === 'muM_wire_v' && c.from === 'pTr_wire_p')) &&
                            this.conns.some(c => (c.from === 'muM_wire_com' && c.to === 'pTr_wire_n') || (c.to === 'muM_wire_com' && c.from === 'pTr_wire_n')) && (this.devices['dcP'] && this.devices['dcP'].isOn) &&
                            (this.devices['muM'].mode === 'DCV')) && Math.abs(this.devices['muM'].getValue() - this.devices['dcP'].getValue()) < 0.5;
                    }
                    return false;
                }
            },
            {
                msg: '5. 关闭电源，修复断线故障', act: () => {
                    // 判断断线是否已修复
                    // 兼容性增强：若 this._break 已被清除（例如修复逻辑将其置空），也视为已修复。
                    if (this.devices['dcP'] && this.devices['dcP'].isOn) return false; // 必须先关闭电源
                    if (!this._break) return true;

                    if (this._break.type === 'dcP_p') {
                        const t = this.stage.findOne('#dcP_wire_p');
                        // 如果端子存在且 isBroken 为 false，则视为修复；若 _break 被外部清除，上面已返回 true
                        return (t && !t.getAttr('isBroken'));
                    }
                    if (this._break.type === 'pTr_internal') {
                        return this.devices['pTr'] && !this.devices['pTr'].isBroken;
                    }
                    return false;
                }
            },
            { msg: '6. 开启电源，确认在无气压输入情况下电流恢复为4mA', act: () => (this.devices['dcP'] && this.devices['dcP'].isOn) && (this.devices['aGa'] && Math.abs(this.devices['aGa'].getValue() - 4) < 0.5) }
        ];

        this.openWorkflowPanel(true, true);
    }

}