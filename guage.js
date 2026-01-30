export class Gauge {
    constructor(options) {
        this.min = options.min ?? 0;
        this.max = options.max ?? 100;

        // ✔ 船舶仪表标准：270°,这里采用-120° ~ +120°，240度
        this.startAngle = -120;
        this.endAngle = 120;

        this.radius = options.radius ?? 130;
        this.textRadius = this.radius - 26;

        this.layer = options.layer;

        this.group = new Konva.Group({
            x: options.x,
            y: options.y,
            id: options.id,
            name: options.name,
            draggable: true
        });

        this.layer.add(this.group);

        // 顺序非常关键（从底到顶）
        this._drawZones();
        this._drawTicks();
        this._drawPointer();
        this._drawCenter();
    }

    /* ===============================
       数值 → 角度（唯一映射）
    =============================== */
    valueToAngle(value) {
        const ratio = (value - this.min) / (this.max - this.min);
        return this.startAngle + ratio * (this.endAngle - this.startAngle);
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
        const majorStep = 10;   // 主刻度：10
        const minorStep = 5;    // 副刻度：5（船舶常见）

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
       设置数值（动画）
    =============================== */
    setValue(value) {
        value = Math.max(this.min, Math.min(this.max, value));
        const angle = this.valueToAngle(value);

        if (this.tween) this.tween.destroy();

        this.tween = new Konva.Tween({
            node: this.pointer,
            rotation: angle,
            duration: 0.8,
            easing: Konva.Easings.EaseInOut
        });

        this.tween.play();
    }
}