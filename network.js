export class NetworkManager {
    constructor(baseUrl, onMessage) {
        this.baseUrl = baseUrl;
        this.onMessage = onMessage;
        this.ws = null;
    }
    // 从 Worker 的 Durable Object 获取已注册的班级列表
    async fetchClasses() {
        try {
            const res = await fetch(`https://${this.baseUrl}/get-classes?t=${Date.now()}`);
            const data = await res.json();
            return data && data.length > 0 ? data : ["默认班级"];
        } catch (e) {
            console.error("无法获取班级列表", e);
            return ["默认班级"];
        }
    }
    connect(role, info) {
        if (this.ws) this.ws.close();
        const params = new URLSearchParams({ role, info: JSON.stringify(info) });
        this.ws = new WebSocket(`wss://${this.baseUrl}?${params.toString()}`);
        this.ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
        this.ws.onclose = () => setTimeout(() => this.connect(role, info), 3000);
    }
    send(data) {
        if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(data));
    }
}