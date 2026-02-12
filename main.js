import { NetworkManager } from './network.js';
import { SimulationEngine } from './simulation.js';

const BASE_URL = "api.wangaijun.click"; // 请替换为您的 Worker 域名
let myInfo, myRole, currentMode = 'TRAIN'; //这是全局变量，还有window.的变量，从属于本窗口。engine是全局
window.selectedSid = null; // 当前选中的演练学生，window.onlineusers也是window.变量



// (id, state) =>，箭头函数，是仿真对象的onAction函数，带两个参数，实际是调用网络的发送函数，在WebSocket上面发送格式化数据，DO收到的是JSON数据。JSON字符串包括6个参数，type(教师指令、还是学生指令)、操纵模式、设备ID、动作、发送者、接受者。。。。。。。。。。。。。。。。。。。。。
//全局engine对象.onAction(id,state)方法
const engine = new SimulationEngine('container', (id, state) => {
    window.network.send({
        type: myRole === 'TEACHER' ? 'TE_CMD' : 'ST_CMD',
        mode: currentMode, deviceId: id, action: state,
        from: myInfo.userId, to: window.selectedSid
    });
});

// 处理网络数据，下面这个箭头函数就是网络对象onMessage函数，一个参数data，window.network对象.onMessage(data)方法......。。。。。。。。。。。。。。。。。。。。。。。。。。。。。。
window.network = new NetworkManager(BASE_URL, (data) => {
    //收到的消息是用户列表，则设置在线用户变量，刷新教师端的本班级学生列表；
    if (data.type === 'USER_LIST') renderUserList(data.users);
    //收到的消息是同步类型，则设置当前模式，
    if (data.type === 'MODE_SYNC') {
        currentMode = data.mode;
        updateUI();
    }
    if (data.type === 'ST_SELECT') {
        window.selectedSid = (window.selectedSid === data.selid) ? null : data.selid;
        renderUserList(window.onlineUsers || []);
        updateUI();
    }
    // 模式同步逻辑
    if (myRole === 'STUDENT') {
        if (currentMode === 'DEMO') {
            lockEngine(true); // 演示模式：学生不可操作，收到教师指令，设置设备状态。
            if (data.type === 'TE_CMD') engine.remOperation(data.deviceId, data.action);
        } else {
            lockEngine(false);
        }
    } else {
        // 教师端逻辑，在演练模式下，收到的信息从选中学生来，刷新自己的仿真设备状态
        if (currentMode === 'PRACTICE') {
            lockEngine(true); //教师在演练模式下，锁定不能操作模型
            if (data.from === window.selectedSid) {
                engine.remOperation(data.deviceId, data.action);
            }
        } else {
            lockEngine(false); 
        }

    }
});

// 全局函数，锁定或解锁仿真引擎的交互能力，教师端在演示模式和学生端在演练模式下调用，禁止操作模型，但可以看到状态变化；其它情况解锁，可以操作模型。实现方法是设置engine.isLocked变量，并且遍历所有设备的group，设置listening属性为false或true来禁止或允许交互事件。教师端在演示模式下，学生端在演练模式下调用window.lockEngine(true)，其它情况调用window.lockEngine(false)。。。。。。。。。。。。。。。。。。。。。同时，锁定时，禁止工具栏按钮的点击，解锁时允许点击。工具栏按钮在教师端和学生端都有，教师端的工具栏按钮在演示模式和演练模式下可用，在自由训练模式下可用；学生端的工具栏按钮在演练模式下可用，在其它模式下不可用。实现方法是在window.lockEngine函数中，除了设置engine.isLocked和设备group的listening属性外，还要根据myRole和currentMode来设置工具栏按钮的disabled属性。
window.lockEngine = (locked) => {
    engine.isLocked = locked;
    Object.values(engine.devices).forEach(dev => {
        if (dev.group) {
            dev.group.listening(!locked);
        }
    });
    // 设置工具栏按钮的可用状态，id="toolbar"下的按钮，isLocked为true时，教师端在演示模式和学生端在演练模式下，禁用按钮；其它情况启用按钮。教师端的工具栏按钮在演示模式和演练模式下可用，在自由训练模式下可用；学生端的工具栏按钮在演练模式下可用，在其它模式下不可用。
    const toolbar = document.getElementById('toolbar');
    if (toolbar) {
        const buttons = toolbar.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.disabled = locked;
        });
    }   
}

