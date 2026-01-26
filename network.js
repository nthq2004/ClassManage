export class NetworkManager {
    constructor(baseUrl, onMessage) {
        this.baseUrl = baseUrl;
        this.onMessage = onMessage;
        this.ws = null;
    }
    async fetchClasses() {
        try {
            const res = await fetch(`https://${this.baseUrl}/get-classes`);
            return await res.json();
        } catch (e) { return ["教学班级01", "教学班级02"]; }
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