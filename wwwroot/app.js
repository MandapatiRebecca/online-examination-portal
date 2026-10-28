
const $ = s => document.querySelector(s);
const app = $('#app');

let me = null, exams = [], stats = {}, results = [];
let activeExam = null, attempt = null, questions = [];
let answers = {}, qIndex = 0, timeLeft = 0, timer = null;
let warnings = 0, review = new Set();

function normalizeUser(u) {
    if (!u) return null;

    return {
        ...u,
        Name: u.Name ?? u.name ?? 'User',
        Role: u.Role ?? u.role ?? 'Student',
        Department: u.Department ?? u.department ?? ''
    };
}

const api = async (url, opts = {}) => {
    const r = await fetch('/api' + url, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            ...(opts.headers || {})
        }
    });

    let d = {};
    try {
        d = await r.json();
    } catch {}

    if (!r.ok) {
        throw new Error(d.message || 'Something went wrong');
    }

    return d;
};

const post = (url, data) =>
    api(url, {
        method: 'POST',
        body: JSON.stringify(data)
    });

const put = (url, data) =>
    api(url, {
        method: 'PUT',
        body: JSON.stringify(data)
    });

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[c]));

const initials = n =>
    (n || 'U').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();

function toast(s) {
    let t = $('#toast');
    if (!t) {
        alert(s);
        return;
    }

    t.className = 'toast';
    t.textContent = s;
    setTimeout(() => t.className = '', 2800);
}

async function init() {
    try {
        me = normalizeUser(await api('/me'));

        if (me) {
            await dashboard();
        } else {
            login();
        }
    } catch {
        me = null;
        login();
    }
}

function login() {
    app.innerHTML = `
    <div class="login-wrap">
        <section class="login-art">
            <div class="brand">
                <div class="brand-mark">E</div>
                <span>ExamNex</span>
            </div>

            <div>
                <div class="pill" style="background:#ffffff20;color:#d8d3ff">
                    SMART ASSESSMENT PLATFORM
                </div>

                <h1>Exams made smarter. Results made clearer.</h1>

                <p>
                    A modern examination experience built for students,
                    lecturers and institutions. Learn, assess and grow
                    with confidence.
                </p>
            </div>

            <div class="art-foot">
                © 2026 ExamNex · Smart Online Examination Portal
            </div>
        </section>

        <section class="login-form-side">
            <form class="login-card" id="loginForm">

                <div class="brand" style="color:#252944;margin-bottom:35px">
                    <div class="brand-mark">E</div>
                    <span>ExamNex</span>
                </div>

                <h2>Welcome back</h2>
                <p class="sub">
                    Sign in to continue to your examination workspace.
                </p>

                <div class="field">
                    <label>Username</label>
                    <input id="username"
                        placeholder="Enter your username"
                        required autocomplete="username">
                </div>

                <div class="field">
                    <label>Password</label>
                    <input id="password" type="password"
                        placeholder="Enter your password"
                        required autocomplete="current-password">
                </div>

                <button class="btn btn-primary btn-block">
                    Sign in to portal →
                </button>

                <div class="demo-box">
                    <strong>Demo accounts</strong><br>
                    Admin: admin / Admin@123<br>
                    Lecturer: lecturer / Teach@123<br>
                    Student: student / Student@123<br>
                    Student 2: ananya / Student@123
                </div>
            </form>
        </section>
    </div>`;

    $('#loginForm').onsubmit = async e => {
        e.preventDefault();

        try {
            me = normalizeUser(await post('/login', {
                username: $('#username').value,
                password: $('#password').value
            }));

            if (!me) {
                throw new Error('Login did not return user details.');
            }

            await dashboard();
        } catch (x) {
            toast(x.message);
        }
    };
}

function getNavItems() {
    return [
        ['Overview', '▦'],
        ['Examinations', '▤'],
        ['Results & Reports', '▥'],
        ['Leaderboard', '♛'],
        ...(me?.Role === 'Admin'
            ? [['User Management', '♙']]
            : [])
    ];
}

let page = 'Overview';