// UI 操作函数，注册界面，根据角色切换显示，window.toggleFields(role)方法。。。。。。。。。。。。
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

//window.dologin()方法。在登录界面上调用，存储role和info到本地，重新加载。。。。。。。。。。。。。。
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

//教师切换班级时调用，存储本次进入的班级，下次默认进入，在新机器上登录时，教师进入默认班级。调用https://api.wangaijun.clikc/?role=""?info="",教师进入新班级的房间会话。系统广播该房间的用户列表信息，教师重新显示新进入班级的在线用户列表。。。。。。。。。。。。。。。。。。。。。
window.onClassChange = (cls) => {
    myInfo.className = cls;
    document.getElementById('u-class').innerText = myInfo.className;
    localStorage.setItem('marine_sim_v3', JSON.stringify({ role: myRole, info: myInfo }));
    window.network.connect(myRole, myInfo);
};

//教师端在操作模式切换时调用。设置变量、发送模式改变消息（发到WebSocket的另外一端Server端，它应该帮我转发到班级里所有在线的用户、更新信息栏和状态栏的显示。。。。。。。。。。。。。。。。。。。。。。。。。。
window.setMode = (m) => {
    //currentMode = m;
    window.network.send({ type: 'MODE_SYNC', mode: m });
    //updateUI();
};

//在监控模式下，教师选择被监控学生时调用，重新刷新用户列表的状态，更新信息栏和状态栏的线上。可取消监控（原来就是被监控，又被点中）、切换监控（selectedSid被切换）、这里应该有消息发出。
window.selectStudent = (sid, name) => {
    //window.selectedSid = (window.selectedSid === sid) ? null : sid;只发消息，在消息处理函数中跟新当前选择的用户
    window.network.send({ type: 'ST_SELECT', selid: sid });
    //renderUserList(window.onlineUsers || []);
    //updateUI();
};

//点击注销时调用。。。。。。。。。。。。。。。。。。。。。。。
window.logout = () => {
    localStorage.removeItem('marine_sim_v3');
    location.reload();
};

//全局函数，根据currentMode刷新信息栏和状态栏的显示。。。。。。。。。。。。
function updateUI() {
    //刷新信息栏模式的显示，文字显示当前模式
    const modes = { TRAIN: '自由训练模式', DEMO: '教师演示模式', PRACTICE: '学生演练模式' };
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
        document.querySelectorAll('.m-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-mode') === currentMode);
        });
    }
}

//全局函数，主要是教师端，刷新在线用户列表；学生端直接返回。。。。。。。。。。。。
function renderUserList(users) {
    window.onlineUsers = users;
    const list = document.getElementById('student-list');
    if (!list) return;   //学生端，没有这个
    list.innerHTML = users.filter(u => u.role === 'STUDENT').map(u => `
        <div class="student-item ${window.selectedSid === u.userId ? 'active' : ''}" 
            onclick="selectStudent('${u.userId}', '${u.userName}')">
            <div style="font-weight:bold">${u.userName} ${u.userId}</div>
        </div>
    `).join('');
}

// --- 初始化与入口 ---。。。。。。。。。。。。。。。。。。。。。。。
document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('marine_sim_v3');

    if (saved) {
        const session = JSON.parse(saved);
        myRole = session.role;
        myInfo = session.info;

        // 渲染基础信息，信息栏的用户名和班级
        document.getElementById('u-name').innerText = myInfo.userName;
        document.getElementById('u-class').innerText = myInfo.className;

        if (myRole === 'TEACHER') {
            const sidebar = document.getElementById('sidebar');
            const teTools = document.getElementById('te-tools');
            sidebar.classList.remove('hide'); //侧边栏显示
            sidebar.style.display = 'flex'; // 强制显示
            teTools.classList.remove('hide'); //信息栏的3个模式按钮

            // 加载班级列表,教师端多的东西：侧边栏（班级选择、学生列表）、信息栏（3个模式按钮）
            window.network.fetchClasses().then(list => {
                const sel = document.getElementById('clsSel');
                sel.innerHTML = list.map(c => `<option value="${c}" ${c === myInfo.className ? 'selected' : ''} >${c}</option>`).join('');
            });
        }

        // 启动连接，开启wss连接，传递角色、班级、姓名、学号，根据班级获得房间实例，每个班级一个实例。教师登陆，如果没有本地存储，则进入默认班级。连接后，升级为Websocket，可以通过TCP连接发送消息。
        window.network.connect(myRole, myInfo);
    } else {
        document.getElementById('login-overlay').style.display = 'flex';
    }
});

