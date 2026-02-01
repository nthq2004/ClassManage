/**
 * DC 24V 可调直流电源模拟器
 * 功能：电压调节、开关控制、状态指示、手动连线端子集成
 */
export class DCPower {
    constructor(config) {

        this.layer = config.layer;
        this.x = config.x || 100;
        this.y = config.y || 100;
        // 动态尺寸：最小宽100，高80,最大宽240，高220，默认120x100
        this.width = Math.max(120, Math.min(config.width ||120, 160));
        this.height = Math.max(140, Math.min(config.height||140, 180));
        // 状态变量
        this.isOn = false;
        this.voltage = 24;
        this.maxVoltage = 24;
        this.terminals = []; // 存储接线柱对象

        // Konva 组
        this.group = new Konva.Group({
            x: this.x,
            y: this.y,
            draggable: true,
            id: config.id || 'dcPower'
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
        this.chassis = new Konva.Rect({
            width: this.width,
            height: this.height,
            fill: '#ecf0f1',
            stroke: '#2c3e50',
            strokeWidth: 3,
            cornerRadius: 5
        });
        this.group.add(this.chassis);
    }
    // 2. 铭牌
    _drawNameplate() {
        const title = new Konva.Text({
            x: 10, y: 5,
            text: `DC 24V`,
            fontSize: 10,
            fontStyle: 'bold'
        });
        const school = new Konva.Text({
            x: this.width - 60, y: 5,
            text: '江苏航院',
            fontSize: 10
        });
        this.group.add(title, school);
    }
    // 3. 液晶显示屏
    _drawLCD() {
        // 液晶屏高度固定，宽度随设备调整
        const lcdHeight = 30;
        const lcdBg = new Konva.Rect({
            x: 10, y: 20,
            width: this.width - 20,
            height: lcdHeight,
            fill: '#000',
            cornerRadius: 3
        });

        this.voltageText = new Konva.Text({
            x: 10, y: 24,
            width: this.width - 20,
            text: 'OFF',
            fontSize: 22,
            fontFamily: 'monospace',
            fill: '#00ff00',
            align: 'center'
        });

        this.group.add(lcdBg, this.voltageText);
    }

    // 4. 控制面板（开关、旋钮、指示灯）
    _drawControls() {
        const ctrlY = 56; // 控制区起始高度

        // --- 凹陷式电源键 ---
        this.powerBtnGroup = new Konva.Group({ x: 20, y: ctrlY });

        this.powerBtnBase = new Konva.Rect({
            width: 30, height: 20,
            fill: '#bdc3c7',
            stroke: '#7f8c8d',
            strokeWidth: 1,
            shadowColor: '#000',
            shadowBlur: 5,
            shadowOffset: { x: 2, y: 2 },
            cornerRadius: 2
        });

        const btnText = new Konva.Text({
            x: -5, y: 25,
            text: '电源键',
            fontSize: 10,
            fill: '#34495e'
        });

        this.powerBtnGroup.add(this.powerBtnBase, btnText);
        this.powerBtnGroup.on('mousedown touchstart', () => {
            this.isOn = !this.isOn;
            this._updateBtnStyle();
            this.update();
        });

        // --- 带刻度的旋钮 ---
        const knobX = this.width - 40;
        const knobY = ctrlY + 10;
        this.knobGroup = new Konva.Group({ x: knobX, y: knobY });

        // 绘制刻度线和数字
        const scaleValues = [0, 4, 8, 12, 16, 20, 24];
        scaleValues.forEach(v => {
            // 映射 0-24V 到旋钮的角度（-150° 到 150°）
            const angle = (v / 24) * 300 - 150;
            const rad = (angle - 90) * Math.PI / 180;
            const r = 28; // 刻度半径

            const txt = new Konva.Text({
                x: r * Math.cos(rad) - 10,
                y: r * Math.sin(rad) - 5,
                text: v.toString(),
                fontSize: 9,
                width: 20,
                align: 'center',
                fill: '#7f8c8d'
            });
            this.knobGroup.add(txt);
        });

        const knobCircle = new Konva.Circle({
            radius: 18,
            fill: '#95a5a6',
            stroke: '#34495e',
            cursor: 'pointer'
        });

        this.knobPointer = new Konva.Line({
            points: [0, 0, 0, -15],
            stroke: '#e74c3c',
            strokeWidth: 2,
            lineCap: 'round'
        });

        this.knobGroup.add(knobCircle, this.knobPointer);

        // 旋钮逻辑
        knobCircle.on('mousedown touchstart', (e) => {
            e.cancelBubble = true;
            const startY = e.evt.clientY || e.evt.touches[0].clientY;
            const startV = this.voltage;
            const onMove = (me) => {
                const cy = me.clientY || (me.touches ? me.touches[0].clientY : me.clientY);
                this.voltage = Math.max(0, Math.min(24, startV + (startY - cy) * 0.1));
                this.update();
            };
            const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });

        this.group.add(this.powerBtnGroup, this.knobGroup);
    }

    // 5. 接线柱（关键：集成手动连线属性）
    _drawTerminals() {
        const termY = this.height; // 对齐底边线
        const terminalData = [
            { label: 'p', color: '#ff4757', x: this.width * 0.7 }, // 红
            { label: 'n', color: '#2f3542', x: this.width * 0.3 } // 黑
        ];

        terminalData.forEach(data => {
            const term = new Konva.Circle({
                x: terminalData.x,
                y: termY,
                radius: 8,
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

    // 更新电源键样式
    _updateBtnStyle() {
        if (this.isOn) {
            // 压下效果：阴影消失，位置微移
            this.powerBtnBase.setAttrs({
                shadowBlur: 0,
                shadowOffset: { x: 0, y: 0 },
                x: 1, y: 1,
                fill: '#bdc3c7'
            });
        } else {
            // 凸起效果
            this.powerBtnBase.setAttrs({
                shadowBlur: 5,
                shadowOffset: { x: 2, y: 2 },
                x: 0, y: 0,
                fill: '#bdc3c7'
            });
        }
    }
    // 更新显示逻辑
    update() {
        if (!this.isOn) {
            this.voltageText.text('OFF');
            this.voltageText.fill('#333');
        } else {
            this.voltageText.text(this.voltage.toFixed(1) + ' V');
            this.voltageText.fill('#00ff00');
            const angle = (this.voltage / 24) * 300 - 150;
            this.knobPointer.rotation(angle);
        }
        this.layer.batchDraw();
    }
}