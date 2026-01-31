export class Gauge {
    constructor(options) {
        this.min = options.min ?? 0;
        this.max = options.max ?? 100;

        // ✔ 船舶仪表标准：270°,这里采用-120° ~ +120°，240度
        this.startAngle = -120;
        this.endAngle = 120;

        // 半径限定在 [70, 140]
        this.radius = Math.max(70, Math.min(140, options.radius ?? 130));
        this.textRadius = this.radius - 26;

        this.layer = options.layer;

        this.group = new Konva.Group({
            x: options.x,
            y: options.y,
            id: options.id,
            name: options.name,
            draggable: true
        });

        // 保存名称，避免直接访问 Konva 节点属性不可靠
        this.title = options.name ?? '';

        this.layer.add(this.group);

        // 顺序非常关键（从底到顶）
        this._drawShell();
        this._drawZones();
        this._drawTicks();
        this._drawPointer();
        this._drawCenter();
        this._drawLcd();
        this._drawname();
    }

    /* ===============================
       数值 → 角度（唯一映射）
    =============================== */
    valueToAngle(value) {
        const ratio = (value - this.min) / (this.max - this.min);
        return this.startAngle + ratio * (this.endAngle - this.startAngle);
    }
    /* ===============================
       仪表外框
    =============================== */
    _drawShell(){
        this.group.add(
            new Konva.Circle({
                x: 0,
                y: 0,
                radius: this.radius + 10,
                stroke: '#333',
                strokeWidth: 4,
                // 金属质感：径向渐变
                fillRadialGradientStartPoint: { x: -20, y: -20 },
                fillRadialGradientStartRadius: 0,
                fillRadialGradientEndPoint: { x: 20, y: 20 },
                fillRadialGradientEndRadius: this.radius + 10,
                fillRadialGradientColorStops: [0, '#ffffff', 0.5, '#d0d6da', 1, '#9aa1a5']
            })
        );
    }
    

    /* ===============================
       安全区（绿 / 黄 / 红）
    =============================== */
    _drawZones() {
        const zones = [
            { from: 0.0, to: 0.7, color: '#2ecc71' },
            { from: 0.7, to: 0.9, color: '#f1c40f' },
            { from: 0.9, to: 1.0, color: '#e74c3c' }
        ];

        zones.forEach(z => {
            const angle = (z.to - z.from) * (this.endAngle - this.startAngle);
            const rotation = this.startAngle - 90 + z.from * (this.endAngle - this.startAngle);

            this.group.add(
                new Konva.Arc({
                    x: 0,
                    y: 0,
                    innerRadius: this.radius - 12,
                    outerRadius: this.radius,
                    angle: angle,
                    rotation: rotation,
                    fill: z.color,
                    opacity: 0.65
                })
            );
        });
    }

    /* ===============================
       刻度（完全按数值生成）
    =============================== */
    _drawTicks() {
        const majorStep = (this.max-this.min)/10;   // 主刻度：10
        const minorStep = (this.max-this.min)/20;    // 副刻度：5（船舶常见）

        for (let v = this.min; v <= this.max + 0.0001; v += minorStep) {

            const angle = this.valueToAngle(v);
            const rad = Konva.getAngle(angle - 90);

            const isMajor = v % majorStep === 0;
            const len = isMajor ? 16 : 8;

            // 刻度线
            this.group.add(
                new Konva.Line({
                    points: [
                        (this.radius - len) * Math.cos(rad),
                        (this.radius - len) * Math.sin(rad),
                        this.radius * Math.cos(rad),
                        this.radius * Math.sin(rad)
                    ],
                    stroke: '#111',
                    strokeWidth: isMajor ? 2 : 1
                })
            );

            // 主刻度数字
            if (isMajor) {
                const textRad = Konva.getAngle(angle - 90);

                this.group.add(
                    new Konva.Text({
                        x: this.textRadius * Math.cos(textRad) - 14,
                        y: this.textRadius * Math.sin(textRad) - 6,
                        width: 28,
                        align: 'center',
                        text: v.toString(),
                        fontSize: 11,
                        fill: '#000'
                    })
                );
            }
        }
    }

    /* ===============================
       指针
    =============================== */
    _drawPointer() {
        this.pointer = new Konva.Line({
            points: [0, 0, 0, -(this.radius - 25)],
            stroke: '#c0392b',
            strokeWidth: 3,
            lineCap: 'round',
            rotation: this.startAngle
        });
        this.group.add(this.pointer);
    }
    /* ===============================
       指针的轴心点
    =============================== */
    _drawCenter() {
        this.group.add(
            new Konva.Circle({
                x: 0,
                y: 0,
                radius: 4,
                fill: '#333'
            })
        );
    }
    /* ===============================
       中心下方的LCD显示屏
    =============================== */
    _drawLcd() {
        const w = 60;
        const h = 24;
        const x = -w / 2;
        // 向上移动一点（原 0.45 -> 0.38）
        const y = this.radius * 0.38;

        this.lcdGroup = new Konva.Group({
            x: 0,
            y: y
        });

        // 外壳（浅金属 + 暗边）
        this.lcdGroup.add(new Konva.Rect({
            x: x,
            y: 0,
            width: w,
            height: h,
            cornerRadius: 6,
            stroke: '#333',
            strokeWidth: 1,
            fillLinearGradientStartPoint: { x: 0, y: 0 },
            fillLinearGradientEndPoint: { x: 0, y: h },
            fillLinearGradientColorStops: [0, '#ececec', 0.6, '#c8c8c8', 1, '#9a9a9a']
        }));

        // 内部显示窗（绿色背光）
        this.lcdGroup.add(new Konva.Rect({
            x: x + 4,
            y: 4,
            width: w - 8,
            height: h - 8,
            cornerRadius: 4,
            fillLinearGradientStartPoint: { x: 0, y: 0 },
            fillLinearGradientEndPoint: { x: 0, y: h - 8 },
            fillLinearGradientColorStops: [0, '#0b2a0b', 0.6, '#042404', 1, '#072207']
        }));

        // 数字文本
        this.lcdText = new Konva.Text({
            x: x + 4,
            y: 4,
            width: w - 8,
            align: 'center',
            text: this.min.toString(),
            fontSize: 14,
            fontFamily: 'monospace',
            fill: '#7fff7f'
        });
        this.lcdGroup.add(this.lcdText);

        this.group.add(this.lcdGroup);
    }
    /* ===============================
       在轴心上方显示仪表名称，this.group.name 属性
    =============================== */ 
    _drawname() {
        const w = 140;
        const h = 20;
        const x = -w / 2;

        // 名称向下移动一些，且确保位于轴心（y=0）下方
        let y;
        if (this.lcdGroup) {
            // 将名称放在液晶屏上方一点，但仍保持在轴心下方
            y = Math.max(8, this.lcdGroup.y() - 8);
        } else {
            y = Math.max(8, this.radius * 0.15);
        }

        this.nameText = new Konva.Text({
            x: x,
            y: y,
            width: w,
            align: 'center',
            text: String(this.title ?? ''),
            fontSize: 14,
            fontStyle: 'bold',
            fill: '#222',
            listening: false
        });

        this.group.add(this.nameText);
    }
    /* ===============================
       设置数值（动画）
    =============================== */
    setValue(value) {
        value = Math.max(this.min, Math.min(this.max, value));
        const angle = this.valueToAngle(value);

        if (this.tween) this.tween.destroy();
        if (this._lcdInterval) {
            clearInterval(this._lcdInterval);
            this._lcdInterval = null;
        }

        const startValue = this._currentValue ?? this.min;
        const endValue = value;
        this._currentValue = endValue;

        // 指针动画
        this.tween = new Konva.Tween({
            node: this.pointer,
            rotation: angle,
            duration: 0.8,
            easing: Konva.Easings.EaseInOut
        });
        this.tween.play();

        // LCD 数字动画（线性插值）
        const duration = 800;
        const startTime = Date.now();
        this._lcdInterval = setInterval(() => {
            const t = Math.min(1, (Date.now() - startTime) / duration);
            const cur = startValue + (endValue - startValue) * t;
            this.lcdText.text(Math.round(cur).toString());
            if (this.layer && this.layer.batchDraw) this.layer.batchDraw();
            if (t === 1) {
                clearInterval(this._lcdInterval);
                this._lcdInterval = null;
            }
        }, 30);
    }
}