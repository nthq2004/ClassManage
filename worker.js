var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// --- 1. 全局跨域配置 ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // 允许 class.wangaijun.click 访问
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};
// worker.js
var GlobalRegistry = class {
  static {
    __name(this, "GlobalRegistry");
  }
  constructor(state) {
    this.state = state;
  }
  async fetch(request) {
    let classes = await this.state.storage.get("classes") || [];
    const url = new URL(request.url);

    // 注册新班级
    if (url.pathname === "/register") {
      const name = url.searchParams.get("name");
      if (name && !classes.includes(name)) {
        classes.push(name);
        await this.state.storage.put("classes", classes);
      }
      return new Response(JSON.stringify(classes));
    }

    // 获取班级列表
    if (url.pathname === "/list") {
      return new Response(JSON.stringify(classes));
    }

    return new Response("Registry OK");
  }
};

var SimSessionV2 = class {
  static {
    __name(this, "SimSessionV2");
  }
  constructor(state) { this.state = state; this.sessions = []; }
  async fetch(request) {
    //client = 浏览器 WebSocket 的“替身”，Worker WebSocket：定义方式不同事件用 addEventListener；server.accept()激活server端。session.ws.send(...)直接发给浏览器
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    const info = JSON.parse(url.searchParams.get("info"));
    //每次用户进来时，建立 WebSocketPair()，client与浏览器建立关联，Sever写数据到Client，就相当于发送给浏览器。
    server.accept();
    //sessions集合：包含了所有浏览器的server集合，每个ws对象就是一个server。以后该Websocket通道上的消息由addEventListener的箭头函数处理。
    const session = { ws: server, role, ...info };
    this.sessions.push(session);

    server.addEventListener("message", msg => {
      const data = JSON.parse(msg.data);
      // 广播逻辑，模式同步信息广播
      if (data.type === "MODE_SYNC") {
        this.broadcast(data);
      } 
      else if (data.type === "ST_SELECT" ) {
        this.broadcast(data);
         } 
      else if (data.type === "TE_CMD" && data.mode === "DEMO") {
        this.broadcastToStudents(data);
         } 
      else if (data.type === "ST_CMD" && data.mode === "PRACTICE") {
        this.broadcastToTeachers(data);
      }
    });

  //如果某个浏览器端关闭了，server端收到“close”信息，从sessions中过滤出其他server，该server不要了。
    server.addEventListener("close", () => {
      this.sessions = this.sessions.filter(s => s.ws !== server);
      //广播在线用户变化；
      this.broadcastUserList();
    });

    this.broadcastUserList();
    return new Response(null, { status: 101, webSocket: client });
  }

  //建立的每一个WebSOCKET通道，都发送信息。
  broadcast(data) {
    this.sessions.forEach(s => s.ws.send(JSON.stringify(data)));
  }
  //过滤出角色为教师的Server，广播发送数据
  broadcastToTeachers(data) {
    this.sessions.filter(s => s.role === "TEACHER").forEach(s => s.ws.send(JSON.stringify(data)));
  }
    //过滤出角色为学生的Server，广播发送数据
  broadcastToStudents(data) {
    this.sessions.filter(s => s.role === "STUDENT").forEach(s => s.ws.send(JSON.stringify(data)));
  }
  //筛选出特定用户，发送数据
  sendTo(uid, data) {
    this.sessions.filter(s => s.userId === uid).forEach(s => s.ws.send(JSON.stringify(data)));
  }

  //对sessions的每一个元素，提取用户ID、用户名、角色组成用户列表，广播信息。信息格式，type:"USER_LIST"
  broadcastUserList() {
    const users = this.sessions.map(s => ({ userId: s.userId, userName: s.userName, role: s.role }));
    //广播发送当前班级的用户列表。这个用户列表只发送给教师。
    this.broadcastToTeachers({ type: "USER_LIST", users });
  }
};

var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);

    // [1] 处理 OPTIONS 预检请求 (解决跨域核心)
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // [2] 获取班级列表接口
    if (url.pathname === "/get-classes") {
      try {
        const id = env.GLOBAL_REGISTRY.idFromName("global");
        const registry = env.GLOBAL_REGISTRY.get(id);
        const response = await registry.fetch(new Request(url.origin + "/list"));
        const data = await response.json();
        
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify(["默认班级"]), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // [3] 处理 WebSocket 连接
    if (request.headers.get("Upgrade") === "websocket") {
      const role = url.searchParams.get("role");
      const info = JSON.parse(url.searchParams.get("info") || "{}");

      // 学生登录时，在全局中心注册班级名
      if (role === "STUDENT" && info.className) {
        const regId = env.GLOBAL_REGISTRY.idFromName("global");
        const registry = env.GLOBAL_REGISTRY.get(regId);
        await registry.fetch(new Request(`${url.origin}/register?name=${encodeURIComponent(info.className)}`));
      }

      // 进入班级对应的 Durable Object 房间
      const roomId = env.SIM_SESSION.idFromName(info.className || "默认班级");
      const room = env.SIM_SESSION.get(roomId);
      return room.fetch(request);
    }

    // [4] 默认返回
    return new Response("Marine Simulation Engine is Online", { headers: corsHeaders });
  }
};
export {
  GlobalRegistry,
  SimSessionV2,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