function layout(content) {
    if (!me) {
        login();
        return;
    }

    app.innerHTML = `
    <div class="shell">

        <aside class="sidebar">
            <div class="brand">
                <div class="brand-mark">E</div>
                <span class="brand-name">ExamNex</span>
            </div>

            <div class="nav-label">WORKSPACE</div>

            ${getNavItems().map(([n, i]) => `
                <div class="nav-item ${page === n ? 'active' : ''}"
                    data-page="${n}">
                    <span class="nav-icon">${i}</span>
                    <span>${n}</span>
                </div>
            `).join('')}

            <div class="side-bottom">
                SMART EXAMINATION PORTAL<br>
                Version 1.0.0 · Academic workspace
            </div>
        </aside>

        <main class="main">
            <header class="topbar">

                <div class="crumb">
                    Workspace&nbsp; / &nbsp;<strong>${page}</strong>
                </div>

                <div class="top-right">
                    <div class="avatar">${initials(me.Name)}</div>

                    <div class="user-meta">
                        <strong>${esc(me.Name)}</strong>
                        <span class="role">
                            ${esc(me.Role)} · ${esc(me.Department)}
                        </span>
                    </div>

                    <button class="btn btn-outline" id="logout"
                        style="padding:8px 11px;font-size:11px">
                        Logout
                    </button>
                </div>

            </header>

            <section class="content">${content}</section>
        </main>
    </div>`;

    document.querySelectorAll('[data-page]').forEach(x => {
        x.onclick = () => {
            page = x.dataset.page;
            renderPage();
        };
    });

    $('#logout').onclick = async () => {
        try {
            await post('/logout', {});
        } catch (e) {
            console.error(e);
        }

        me = null;
        clearInterval(timer);
        login();
    };
}

async function dashboard() {
    if (!me) {
        login();
        return;
    }

    stats = await api('/stats');
    exams = await api('/exams');
    results = await api('/results');

    layout(`
    <div class="welcome">
        <div>
            <h1>
                ${greeting()}, ${esc(me.Name.split(' ')[0])} 👋
            </h1>
            <p>
                Here's what's happening in your examination workspace today.
            </p>
        </div>

        ${me.Role !== 'Student'
            ? '<button class="btn btn-primary" id="newExam">＋ Create examination</button>'
            : ''}
    </div>

    <div class="stats">
        ${statCard('Available examinations', stats.exams, '▤', 'In your workspace')}
        ${statCard('Registered students', stats.students, '♙', 'Across the portal')}
        ${statCard('Completed attempts', stats.attempts, '✓', 'Submitted examinations')}
        ${statCard('Average score', stats.average, '◉', 'Across completed attempts')}
    </div>

    <div class="grid-main">

        <div class="panel">
            <div class="panel-head">
                <h3>
                    ${me.Role === 'Student'
                        ? 'Available examinations'
                        : 'Recent examinations'}
                </h3>
                <span>${exams.length} total</span>
            </div>

            <div class="exam-list">
                ${exams.slice(0, 5).map(e => examRow(e)).join('') ||
                    '<div class="empty">No examinations yet. Create your first exam to get started.</div>'}
            </div>
        </div>

        <div>
            <div class="panel">
                <div class="panel-head">
                    <h3>Performance snapshot</h3>
                    <span>Portal overview</span>
                </div>

                <div class="bar-row">
                    <span>Pass rate</span>
                    <div class="bar">
                        <i style="width:${stats.attempts
                            ? Math.min(100, stats.pass / stats.attempts * 100)
                            : 0}%"></i>
                    </div>
                    <b>${stats.attempts
                        ? Math.round(stats.pass / stats.attempts * 100)
                        : 0}%</b>
                </div>

                <div class="bar-row">
                    <span>Participation</span>
                    <div class="bar">
                        <i style="width:${stats.students
                            ? Math.min(100, stats.attempts / stats.students * 100)
                            : 0}%"></i>
                    </div>
                    <b>${stats.students
                        ? Math.round(stats.attempts / stats.students * 100)
                        : 0}%</b>
                </div>

                <div class="bar-row">
                    <span>Avg. score</span>
                    <div class="bar">
                        <i style="width:${Math.min(100, stats.average)}%"></i>
                    </div>
                    <b>${stats.average}%</b>
                </div>
            </div>

            <div class="panel">
                <div class="panel-head">
                    <h3>Quick actions</h3>
                </div>

                <div class="exam-list">
                    ${me.Role === 'Student'
                        ? `
                        <button class="btn btn-light" data-goto="Examinations">
                            Browse examinations →
                        </button>
                        <button class="btn btn-outline" data-goto="Results & Reports">
                            View my results →
                        </button>`
                        : `
                        <button class="btn btn-light" id="quickExam">
                            ＋ Create new examination
                        </button>
                        <button class="btn btn-outline" data-goto="Results & Reports">
                            View student results →
                        </button>`
                    }
                </div>
            </div>
        </div>
    </div>`);

    $('#newExam')?.addEventListener('click', () => examModal());
    $('#quickExam')?.addEventListener('click', () => examModal());

    document.querySelectorAll('[data-goto]').forEach(x => {
        x.onclick = () => {
            page = x.dataset.goto;
            renderPage();
        };
    });

    bindExamCards();
}

