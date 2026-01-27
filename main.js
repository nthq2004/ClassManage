import { NetworkManager } from './network.js';
import { SimulationEngine } from './simulation.js';

const BASE_URL = "api.wangaijun.click"; // 请替换为您的 Worker 域名
let myInfo, myRole, currentMode = 'TRAIN'; //这是全局变量，还有window.的变量，从属于本窗口。engine是全局
window.selectedSid = null; // 当前选中的演练学生，window.onlineusers也是window.变量

// (id, state) =>，箭头函数，是仿真对象的onAction函数，带两个参数，实际是调用网络的发送函数，在WebSocket上面发送格式化数据，DO收到的是JSON数据。JSON字符串包括6个参数，type(教师指令、还是学生指令)、操纵模式、设备ID、动作、发送者、接受者。
//全局engine对象.onAction(id,state)方法
const engine = new SimulationEngine('container', (id, state) => {
    window.network.send({
        type: myRole === 'TEACHER' ? 'TE_CMD' : 'ST_CMD',
        mode: currentMode, deviceId: id, action: state,
        from: myInfo.userId, to: window.selectedSid
    });
});

// 处理网络数据，下面这个箭头函数就是网络对象onMessage函数，一个参数data，window.network对象.onMessage(data)方法
window.network = new NetworkManager(BASE_URL, (data) => {
    //收到的消息是用户列表，则设置在线用户变量，刷新教师端的本班级学生列表；
    if (data.type === 'USER_LIST') renderUserList(data.users);
    //收到的消息是同步类型，则设置当前模式，
    if (data.type === 'MODE_SYNC') {
        currentMode = data.mode;
        updateUI();
    }

    // 模式同步逻辑
    if (myRole === 'STUDENT') {
        if (currentMode === 'DEMO') {
            engine.isLocked = true; // 演示模式：学生不可操作，收到教师指令，设置设备状态。
            if (data.type === 'TE_CMD') engine.updateState(data.deviceId, data.action);
        } else if (currentMode === 'PRACTICE') {
            const isMe = data.to === myInfo.userId;  //这个非常关键，消息是教师选择演练学生是发出的，但消息是广播，所有学生都收到，如果是发个我的，isMe=true, isLocked=false，才可操作。
            engine.isLocked = !isMe; // 仅选中的学生可操作
            if (data.type === 'TE_CMD') engine.updateState(data.deviceId, data.action);
        } else {
            engine.isLocked = false;
        }
    } else { 
        // 教师端逻辑，在演练模式下，收到的信息从选中学生来，刷新自己的仿真设备状态
        if (currentMode === 'PRACTICE' && data.from === window.selectedSid) {
            engine.updateState(data.deviceId, data.action);
        }
    }
});

// UI 操作函数，注册界面，根据角色切换显示，window.toggleFields(role)方法
// --- 登录逻辑修复 ---
window.toggleFields = (role) => {
    const stFields = document.getElementById('st-fields');
    const teFields = document.getElementById('te-fields');
    if (role === 'TEACHER') {
        stFields.classList.add('hide');
        teFields.classList.remove('hide');
    } else {
        stFields.classList.remove('hide');
        teFields.classList.add('hide');
    }
};

//window.dologin()方法。在登录界面上调用，存储role和info到本地，重新加载。
window.doLogin = () => {
    const role = document.getElementById('roleSel').value;
    const name = document.getElementById('loginName').value;
    if (!name) return alert("请输入姓名");

    if (role === 'TEACHER' && document.getElementById('teCode').value !== '147258') return alert("邀请码错误");

    const info = {
        userName: name,
        userId: role === 'STUDENT' ? document.getElementById('loginSid').value : "T-" + Date.now(),
        className: role === 'STUDENT' ? document.getElementById('loginClass').value : "默认班级"
    };
    localStorage.setItem('marine_sim_v3', JSON.stringify({ role, info }));
    location.reload();
};

