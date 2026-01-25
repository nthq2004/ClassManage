// main.js
import { NetworkManager } from './network.js';
import { SimulationEngine } from './simulation.js';

let myInfo, myRole, isDemo = false, selectedId = null;
const BASE_URL = "api.wangaijun.click";

// 1. 初始化引擎
const engine = new SimulationEngine('container', (id, state) => {
    if (myRole === 'TEACHER' && !isDemo) return alert("请开启演示模式");
    engine.update(id, state);
    network.send({
        type: myRole === 'TEACHER' ? 'TEACHER_DEMO' : 'STUDENT_ACTION',
        deviceId: id, action: state, fromStudent: myInfo.userId
    });
});
engine.addPump('PUMP_01', 50, 50);
window.engine = engine; // 挂载到全局方便 resize 访问

// 2. 初始化网络
// 确保 network 实例化在 window 上，防止作用域丢失
window.network = new NetworkManager(BASE_URL, (data) => {
    console.log("收到消息:", data.type); // 增加调试日志
    if (data.type === 'USER_LIST') renderList(data.users);
    
    // 监控核心逻辑：老师在非演示模式下，接收选中学生的消息
    if (myRole === 'TEACHER' && !isDemo) {
        if (data.type === 'STUDENT_ACTION' && data.fromStudent === selectedId) {
            engine.update(data.deviceId, data.action);
        }
    }
    
    // 演示逻辑：学生强制接收老师的消息
    if (myRole === 'STUDENT' && data.type === 'TEACHER_DEMO') {
        engine.update(data.deviceId, data.action);
    }
});

// 3. UI 交互
window.toggleFullscreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
    } else {
        document.exitFullscreen();
    }
};

// 修复点击学生列表的逻辑
window.selectS = (id) => {
    if (isDemo) return;
    // 如果点的是当前已选中的，则取消选中；否则切换到新 ID
    selectedId = (selectedId === id) ? null : id;
    
    // 立即重绘列表以显示选中状态
    const savedUsers = JSON.parse(localStorage.getItem('last_user_list') || "[]");
    renderList(savedUsers);
};

window.handleLogin = async () => {
    const role = document.getElementById('userRole').value;
    const name = document.getElementById('regUserName').value;
    if (role === 'TEACHER') {
        if (document.getElementById('regInviteCode').value !== "147258") return alert("验证失败");
        myInfo = { userName: name, className: "Lobby", userId: "T-" + Date.now() };
    } else {
        myInfo = { userName: name, className: document.getElementById('regClassName').value, userId: document.getElementById('regUserId').value };
    }
    localStorage.setItem('sim_user', JSON.stringify(myInfo));
    localStorage.setItem('sim_role', role);
    location.reload();
};

window.toggleDemo = () => {
    isDemo = !isDemo;
    const btn = document.getElementById('demoBtn');
    btn.innerText = isDemo ? "演示中" : "演示模式";
    btn.className = `demo-btn ${isDemo ? 'demo-on' : 'demo-off'}`;
    network.connect(myRole, myInfo);
};

window.changeClass = (c) => {
    myInfo.className = c;
    localStorage.setItem('sim_user', JSON.stringify(myInfo));
    location.reload();
};

function renderList(users) {
    const el = document.getElementById('student-list');
    if (!el) return;
    el.innerHTML = users.filter(u => u.role === 'STUDENT').map(u => `
        <div class="student-item ${selectedId === u.userId ? 'active' : ''}" onclick="window.selectS('${u.userId}')">
            ${u.userName}
        </div>
    `).join('');
}

window.selectS = (id) => {
    selectedId = (selectedId === id) ? null : id;
    network.send({ type: 'REFRESH' });
};

// 启动
const saved = localStorage.getItem('sim_user');
if (saved) {
    myInfo = JSON.parse(saved);
    myRole = localStorage.getItem('sim_role');
    if (myRole === 'TEACHER') {
        document.getElementById('sidebar').style.display = 'flex';
        network.fetchClasses().then(list => {
            const sel = document.getElementById('classSelect');
            sel.innerHTML = list.map(c => `<option value="${c}" ${c === myInfo.className ? 'selected' : ''}>${c}</option>`).join('');
        });
    }
    network.connect(myRole, myInfo);
} else {
    document.getElementById('reg-overlay').style.display = 'flex';

}
