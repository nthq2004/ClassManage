// network.js
export class NetworkManager {
    constructor(baseUrl, onMessage) {
        this.baseUrl = baseUrl;
        this.onMessage = onMessage;
        this.ws = null;
    }

    async fetchClasses() {
        const res = await fetch(`https://${this.baseUrl}/get-classes?t=${Date.now()}`);
        return await res.json();
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