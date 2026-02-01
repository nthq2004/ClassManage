/**
 * DC 24V 可调直流电源模拟器
 * 功能：电压调节、开关控制、状态指示、手动连线端子集成
 */
export class DCPower {
    constructor(config) {

        this.layer = config.layer;
        this.x = config.x || 100;
        this.y = config.y || 100;

        // 状态变量
        this.isOn = false;
        this.voltage = 0;
        this.maxVoltage = 24;
        this.terminals = []; // 存储接线柱对象

        // Konva 组
        this.group = new Konva.Group({
            x: this.x,
            y: this.y,
            draggable: true,
            id: config.id || 'dc_power'
        });

        this._init();
    }

    _init() {
        this._drawChassis();      // 绘制外壳
        this._drawNameplate();    // 绘制铭牌
        this._drawLCD();          // 绘制液晶屏
        this._drawControls();     // 绘制开关和旋钮
        this._drawTerminals();    // 绘制接线柱

        this.layer.add(this.group);
        this.layer.draw();
    }

    // 1. 矩形外框
    _drawChassis() {
        const bg = new Konva.Rect({
            width: 260,
            height: 320,
            fill: '#dfe4ea',
            stroke: '#2f3542',
            strokeWidth: 4,
            cornerRadius: 10,
            shadowBlur: 10,
            shadowOpacity: 0.3
        });
        this.group.add(bg);
    }
    // 2. 铭牌
    _drawNameplate() {
        const titleLeft = new Konva.Text({
            x: 20, y: 20,
            text: 'DC 24V 可调直流电源',
            fontSize: 12,
            fontStyle: 'bold',
            fill: '#2f3542'
        });
        const titleRight = new Konva.Text({
            x: 185, y: 20,
            text: '江苏航院',
            fontSize: 12,
            fill: '#2f3542'
        });
        this.group.add(titleLeft, titleRight);
    }
    // 3. 液晶显示屏
    _drawLCD() {
        const lcdBg = new Konva.Rect({
            x: 20, y: 50,
            width: 220, height: 80,
            fill: '#1a1a1a',
            cornerRadius: 5,
            stroke: '#747d8c',
            strokeWidth: 2
        });

        this.voltageText = new Konva.Text({
            x: 20, y: 70,
            width: 220,
            text: 'OFF',
            fontSize: 40,
            fontFamily: 'Courier New',
            fill: '#2ed573', // 经典绿色
            align: 'center',
            fontStyle: 'bold'
        });

        const unitText = new Konva.Text({
            x: 190, y: 105,
            text: 'V DC',
            fontSize: 14,
            fill: '#2ed573'
        });

        this.group.add(lcdBg, this.voltageText, unitText);
    }

    // 4. 控制面板（开关、旋钮、指示灯）
    _drawControls() {
        // --- 电源开关 ---
        this.powerBtn = new Konva.Rect({
            x: 35, y: 160,
            width: 40, height: 50,
            fill: '#ff4757',
            stroke: '#333',
            cornerRadius: 3,
            cursor: 'pointer'
        });

        this.powerBtn.on('click tap', () => {
            this.isOn = !this.isOn;
            this.update();
        });

        // --- 电压调节旋钮 ---
        this.knob = new Konva.Group({ x: 130, y: 185, cursor: 'pointer' });
        const knobCircle = new Konva.Circle({
            radius: 25,
            fill: 'radial-gradient(startRadius: 0, endRadius: 25, colorStops: [0, "#ced6e0", 1, "#747d8c"])',
            stroke: '#2f3542'
        });
        this.knobPointer = new Konva.Line({
            points: [0, 0, 0, -20],
            stroke: '#ff4757',
            strokeWidth: 3,
            lineCap: 'round'
        });
        this.knob.add(knobCircle, this.knobPointer);

        // 旋钮交互逻辑：简单的拖拽旋转模拟电压
        this.knob.on('mousedown touchstart', (e) => {
            e.cancelBubble = true; // 禁止拖动整个设备
            const startY = e.evt.clientY || e.evt.touches[0].clientY;
            const startVolt = this.voltage;

            const onMove = (moveEvent) => {
                const currentY = moveEvent.clientY || (moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY);
                const diff = (startY - currentY) * 0.2; // 灵敏度
                this.voltage = Math.max(0, Math.min(this.maxVoltage, startVolt + diff));
                this.update();
            };

            const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });

        // --- 指示灯 ---
        this.led = new Konva.Circle({
            x: 210, y: 185,
            radius: 8,
            fill: '#2f3542',
            stroke: '#333'
        });

        this.group.add(this.powerBtn, this.knob, this.led);
    }

    // 5. 接线柱（关键：集成手动连线属性）
    _drawTerminals() {
        const terminalData = [
            { label: 'p', color: '#ff4757', x: 80 }, // 红
            { label: 'n', color: '#2f3542', x: 180 } // 黑
        ];

        terminalData.forEach(data => {
            const term = new Konva.Circle({
                x: data.x,
                y: 270,
                radius: 12,
                fill: data.color,
                stroke: '#333',
                strokeWidth: 2,
                id: `${this.group.id()}_term_${data.label}`
            });

            // 避开保留属性 'type'，改用 'connectionType'
            term.setAttrs({
                connType: 'wire',
                termId: term.id()
            });

            term.on('mousedown touchstart', (e) => {
                e.cancelBubble = true;
                if (this.onTerminalClick) this.onTerminalClick(term);
            });

            this.group.add(term);
            this.terminals.push(term);
        });
    }

    // 更新显示逻辑
    update() {
        if (!this.isOn) {
            this.voltageText.text('OFF');
            this.voltageText.fill('#333');
            this.led.fill('#2f3542');
            this.powerBtn.fill('#ff4757');
            this.knobPointer.rotation(0);
        } else {
            this.voltageText.text(this.voltage.toFixed(1));
            this.voltageText.fill('#2ed573');
            this.led.fill('#ff4757'); // 开机灯亮
            this.powerBtn.fill('#2ed573');
            // 旋钮角度同步：电压 0-24 对应旋转 -150到150度
            const angle = (this.voltage / this.maxVoltage) * 300 - 150;
            this.knobPointer.rotation(angle);
        }
        this.layer.batchDraw();
    }
}