//教师切换班级时调用，存储本次进入的班级，下次默认进入，在新机器上登录时，教师进入默认班级。
window.onClassChange = (cls) => {
    myInfo.className = cls;
    localStorage.setItem('marine_sim_v3', JSON.stringify({ role: myRole, info: myInfo }));
    window.network.connect(myRole, myInfo);
};

//教师端在操作模式切换时调用。设置变量、发送模式改变消息（发到WebSocket的另外一端Server端，它应该帮我转发到班级里所有在线的用户、更新信息栏和状态栏的显示
window.setMode = (m) => {
    currentMode = m;
    window.network.send({ type: 'MODE_SYNC', mode: m });
    updateUI();
};

//在监控模式下，教师选择被监控学生时调用，重新刷新用户列表的状态，更新信息栏和状态栏的线上。可取消监控（原来就是被监控，又被点中）、切换监控（selectedSid被切换）、这里应该有消息发出。
window.selectStudent = (sid, name) => {
    window.selectedSid = (window.selectedSid === sid) ? null : sid;
    renderUserList(window.onlineUsers || []);
    updateUI();
};

//点击注销时调用
window.logout = () => {
    localStorage.removeItem('marine_sim_v3');
    location.reload();
};

//全局函数，根据currentMode刷新信息栏和状态栏的显示
function updateUI() {
    //刷新信息栏模式的显示
    const modes = { TRAIN: '自由训练模式', DEMO: '教师演示模式', PRACTICE: '演练模式' };
    document.getElementById('mode-display').innerText = modes[currentMode];
    //底部状态栏显示：演练模式看有没有同学选中，其它显示系统运行正常
    const midStatus = document.getElementById('status-mid');
    if (currentMode === 'PRACTICE') {
        const student = (window.onlineUsers || []).find(u => u.userId === window.selectedSid);
        midStatus.innerText = student ? `${student.userName} 正在演练` : "请选择需要演练的同学";
    } else {
        midStatus.innerText = "系统运行正常";
    }
    //教师收到该消息，同步主讲教师的模式操纵状态
    if (myRole === 'TEACHER') {
        document.querySelectorAll('.m-btn').forEach(b => b.classList.toggle('active', b.innerText.includes(modes[currentMode].substring(0,2))));
    }
}

//全局函数，主要是教师端，刷新在线用户列表；
function renderUserList(users) {
    window.onlineUsers = users;
    const list = document.getElementById('student-list');
    if (!list) return;
    list.innerHTML = users.filter(u => u.role === 'STUDENT').map(u => `
        <div class="student-item ${window.selectedSid === u.userId ? 'active' : ''}" 
             style="padding: 15px 10px;"
             onclick="selectStudent('${u.userId}', '${u.userName}')">
            <div style="font-weight:bold">${u.userName}</div>
            <div style="font-size:10px; opacity:0.6">${u.userId}</div>
        </div>
    `).join('');
}

// --- 初始化与入口 ---
document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('marine_sim_v3');
    
    if (saved) {
        const session = JSON.parse(saved);
        myRole = session.role; 
        myInfo = session.info;
        
        // 渲染基础信息
        document.getElementById('u-name').innerText = myInfo.userName;
        document.getElementById('u-class').innerText = myInfo.className;

        if (myRole === 'TEACHER') {
            const sidebar = document.getElementById('sidebar');
            const teTools = document.getElementById('te-tools');
            sidebar.classList.remove('hide');
            sidebar.style.display = 'flex'; // 强制显示
            teTools.classList.remove('hide');
            
            // 加载班级列表
            window.network.fetchClasses().then(list => {
                const sel = document.getElementById('clsSel');
                sel.innerHTML = list.map(c => `<option value="${c}" ${c === myInfo.className ? 'selected' : ''}>${c}</option>`).join('');
            });
        }
        
        // 启动连接
        window.network.connect(myRole, myInfo);
    } else {
        document.getElementById('login-overlay').style.display = 'flex';
    }
});
// 在 main.js 中，确保针对 Touch 事件做了优化
document.addEventListener('touchstart', function(e) {
    if(e.touches.length > 1) e.preventDefault(); // 禁止多指缩放干扰坐标
}, {passive: false});