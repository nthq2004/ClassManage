import { NetworkManager } from './network.js';
import { SimulationEngine } from './simulation.js';

const BASE_URL = "api.wangaijun.click";
let myInfo, myRole, currentMode = 'TRAIN';
window.selectedStudentId = null;

const engine = new SimulationEngine('container', (id, state) => {
    window.network.send({
        type: myRole === 'TEACHER' ? 'TE_OP' : 'ST_OP',
        mode: currentMode, deviceId: id, action: state,
        from: myInfo.userId, to: window.selectedStudentId
    });
});

window.network = new NetworkManager(BASE_URL, (data) => {
    if (data.type === 'USER_LIST') renderStudents(data.users);
    if (data.type === 'MODE_SYNC') {
        currentMode = data.mode;
        updateUI();
    }
    
    // 逻辑流：根据模式锁定或更新仿真设备
    if (myRole === 'STUDENT') {
        const isTarget = data.to === myInfo.userId;
        if (currentMode === 'DEMO') {
            engine.isLocked = true;
            if (data.type === 'TE_OP') engine.updateDevice(data.deviceId, data.action);
        } else if (currentMode === 'PRACTICE') {
            engine.isLocked = !isTarget; // 只有被选中的演练同学可以操作
            if (data.type === 'TE_OP') engine.updateDevice(data.deviceId, data.action);
        } else {
            engine.isLocked = false;
        }
    } else { // 教师端逻辑
        if (currentMode === 'PRACTICE' && data.from === window.selectedStudentId) {
            engine.updateDevice(data.deviceId, data.action);
        }
    }
});

// --- 教师特有：班级选择逻辑 ---
window.onClassChange = (className) => {
    myInfo.className = className;
    localStorage.setItem('sim_v3_session', JSON.stringify({ role: myRole, info: myInfo }));
    window.network.connect(myRole, myInfo); // 切换班级后重连
};

window.handleLogin = () => {
    const role = document.getElementById('uRole').value;
    const name = document.getElementById('uName').value;
    if (!name) return alert("请输入姓名");

    const info = {
        userName: name,
        userId: role === 'STUDENT' ? document.getElementById('uSid').value : "T-" + Date.now(),
        className: role === 'STUDENT' ? document.getElementById('uCls').value : "默认班级"
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
    window.selectedStudentId = (window.selectedStudentId === id) ? null : id;
    document.getElementById('status-mid').innerText = window.selectedStudentId ? `${name} 同学正在演练` : "请选择演练同学";
    renderStudents(window.allUsers || []);
};

function updateUI() {
    const modes = document.querySelectorAll('.mode-btn');
    modes.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === currentMode));
    
    const labels = { TRAIN: '自由训练模式', DEMO: '教师演示模式', PRACTICE: '演练模式' };
    document.getElementById('mode-display').innerText = labels[currentMode];
    engine.isLocked = (myRole === 'STUDENT' && currentMode === 'DEMO');
}

function renderStudents(users) {
    window.allUsers = users;
    const list = document.getElementById('student-list');
    if (!list) return;
    list.innerHTML = users.filter(u => u.role === 'STUDENT').map(u => `
        <div class="student-item ${window.selectedStudentId === u.userId ? 'active' : ''}" 
             onclick="selectStudent('${u.userId}', '${u.userName}')">
            ${u.userName} (${u.userId})
        </div>
    `).join('');
}

// 初始化
const session = JSON.parse(localStorage.getItem('sim_v3_session'));
if (session) {
    myRole = session.role; myInfo = session.info;
    document.getElementById('u-info-name').innerText = myInfo.userName;
    document.getElementById('u-info-class').innerText = myInfo.className;

    if (myRole === 'TEACHER') {
        document.getElementById('sidebar').style.display = 'flex';
        document.getElementById('te-tools').classList.remove('hide');
        // 加载班级列表并设置默认值
        window.network.fetchClasses().then(classes => {
            const sel = document.getElementById('classSel');
            sel.innerHTML = classes.map(c => `<option value="${c}" ${c === myInfo.className ? 'selected' : ''}>${c}</option>`).join('');
        });
    }
    window.network.connect(myRole, myInfo);
} else {
    document.getElementById('login-overlay').style.display = 'flex';
}