function greeting() {
    let h = new Date().getHours();
    return h < 12
        ? 'Good morning'
        : h < 17
            ? 'Good afternoon'
            : 'Good evening';
}

function statCard(label, num, icon, note) {
    return `
    <div class="stat">
        <div class="stat-top">
            <span>${label}</span>
            <span class="stat-icon">${icon}</span>
        </div>
        <div class="stat-num">${num ?? 0}</div>
        <div class="stat-note">${note}</div>
    </div>`;
}

function examRow(e) {
    return `
    <div class="exam-row">
        <div class="exam-symbol">▤</div>

        <div class="exam-info">
            <strong>${esc(e.title)}</strong>
            <small>
                ${esc(e.subject)} · ${e.questionCount} questions ·
                ${e.durationMinutes} min
            </small>
        </div>

        <span class="pill ${e.attempted ? 'gray' : ''}">
            ${e.attempted ? 'Completed' : e.published ? 'Published' : 'Draft'}
        </span>

        ${me.Role === 'Student'
            ? `<button class="btn btn-light small-btn"
                ${e.attempted ? 'disabled' : ''}
                data-start="${e.id}">
                ${e.attempted ? 'Done' : 'Start'}
              </button>`
            : `<button class="btn btn-outline small-btn"
                data-open="${e.id}">Questions</button>`
        }
    </div>`;
}

