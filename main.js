import { NetworkManager } from './network.js';
import { SimulationEngine } from './simulation.js';

const BASE_URL = "api.wangaijun.click";
let myInfo, myRole, currentMode = 'TRAIN';
window.selectedId = null;

const engine = new SimulationEngine('container', (id, state) => {
    window.network.send({
        type: myRole === 'TEACHER' ? 'TE_OP' : 'ST_OP',
        mode: currentMode, deviceId: id, action: state,
        from: myInfo.userId, to: window.selectedId
    });
});

window.network = new NetworkManager(BASE_URL, (data) => {
    if (data.type === 'USER_LIST') renderStudents(data.users);
    if (data.type === 'MODE_SYNC') {
        currentMode = data.mode;
        updateUI();
    }
    
    // 逻辑分发
    if (myRole === 'STUDENT') {
        if (currentMode === 'DEMO') {
            engine.isLocked = true;
            if (data.type === 'TE_OP') engine.updateDevice(data.deviceId, data.action);
        } else {
            engine.isLocked = false;
        }
    } else {
        if (currentMode === 'PRACTICE' && data.from === window.selectedId) {
            engine.updateDevice(data.deviceId, data.action);
        }
    }
});

window.handleLogin = () => {
    const role = document.getElementById('uRole').value;
    const info = { 
        userName: document.getElementById('uName').value,
        userId: role === 'STUDENT' ? document.getElementById('uSid').value : "T-"+Date.now(),
        className: role === 'STUDENT' ? document.getElementById('uCls').value : "Lobby"
    };
    if (role === 'TEACHER' && document.getElementById('uCode').value !== '147258') return alert("邀请码错误");
    localStorage.setItem('sim_v3_session', JSON.stringify({ role, info }));
    location.reload();
};

window.logout = () => { localStorage.clear(); location.reload(); };

window.setMode = (m) => {
    currentMode = m;
    window.network.send({ type: 'MODE_SYNC', mode: m });
    updateUI();
};

window.selectStudent = (id, name) => {
    window.selectedId = id;
    document.getElementById('status-mid').innerText = `正在监控: ${name}`;
    renderStudents(window.allUsers || []);
};

function updateUI() {
    const labels = { TRAIN: '自由训练', DEMO: '教师演示', PRACTICE: '学生演练' };
    document.getElementById('mode-display').innerText = labels[currentMode];
}

function renderStudents(users) {
    window.allUsers = users;
    const list = document.getElementById('student-list');
    if (!list) return;
    list.innerHTML = users.filter(u => u.role === 'STUDENT').map(u => `
        <div class="student-item ${window.selectedId === u.userId ? 'active' : ''}" 
             onclick="selectStudent('${u.userId}', '${u.userName}')">
            ${u.userName} (${u.userId})
        </div>
    `).join('');
}

// 初始化
const session = JSON.parse(localStorage.getItem('sim_v3_session'));
if (session) {
    myRole = session.role; myInfo = session.info;
    document.getElementById('info-left').innerText = `${myInfo.userName} | ${myInfo.className}`;
    if (myRole === 'TEACHER') {
        document.getElementById('sidebar').style.display = 'flex';
        document.getElementById('te-tools').classList.remove('hide');
    }
    window.network.connect(myRole, myInfo);
} else {
    document.getElementById('login-overlay').style.display = 'flex';
}