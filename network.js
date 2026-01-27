export class NetworkManager {
    constructor(baseUrl, onMessage) {
        this.baseUrl = baseUrl;
        this.onMessage = onMessage;
        this.ws = null;
    }

    /*调用 DO 全局注册中心获取班级列表，async将函数执行异步化、回调化，遇到await,直接返回promise，js函数继续执行，下面的代码入口为回调（等到fetch执行完成），往下执行又是一个await再次异步，等待回调。跟以前的.then执行回调类似。fetch() 是一个“非阻塞的网络请求启动器”它立即返回一个 Promise，真正的网络 I/O 在浏览器的网络线程中完成，结果通过 微任务（Promise） 回到 JS。*/
    async fetchClasses() {
        try {
            /*fetch只做了三件事：1️⃣ 创建 Request 对象2️⃣ 把请求交给浏览器网络层（不是 JS 线程）3️⃣ 立刻返回一个 Promise（pending）
            POST /login?name=aaa?pasword=123  HTTP/1.1
            Host: api.example.com
            Content-Type: application/json
            Content-Length: 42

            {"user":"admin","password":"123456"}*/
            const res = await fetch(`https://${this.baseUrl}/get-classes`);
            /*json函数将Response对象解析成json对象：
            Response {
                status: 200,
                ok: true,
                headers: Headers,
                body: ReadableStream
                } */
            const data = await res.json();
            /*一个完整 HTTP Response 示例
            HTTP/1.1 200 OK
            Content-Type: application/json
            Content-Length: 21

            ["一班","二班"] */
            return data.length > 0 ? data : ["默认班级"];
        } catch (e) { return ["默认班级"]; }
    }

    connect(role, info) {
        if (this.ws) this.ws.close();
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const params = new URLSearchParams({ role, info: JSON.stringify(info) });
        /*此刻发生的网络事件（重要）：TCP 三次握手,HTTP Upgrade 请求,切换为 WebSocket 协议 ,传递的参数是 角色和 用户信息（班级、姓名、学号）*/
        this.ws = new WebSocket(`${protocol}://${this.baseUrl}?${params.toString()}`);
        /*main.js要定义一个网络消息处理函数，挂载在ws上，处理ws服务器端(worker.js)传回来的消息 */
        this.ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
        this.ws.onclose = () => setTimeout(() => this.connect(role, info), 3000);
    }

    send(data) {
        /*?.如果this.ws不存在，不报错，返回undefined.
        const obj = { a: 1, b: "hello", c: true };  这是对象
        JSON.stringify(obj); '{"a":1,"b":"hello","c":true}'这是字符串  */
        if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(data));
    }
}