export class PressureTransmitter {
    constructor(config) {
        this.layer = config.layer;
        this.x = config.x || 100;
        this.y = config.y || 100;
        this.id = config.id || 'pt_01';

        // 动态尺寸设置：最小宽140, 最小高180
        this.width = Math.max(140, Math.min(config.width || 140,200));
        this.height = Math.max(180, Math.min(config.height || 180,240));

        // 核心参数
        this.inputPressure = 0;
        this.rangeMax = config.rangeMax || 2.0;
        this.zeroAdj = 0;
        this.spanAdj = 1.0;
        this.isPowered = false;

        this.group = new Konva.Group({
            x: this.x,
            y: this.y,
            draggable: true,
            id: this.id
        });

        this._init();
    }

    _init() {
        this._drawEnclosure();      // 绘制主体仓位
        this._drawLCD();            // 绘制显示屏
        this._drawKnobs();          // 绘制拟物旋钮
        this._drawTerminals();      // 整合后的端口绘制
        
        this.layer.add(this.group);
        this.layer.draw();
        this.update(0, false);
    }

    _drawEnclosure() {
        // 1. 上方横置电路仓
        const barHeight = 45;
        this.elecBar = new Konva.Rect({
            x: 0, y: 0,
            width: this.width,
            height: barHeight,
            fill: 'linear-gradient(startPoint: {x:0, y:0}, endPoint: {x:0, y:45}, colorStops: [0, "#95a5a6", 1, "#7f8c8d"])',
            stroke: '#2c3e50',
            strokeWidth: 2,
            cornerRadius: 4
        });

        // 2. 中间连接颈部
        const neck = new Konva.Rect({
            x: this.width / 2 - 15, y: barHeight,
            width: 30, height: 20,
            fill: '#7f8c8d',
            stroke: '#2c3e50'
        });

        // 3. 圆形表头主体
        const bodyRadius = Math.min(this.width, this.height) * 0.35;
        this.mainBody = new Konva.Circle({
            x: this.width / 2,
            y: barHeight + 20 + bodyRadius,
            radius: bodyRadius,
            fill: '#bdc3c7',
            stroke: '#7f8c8d',
            strokeWidth: 3,
            shadowBlur: 10,
            shadowOpacity: 0.2
        });

        this.group.add(this.elecBar, neck, this.mainBody);
        this.bodyCenterY = this.mainBody.y(); // 记录中心用于后续LCD定位
    }

    _drawLCD() {
        const lcdW = 60, lcdH = 35;
        this.lcdBg = new Konva.Rect({
            x: this.width / 2 - lcdW / 2,
            y: this.bodyCenterY - lcdH / 2,
            width: lcdW, height: lcdH,
            fill: '#000',
            cornerRadius: 2
        });

        this.lcdText = new Konva.Text({
            x: this.width / 2 - lcdW / 2,
            y: this.bodyCenterY - 7,
            width: lcdW,
            text: '',
            fontSize: 16,
            fontFamily: 'monospace',
            fill: '#00ff00',
            align: 'center'
        });

        this.group.add(this.lcdBg, this.lcdText);
    }

    _drawKnobs() {
        const knobSpecs = [
            { id: 'zero', x: 30, label: 'ZERO' },
            { id: 'span', x: this.width - 30, label: 'SPAN' }
        ];

        knobSpecs.forEach(spec => {
            const knobGroup = new Konva.Group({ x: spec.x, y: 22 });
            
            // 旋钮底座（下沉感）
            const base = new Konva.Circle({
                radius: 14,
                fill: '#747d8c',
                stroke: '#2f3542',
                strokeWidth: 1
            });

            // 转子（带转动指示槽）
            const rotor = new Konva.Group();
            const rotorCircle = new Konva.Circle({
                radius: 10,
                fill: 'radial-gradient(startRadius: 0, endRadius: 10, colorStops: [0, "#ced6e0", 1, "#a4b0be"])',
                stroke: '#2f3542'
            });
            const slot = new Konva.Rect({
                x: -1, y: -8,
                width: 2, height: 16,
                fill: '#2f3542',
                cornerRadius: 1
            });
            const dot = new Konva.Circle({ y: -6, radius: 1.5, fill: '#ff4757' }); // 红色指向点
            rotor.add(rotorCircle, slot, dot);

            const label = new Konva.Text({
                x: -15, y: -25,
                text: spec.label,
                fontSize: 9,
                fill: '#fff',
                fontStyle: 'bold'
            });

            knobGroup.add(base, rotor, label);

            // 增强转动感交互
            rotor.on('mousedown touchstart', (e) => {
                e.cancelBubble = true;
                const startY = e.evt.clientY || e.evt.touches[0].clientY;
                const startRot = rotor.rotation();

                const onMove = (me) => {
                    const cy = me.clientY || (me.touches ? me.touches[0].clientY : me.clientY);
                    const delta = (startY - cy) * 2; // 旋转灵敏度
                    rotor.rotation(startRot + delta);

                    // 映射数值
                    if (spec.id === 'zero') this.zeroAdj = (rotor.rotation() / 360) * 0.2;
                    else this.spanAdj = 1.0 + (rotor.rotation() / 360) * 0.2;
                    
                    this.update(this.inputPressure, this.isPowered);
                };
                const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });

            this.group.add(knobGroup);
        });
    }

    _drawTerminals() {
        // 1. 电气端口：左侧垂直分布
        const wirePositions = [
            { id: 'p', color: '#ff4757', y: 12 }, // 正极
            { id: 'n', color: '#2f3542', y: 32 }  // 负极
        ];

        wirePositions.forEach(pos => {
            const term = new Konva.Circle({
                x: 0, y: pos.y,
                radius: 7,
                fill: pos.color,
                stroke: '#333',
                strokeWidth: 2,
                id: `${this.id}_term_${pos.id}`
            });
            term.setAttrs({ connType: 'wire', termId: term.id });
            this._bindTermEvent(term);
            this.group.add(term);
        });

        // 2. 气路端口：正下方凸出一半
        const pipePort = new Konva.Rect({
            x: this.width / 2 - 8,
            y: this.height - 6,
            width: 16, height: 12,
            fill: '#95a5a6',
            stroke: '#34495e',
            strokeWidth: 2,
            cornerRadius: 1,
            id: `${this.id}_pipe_i`
        });
        pipePort.setAttrs({ connType: 'pipe' , termId: pipePort.id });
        this._bindTermEvent(pipePort);
        this.group.add(pipePort);
    }

    _bindTermEvent(obj) {
        obj.on('mousedown touchstart', (e) => {
            e.cancelBubble = true;
            if (this.onTerminalClick) this.onTerminalClick(obj);
        });
    }

    update(p, hasPower) {
        this.inputPressure = p;
        this.isPowered = hasPower;

        if (!this.isPowered) {
            this.lcdText.text("");
            this.lcdBg.fill('#000');
        } else {
            this.lcdBg.fill('#1a1a1a');
            const val = (this.inputPressure + this.zeroAdj) * this.spanAdj;
            this.lcdText.text(Math.max(0, val).toFixed(2));
            this.lcdText.fill('#00ff00');
        }
        this.layer.batchDraw();
    }
}