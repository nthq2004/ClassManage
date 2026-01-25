import { NetworkManager } from './network.js';
import { SimulationEngine } from './simulation.js';

let myInfo, myRole, isDemo = false;
window.selectedStudentId = null;
const BASE_URL = "api.wangaijun.click";

const engine = new SimulationEngine('container', (id, state) => {
    if (myRole === 'TEACHER' && !isDemo) return alert("监控模式不可操作");
    engine.update(id, state);
    window.network.send({ type: isDemo ? 'TEACHER_DEMO' : 'STUDENT_ACTION', deviceId: id, action: state, fromStudent: myInfo.userId });
});
engine.addPump('PUMP_01', 50, 50);

window.network = new NetworkManager(BASE_URL, (data) => {
    if (data.type === 'USER_LIST') {
        window.allUsers = data.users;
        renderList(data.users);
    }
    if (myRole === 'TEACHER' && !isDemo && window.selectedStudentId === data.fromStudent) {
        if (data.type === 'STUDENT_ACTION') engine.update(data.deviceId, data.action);
    }
    if (myRole === 'STUDENT' && data.type === 'TEACHER_DEMO') {
        document.getElementById('demo-mask').style.display = 'block';
        engine.update(data.deviceId, data.action);
    }
});

function renderList(users) {
    const el = document.getElementById('student-list');
    if (!el || myRole !== 'TEACHER') return;
    el.innerHTML = users.filter(u => u.role === 'STUDENT').map(u => `
        <div class="student-item ${window.selectedStudentId === u.userId ? 'active' : ''}" onclick="selectS('${u.userId}')">
            ${u.userName} (${u.userId})
        </div>
    `).join('');
}

window.handleLogin = () => {
    const role = document.getElementById('userRole').value;
    const name = document.getElementById('regUserName').value;
    const info = { userName: name, className: document.getElementById('regClassName').value || "Lobby", userId: document.getElementById('regUserId').value || "T-"+Date.now() };
    localStorage.setItem('sim_user', JSON.stringify(info));
    localStorage.setItem('sim_role', role);
    location.reload();
};

window.logout = () => { localStorage.clear(); location.reload(); };
window.selectS = (id) => { window.selectedStudentId = (window.selectedStudentId === id) ? null : id; renderList(window.allUsers || []); };
window.toggleDemo = () => { isDemo = !isDemo; window.network.connect(myRole, myInfo); };

const saved = localStorage.getItem('sim_user');
if (saved) {
    myInfo = JSON.parse(saved); myRole = localStorage.getItem('sim_role');
    if (myRole === 'TEACHER') document.getElementById('sidebar').style.display = 'flex';
    window.network.connect(myRole, myInfo);
} else {
    document.getElementById('reg-overlay').style.display = 'flex';
}