// 监听窗口大小变化，调整舞台尺寸
window.addEventListener('resize', () => {
    //如果窗口高度小于500，隐藏最上面的信息栏，增加仿真区域高度
    const infoBar = document.getElementById('info-bar');
    const statusBar = document.getElementById('status-bar');
    if (window.innerHeight < 500) {
        infoBar.style.display = 'none';
        statusBar.style.display = 'none';
    } else {
        infoBar.style.display = 'flex';
        statusBar.style.display = 'flex';
    }
    engine.resize();
});

// 绑定工具栏按钮到 engine 方法
window.addEventListener('DOMContentLoaded', () => {
    const map = {
        btnUndo: () => {window.network.send({
        type: myRole === 'TEACHER' ? 'TE_CMD' : 'ST_CMD',
        mode: currentMode, deviceId: 'ui', action: 'undo',
        from: myInfo.userId, to: window.selectedSid
    }); engine.undo() },
        btnRedo: () => {window.network.send({
        type: myRole === 'TEACHER' ? 'TE_CMD' : 'ST_CMD',
        mode: currentMode, deviceId: 'ui', action: 'redo',
        from: myInfo.userId, to: window.selectedSid
    }); engine.redo()},

        btnAutoWire: () =>{window.network.send({
        type: myRole === 'TEACHER' ? 'TE_CMD' : 'ST_CMD',
        mode: currentMode, deviceId: 'ui', action: 'autoWire',
        from: myInfo.userId, to: window.selectedSid
    }); engine.autoWire()},
        btnStep5: () =>{window.network.send({
        type: myRole === 'TEACHER' ? 'TE_CMD' : 'ST_CMD',
        mode: currentMode, deviceId: 'ui', action: 'stepFive',
        from: myInfo.userId, to: window.selectedSid
    }); engine.stepFive()},

        btnStep: () => engine.singleStep(),
        btnOpDemo: () => engine.operationDemo(),
        btnWorkflow: () =>{window.network.send({
        type: myRole === 'TEACHER' ? 'TE_CMD' : 'ST_CMD',
        mode: currentMode, deviceId: 'ui', action: 'workflow',
        from: myInfo.userId, to: window.selectedSid
    }); engine.openWorkflowPanel(false)},

        btnLeakDrill: () => { window.network.send({ type: myRole === 'TEACHER' ? 'TE_CMD' : 'ST_CMD', mode: currentMode, deviceId: 'ui', action: 'leakDrill', from: myInfo.userId, to: window.selectedSid }); engine.startLeakDrill(); },
        btnLeakAssess: () => { window.network.send({ type: myRole === 'TEACHER' ? 'TE_CMD' : 'ST_CMD', mode: currentMode, deviceId: 'ui', action: 'leakAssess', from: myInfo.userId, to: window.selectedSid }); engine.startLeakAssessment(); },
        btnBreakDrill: () => { window.network.send({ type: myRole === 'TEACHER' ? 'TE_CMD' : 'ST_CMD', mode: currentMode, deviceId: 'ui', action: 'breakDrill', from: myInfo.userId, to: window.selectedSid }); engine.startBreakDrill(); },
        btnBreakAssess: () => { window.network.send({ type: myRole === 'TEACHER' ? 'TE_CMD' : 'ST_CMD', mode: currentMode, deviceId: 'ui', action: 'breakAssess', from: myInfo.userId, to: window.selectedSid }); engine.startBreakAssessment(); },

        btnSet: () => engine.openSettingsModal(),
        btnReset: () =>{window.network.send({
        type: myRole === 'TEACHER' ? 'TE_CMD' : 'ST_CMD',
        mode: currentMode, deviceId: 'ui', action: 'reset',
        from: myInfo.userId, to: window.selectedSid
    });  engine.resetExperiment()},
        btnTest: () => {window.network.send({
        type: myRole === 'TEACHER' ? 'TE_CMD' : 'ST_CMD',
        mode: currentMode, deviceId: 'ui', action: 'test',
        from: myInfo.userId, to: window.selectedSid
    });engine.openWorkflowPanel(true)},
        btnTheory: () => engine.openTheoryTest()
    };
    Object.entries(map).forEach(([id, fn]) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    });
});