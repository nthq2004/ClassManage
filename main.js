// main.js
import { NetworkManager } from './network.js';
import { SimulationEngine } from './simulation.js';

let myInfo, myRole, isDemo = false, selectedId = null;
const BASE_URL = "api.wangaijun.click";

// 1. 初始化引擎：定义点击设备后的行为
const engine = new SimulationEngine('container', (id, state) => {
    // 老师必须开演示模式才能操作，学生直接操作
    if (myRole === 'TEACHER' && !isDemo) {
        alert("请先开启[演示模式]");
        return;
    }
    
    engine.update(id, state); // 先更新自己画面

    // 发送消息
    window.network.send({
        type: myRole === 'TEACHER' ? 'TEACHER_DEMO' : 'STUDENT_ACTION',
        deviceId: id,
        action: state,
        fromStudent: myInfo.userId // 带上学号，方便老师监控
    });
});
engine.addPump('PUMP_01', 50, 50);

// 2. 初始化网络：处理接收到的消息
window.network = new NetworkManager(BASE_URL, (data) => {
    // A. 接收在线名单
    if (data.type === 'USER_LIST') {
        window.currentUsers = data.users; // 存入全局，方便渲染
        renderList(data.users);
    }
    
    // B. 学生端：接收老师的演示指令
    if (myRole === 'STUDENT' && data.type === 'TEACHER_DEMO') {
        document.getElementById('demo-mask').style.display = 'block';
        engine.update(data.deviceId, data.action);
    }
    
    // C. 教师端：核心监控逻辑
    if (myRole === 'TEACHER' && !isDemo) {
        // 如果收到的消息是【学生操作】，且该学生【正是选中的那个人】
        if (data.type === 'STUDENT_ACTION' && data.fromStudent === selectedId) {
            engine.update(data.deviceId, data.action);
        }
    }
});

// 3. UI 全局函数挂载（必须挂在 window 上才能被 HTML 访问）
window.toggleFullscreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
};

window.handleLogin = () => {
    const role = document.getElementById('userRole').value;
    const name = document.getElementById('regUserName').value;
    const info = role === 'TEACHER' 
        ? { userName: name, className: "Lobby", userId: "T-"+Date.now() }
        : { userName: name, className: document.getElementById('regClassName').value, userId: document.getElementById('regUserId').value };
    
    localStorage.setItem('sim_user', JSON.stringify(info));
    localStorage.setItem('sim_role', role);
    location.reload();
};

window.toggleDemo = () => {
    isDemo = !isDemo;
    const btn = document.getElementById('demoBtn');
    btn.innerText = isDemo ? "演示：开启" : "演示模式";
    btn.className = `demo-btn ${isDemo ? 'demo-on' : 'demo-off'}`;
    if (isDemo) selectedId = null; // 演示时取消监控
    window.network.connect(myRole, myInfo);
};

window.changeClass = (c) => {
    myInfo.className = c;
    localStorage.setItem('sim_user', JSON.stringify(myInfo));
    location.reload();
};

// 选中学生进行监控
window.selectS = (id) => {
    if (isDemo) return;
    selectedId = (selectedId === id) ? null : id;
    renderList(window.currentUsers || []); // 刷新样式
};

function renderList(users) {
    const el = document.getElementById('student-list');
    if (!el || myRole !== 'TEACHER') return;
    el.innerHTML = users.filter(u => u.role === 'STUDENT').map(u => `
        <div class="student-item ${selectedId === u.userId ? 'active' : ''}" onclick="selectS('${u.userId}')">
            ${u.userName} (${u.userId})
        </div>
    `).join('');
}

// 4. 程序启动
const saved = localStorage.getItem('sim_user');
if (saved) {
    myInfo = JSON.parse(saved);
    myRole = localStorage.getItem('sim_role');
    if (myRole === 'TEACHER') {
        document.getElementById('sidebar').style.display = 'flex';
        window.network.fetchClasses().then(list => {
            const sel = document.getElementById('classSelect');
            sel.innerHTML = list.map(c => `<option value="${c}" ${c === myInfo.className ? 'selected' : ''}>${c}</option>`).join('');
        });
    }
    window.network.connect(myRole, myInfo);
} else {
    document.getElementById('reg-overlay').style.display = 'flex';
}