async function renderPage() {
    if (!me) {
        login();
        return;
    }

    if (page === 'Overview') {
        await dashboard();
        return;
    }

    if (page === 'Examinations') {
        exams = await api('/exams');

        layout(`
        <div class="welcome">
            <div>
                <h1>Examinations</h1>
                <p>
                    ${me.Role === 'Student'
                        ? 'Explore and attempt your available assessments.'
                        : 'Create, publish and manage your assessments.'}
                </p>
            </div>

            ${me.Role !== 'Student'
                ? '<button class="btn btn-primary" id="newExam">＋ Create examination</button>'
                : ''}
        </div>

        <div class="toolbar">
            <input id="examSearch" placeholder="Search by exam or subject…">
            <span class="pill gray">${exams.length} examinations</span>
        </div>

        <div class="cards" id="examCards">
            ${exams.map(examCard).join('') ||
                '<div class="empty">No examinations available.</div>'}
        </div>`);

        $('#newExam')?.addEventListener('click', () => examModal());

        $('#examSearch').oninput = () => {
            let v = $('#examSearch').value.toLowerCase();

            $('#examCards').innerHTML = exams
                .filter(e => (e.title + e.subject).toLowerCase().includes(v))
                .map(examCard).join('');
            
            bindExamCards();
        };

        bindExamCards();
        return;
    }

    if (page === 'Results & Reports') {
        results = await api('/results');

        layout(`
        <div class="welcome">
            <div>
                <h1>Results & Reports</h1>
                <p>
                    ${me.Role === 'Student'
                        ? 'Review your submitted examination results.'
                        : 'Monitor student performance and examination outcomes.'}
                </p>
            </div>

            <span class="pill">${results.length} submitted attempts</span>
        </div>

        <div class="panel">
            <div class="panel-head">
                <h3>Examination performance</h3>
                <span>Latest submissions first</span>
            </div>

            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Examination</th>
                            ${me.Role !== 'Student' ? '<th>Student</th>' : ''}
                            <th>Score</th>
                            <th>Percentage</th>
                            <th>Correct</th>
                            <th>Wrong</th>
                            <th>Status</th>
                            <th>Date</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${results.map(r => `
                        <tr>
                            <td><b>${esc(r.exam)}</b></td>
                            ${me.Role !== 'Student'
                                ? `<td>${esc(r.student)}</td>`
                                : ''}
                            <td>${r.score}/${r.totalMarks}</td>
                            <td>${r.percentage}%</td>
                            <td>${r.correct}</td>
                            <td>${r.wrong}</td>
                            <td>
                                <span class="pill ${r.percentage >= 40 ? '' : 'amber'}">
                                    ${r.percentage >= 40 ? 'Pass' : 'Needs improvement'}
                                </span>
                            </td>
                            <td>
                                ${r.submittedAt
                                    ? new Date(r.submittedAt).toLocaleDateString()
                                    : ''}
                            </td>
                        </tr>`).join('') ||
                            '<tr><td colspan="8" class="empty">No results available yet.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>`);

        return;
    }

    if (page === 'Leaderboard') {
        let rows = await api('/leaderboard');

        layout(`
        <div class="welcome">
            <div>
                <h1>Leaderboard</h1>
                <p>Celebrate consistency and academic achievement.</p>
            </div>
            <span class="pill">Top performers</span>
        </div>

        <div class="panel">
            <div class="panel-head">
                <h3>Top students</h3>
                <span>Based on cumulative scores</span>
            </div>

            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Student</th>
                            <th>Exams completed</th>
                            <th>Total score</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${rows.map((r, i) => `
                        <tr>
                            <td><b>${['🥇', '🥈', '🥉'][i] || '#' + (i + 1)}</b></td>
                            <td>${esc(r.student)}</td>
                            <td>${r.examsTaken}</td>
                            <td><b>${r.totalScore}</b></td>
                        </tr>`).join('') ||
                            '<tr><td colspan="4" class="empty">No completed exams yet.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>`);

        return;
    }

    if (page === 'User Management') {
        if (me.Role !== 'Admin') {
            page = 'Overview';
            await dashboard();
            return;
        }

        let users = await api('/users');

        layout(`
        <div class="welcome">
            <div>
                <h1>User management</h1>
                <p>Create and manage lecturer and student accounts.</p>
            </div>

            <button class="btn btn-primary" id="addUser">
                ＋ Add user
            </button>
        </div>

        <div class="panel">
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Username</th>
                            <th>Role</th>
                            <th>Department</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${users.map(u => `
                        <tr>
                            <td><b>${esc(u.name)}</b></td>
                            <td>${esc(u.username)}</td>
                            <td><span class="pill gray">${esc(u.role)}</span></td>
                            <td>${esc(u.department)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`);

        $('#addUser').onclick = () => userModal();
    }
}

function examCard(e) {
    return `
    <div class="exam-card">
        <div style="display:flex;justify-content:space-between">
            <span class="pill gray">${esc(e.category)}</span>
            <span class="pill ${e.attempted ? 'gray' : ''}">
                ${e.attempted ? 'Completed' : e.published ? 'Live' : 'Draft'}
            </span>
        </div>

        <h3>${esc(e.title)}</h3>
        <p>${esc(e.description || e.subject)}</p>

        <div class="exam-meta">
            <span>◷ ${e.durationMinutes} min</span>
            <span>▤ ${e.questionCount} questions</span>
            <span>★ ${e.totalMarks} marks</span>
        </div>

        ${me.Role === 'Student'
            ? `<button class="btn btn-primary"
                data-start="${e.id}"
                ${e.attempted ? 'disabled' : ''}>
                ${e.attempted ? 'Already attempted' : 'Start examination →'}
              </button>`
            : `<button class="btn btn-light" data-open="${e.id}">
                Manage questions →
              </button>`
        }
    </div>`;
}

function bindExamCards() {
    document.querySelectorAll('[data-start]').forEach(x => {
        x.onclick = () => startExam(x.dataset.start);
    });

    document.querySelectorAll('[data-open]').forEach(x => {
        x.onclick = () => manageQuestions(x.dataset.open);
    });
}

function examModal(e = null) {
    let editing = !!e;
    const modal = document.createElement('div');

    modal.className = 'modal-back';

    modal.innerHTML = `
    <form class="modal" id="examForm">
        <h2>${editing ? 'Edit examination' : 'Create examination'}</h2>
        <p class="sub">Set up the assessment details and publishing preferences.</p>

        <div class="form-grid">
            <div class="field">
                <label>Examination title *</label>
                <input name="title" required value="${esc(e?.title || '')}"
                    placeholder="e.g. Data Structures Midterm">
            </div>

            <div class="field">
                <label>Subject *</label>
                <input name="subject" required value="${esc(e?.subject || '')}"
                    placeholder="e.g. Data Structures">
            </div>

            <div class="field">
                <label>Category</label>
                <select name="category">
                    <option>General</option>
                    <option>Programming</option>
                    <option>Aptitude</option>
                    <option>Science</option>
                    <option>Mock Test</option>
                </select>
            </div>

            <div class="field">
                <label>Duration (minutes)</label>
                <input name="durationMinutes" type="number" min="1" max="240"
                    value="${e?.durationMinutes || 30}">
            </div>

            <div class="field">
                <label>Negative mark per wrong answer</label>
                <input name="negativeMark" type="number" min="0" step=".25"
                    value="${e?.negativeMark || 0}">
            </div>

            <div class="field">
                <label>Exam access code (optional)</label>
                <input name="accessCode" value="${esc(e?.accessCode || '')}"
                    placeholder="Leave blank for open access">
            </div>

            <div class="field">
                <label>Start time (optional)</label>
                <input name="startAt" type="datetime-local"
                    value="${e?.startAt ? new Date(e.startAt).toISOString().slice(0, 16) : ''}">
            </div>

            <div class="field">
                <label>End time (optional)</label>
                <input name="endAt" type="datetime-local"
                    value="${e?.endAt ? new Date(e.endAt).toISOString().slice(0, 16) : ''}">
            </div>
        </div>

        <div class="field">
            <label>Description</label>
            <textarea name="description" rows="2">${esc(e?.description || '')}</textarea>
        </div>

        <label class="checkline">
            <input name="shuffleQuestions" type="checkbox"
                ${e?.shuffleQuestions ? 'checked' : ''}>
            Randomize question order for each student
        </label>

        <label class="checkline">
            <input name="published" type="checkbox"
                ${e?.published ? 'checked' : ''}>
            Publish examination and make it visible to students
        </label>

        <div class="modal-actions">
            <button type="button" class="btn btn-outline" id="cancel">Cancel</button>
            <button class="btn btn-primary">
                ${editing ? 'Save changes' : 'Create examination'}
            </button>
        </div>
    </form>`;

    document.body.append(modal);

    modal.querySelector('#cancel').onclick = () => modal.remove();

    modal.onclick = x => {
        if (x.target === modal) modal.remove();
    };

    modal.querySelector('select[name=category]').value =
        e?.category || 'General';

    modal.querySelector('form').onsubmit = async ev => {
        ev.preventDefault();

        let f = new FormData(ev.target);
        let d = Object.fromEntries(f);

        d.durationMinutes = +d.durationMinutes;
        d.negativeMark = +d.negativeMark;
        d.published = ev.target.published.checked;
        d.shuffleQuestions = ev.target.shuffleQuestions.checked;
        d.startAt = d.startAt ? new Date(d.startAt).toISOString() : null;
        d.endAt = d.endAt ? new Date(d.endAt).toISOString() : null;

        try {
            let saved = editing
                ? await put('/exams/' + e.id, d)
                : await post('/exams', d);

            modal.remove();

            toast(editing
                ? 'Examination updated'
                : 'Examination created');

            if (!editing) {
                manageQuestions(saved.id);
            } else {
                renderPage();
            }
        } catch (x) {
            toast(x.message);
        }
    };
}

function userModal() {
    let modal = document.createElement('div');

    modal.className = 'modal-back';

    modal.innerHTML = `
    <form class="modal" id="userForm">
        <h2>Add portal user</h2>
        <p class="sub">Create a student or lecturer login.</p>

        <div class="field">
            <label>Full name</label>
            <input name="name" required>
        </div>

        <div class="field">
            <label>Username</label>
            <input name="username" required>
        </div>

        <div class="field">
            <label>Temporary password</label>
            <input name="password" required minlength="6">
        </div>

        <div class="field">
            <label>Role</label>
            <select name="role">
                <option>Student</option>
                <option>Lecturer</option>
            </select>
        </div>

        <div class="field">
            <label>Department</label>
            <input name="department">
        </div>

        <div class="modal-actions">
            <button type="button" class="btn btn-outline" id="cancel">
                Cancel
            </button>
            <button class="btn btn-primary">Create user</button>
        </div>
    </form>`;

    document.body.append(modal);

    modal.querySelector('#cancel').onclick = () => modal.remove();

    modal.querySelector('form').onsubmit = async e => {
        e.preventDefault();

        let d = Object.fromEntries(new FormData(e.target));

        try {
            await post('/users', d);
            modal.remove();
            toast('User account created');
            renderPage();
        } catch (x) {
            toast(x.message);
        }
    };
}

async function manageQuestions(id) {
    let e = exams.find(x => x.id === id) ||
        await api('/exams').then(a => a.find(x => x.id === id));

    let qs = await api('/exams/' + id + '/questions');
    let modal = document.createElement('div');

    modal.className = 'modal-back';

    modal.innerHTML = `
    <div class="modal">
        <div style="display:flex;justify-content:space-between;gap:12px">
            <div>
                <h2>Question bank</h2>
                <p class="sub">
                    ${esc(e?.title || 'Examination')} · ${qs.length} questions
                </p>
            </div>

            <button class="btn btn-outline" id="close">✕</button>
        </div>

        <div id="qList">
            ${qs.map((q, i) => `
            <div class="exam-row" style="margin:9px 0">
                <div class="exam-info">
                    <strong>${i + 1}. ${esc(q.text)}</strong>
                    <small>
                        ${q.marks} mark(s) · ${esc(q.difficulty)} ·
                        Answer: ${esc(q.options[q.correctIndex])}
                    </small>
                </div>
                <button class="btn btn-danger small-btn" data-delq="${q.id}">
                    Delete
                </button>
            </div>`).join('') ||
                '<div class="empty">No questions added yet.</div>'}
        </div>

        <hr style="border:0;border-top:1px solid var(--line);margin:20px 0">

        <h3 style="font:800 14px Manrope">Add a question</h3>

        <form id="questionForm">
            <div class="field">
                <label>Question text</label>
                <textarea name="text" rows="2" required
                    placeholder="Enter your question"></textarea>
            </div>

            <div class="form-grid">
                ${[0, 1, 2, 3].map(i => `
                <div class="field">
                    <label>Option ${String.fromCharCode(65 + i)}</label>
                    <input name="o${i}" required>
                </div>`).join('')}
            </div>

            <div class="form-grid">
                <div class="field">
                    <label>Correct answer</label>
                    <select name="correctIndex">
                        <option value="0">Option A</option>
                        <option value="1">Option B</option>
                        <option value="2">Option C</option>
                        <option value="3">Option D</option>
                    </select>
                </div>

                <div class="field">
                    <label>Marks</label>
                    <input name="marks" type="number" min="1" value="1">
                </div>

                <div class="field">
                    <label>Difficulty</label>
                    <select name="difficulty">
                        <option>Easy</option>
                        <option selected>Medium</option>
                        <option>Hard</option>
                    </select>
                </div>
            </div>

            <div class="modal-actions">
                <button class="btn btn-primary">＋ Add question</button>
            </div>
        </form>

        <div class="modal-actions">
            <button class="btn btn-light" id="finish">Done</button>
        </div>
    </div>`;

    document.body.append(modal);

    modal.querySelector('#close').onclick = () => modal.remove();

    modal.querySelector('#finish').onclick = () => {
        modal.remove();
        renderPage();
    };

    modal.querySelector('#questionForm').onsubmit = async ev => {
        ev.preventDefault();

        let f = new FormData(ev.target);

        try {
            await post('/exams/' + id + '/questions', {
                text: f.get('text'),
                options: [0, 1, 2, 3].map(i => f.get('o' + i)),
                correctIndex: +f.get('correctIndex'),
                marks: +f.get('marks'),
                difficulty: f.get('difficulty')
            });

            modal.remove();
            toast('Question added successfully');
            manageQuestions(id);
        } catch (x) {
            toast(x.message);
        }
    };

    modal.querySelectorAll('[data-delq]').forEach(b => {
        b.onclick = async () => {
            try {
                await api('/questions/' + b.dataset.delq, {
                    method: 'DELETE'
                });

                modal.remove();
                manageQuestions(id);
            } catch (x) {
                toast(x.message);
            }
        };
    });
}

async function startExam(id) {
    let exam = exams.find(x => x.id === id);

    if (!exam) return;

    let code = '';

    if (exam.hasAccessCode) {
        code = prompt('Enter the examination access code:') || '';
        if (!code) return;
    }

    try {
        let data = await post('/exams/' + id + '/start', {
            accessCode: code
        });

        activeExam = data.exam;
        attempt = data;
        questions = data.questions;
        answers = {};
        qIndex = 0;
        warnings = 0;
        review.clear();

        timeLeft = data.durationMinutes * 60;

        renderQuestion();
        startTimer();
    } catch (x) {
        toast(x.message);
    }
}

function startTimer() {
    clearInterval(timer);

    timer = setInterval(() => {
        timeLeft--;

        let t = $('#timer');

        if (t) t.textContent = fmt(timeLeft);

        if (timeLeft <= 0) {
            clearInterval(timer);
            submitExam(true);
        }
    }, 1000);
}

function fmt(n) {
    return `${String(Math.floor(Math.max(0, n) / 60)).padStart(2, '0')}:${String(Math.max(0, n) % 60).padStart(2, '0')}`;
}

function renderQuestion() {
    let q = questions[qIndex];

    app.innerHTML = `
    <div class="content exam-stage">

        <div class="exam-top">
            <div>
                <div class="brand" style="font-size:16px;color:#252944">
                    <div class="brand-mark">E</div>
                    ExamNex
                    <span class="pill gray">Live examination</span>
                </div>

                <p class="section-sub" style="margin:9px 0 0">
                    ${esc(activeExam.title)} · ${esc(activeExam.subject)}
                </p>
            </div>

            <div class="timer" id="timer">${fmt(timeLeft)}</div>
        </div>

        <div class="q-layout">

            <div class="question-card">
                <div class="q-count">
                    QUESTION ${qIndex + 1} OF ${questions.length} · ${q.marks} MARKS
                </div>

                <h2>${esc(q.text)}</h2>

                <div>
                    ${q.options.map((o, i) => `
                    <label class="option ${answers[q.id] === i ? 'selected' : ''}">
                        <input type="radio" name="answer" value="${i}"
                            ${answers[q.id] === i ? 'checked' : ''}>
                        <b>${String.fromCharCode(65 + i)}.</b> ${esc(o)}
                    </label>`).join('')}
                </div>

                <div style="display:flex;justify-content:space-between;gap:8px;margin-top:25px;flex-wrap:wrap">

                    <button class="btn btn-outline" id="prev"
                        ${qIndex === 0 ? 'disabled' : ''}>
                        ← Previous
                    </button>

                    <button class="btn btn-light" id="review">
                        ${review.has(q.id)
                            ? '★ Marked for review'
                            : '☆ Mark for review'}
                    </button>

                    <button class="btn btn-primary" id="next">
                        ${qIndex === questions.length - 1
                            ? 'Review & submit'
                            : 'Save & next →'}
                    </button>

                </div>
            </div>

            <aside class="q-side">
                <h4>Question palette</h4>

                <div class="q-numbers">
                    ${questions.map((x, i) => `
                    <button class="q-num
                        ${answers[x.id] !== undefined ? 'answered' : ''}
                        ${i === qIndex ? 'current' : ''}"
                        data-q="${i}">
                        ${i + 1}
                    </button>`).join('')}
                </div>

                <div class="legend">
                    🟩 Answered &nbsp; ◻ Not answered<br>
                    ★ Marked for review
                </div>

                <hr style="border:0;border-top:1px solid var(--line);margin:15px 0">

                <div style="font-size:11px;color:var(--muted);line-height:2">
                    Answered: <b>${Object.keys(answers).length}</b> / ${questions.length}<br>
                    Review: <b>${review.size}</b>
                </div>

                <button class="btn btn-primary btn-block" id="submit"
                    style="margin-top:15px">
                    Submit examination
                </button>
            </aside>
        </div>

        <p style="font-size:10px;color:#9ba1af;text-align:center;margin-top:18px">
            Your answers are saved in this active session.
            Do not close or refresh this window.
        </p>
    </div>`;

    document.querySelectorAll('input[name=answer]').forEach(x => {
        x.onchange = () => {
            answers[q.id] = +x.value;
            renderQuestion();
        };
    });

    $('#prev').onclick = () => {
        qIndex--;
        renderQuestion();
    };

    $('#next').onclick = () => {
        if (qIndex === questions.length - 1) {
            confirmSubmit();
        } else {
            qIndex++;
            renderQuestion();
        }
    };

    $('#review').onclick = () => {
        review.has(q.id)
            ? review.delete(q.id)
            : review.add(q.id);

        renderQuestion();
    };

    $('#submit').onclick = confirmSubmit;

    document.querySelectorAll('[data-q]').forEach(x => {
        x.onclick = () => {
            qIndex = +x.dataset.q;
            renderQuestion();
        };
    });

    $('#timer').textContent = fmt(timeLeft);
}

function confirmSubmit() {
    let unanswered = questions.length - Object.keys(answers).length;

    if (confirm(
        `Submit your examination now?\nAnswered: ${Object.keys(answers).length}\nUnanswered: ${unanswered}\nMarked for review: ${review.size}`
    )) {
        submitExam(false);
    }
}

async function submitExam(auto) {
    clearInterval(timer);

    if (!attempt) return;

    try {
        let res = await post('/attempts/' + attempt.attemptId + '/submit', {
            answers: questions.map(q => ({
                questionId: q.id,
                selectedIndex: answers[q.id] ?? -1
            })),
            warnings
        });

        showResult(res, auto);
    } catch (x) {
        toast(x.message);
    }
}

function showResult(r, auto) {
    app.innerHTML = `
    <div class="content" style="max-width:900px">

        <div class="result-hero">
            <div class="pill" style="background:#ffffff20;color:#fff">
                ${auto ? 'AUTO-SUBMITTED' : 'EXAMINATION SUBMITTED'}
            </div>

            <div class="result-score">
                ${r.score}
                <span style="font-size:18px;color:#c9c4ff">
                    / ${r.totalMarks}
                </span>
            </div>

            <h2 style="font:800 22px Manrope;margin:0">
                ${r.passed ? 'Well done!' : 'Keep practising!'}
            </h2>

            <p>
                ${esc(activeExam.title)} ·
                Your result has been recorded successfully.
            </p>
        </div>

        <div class="result-grid">
            ${[
                ['Percentage', r.percentage + '%'],
                ['Correct', r.correct],
                ['Incorrect', r.wrong],
                ['Unanswered', r.unanswered]
            ].map(([a, b]) => `
            <div class="result-tile">
                <strong>${b}</strong>
                <span>${a}</span>
            </div>`).join('')}
        </div>

        <div class="panel" style="margin-top:18px">
            <div class="panel-head">
                <h3>Assessment summary</h3>
                <span>${r.passed ? 'Pass' : 'Needs improvement'}</span>
            </div>

            <p style="font-size:12px;color:var(--muted);line-height:1.8">
                Your examination has been submitted and automatically evaluated.
                ${r.warnings} focus warning(s) were recorded during the attempt.
                The lecturer can view your result in the reports section.
            </p>

            <button class="btn btn-primary" id="backDash">
                Return to dashboard →
            </button>
        </div>
    </div>`;

    $('#backDash').onclick = () => {
        page = 'Overview';
        dashboard();
    };

    activeExam = null;
    attempt = null;
    questions = [];
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden && attempt && $('#timer')) {
        warnings++;
        toast('Focus warning recorded: avoid switching tabs during the examination.');
    }
});

init();
