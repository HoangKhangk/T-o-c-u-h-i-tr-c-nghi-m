
// ─── STATE ───────────────────────────────────────────
let questions = []; // editing questions
let quizzes = JSON.parse(localStorage.getItem('quizmaker_quizzes') || '[]');
let currentQuiz = null;
let currentQuizId = null;
let shuffleEnabled = false;
let sharedQuiz = null;   // quiz loaded from share link
let tempQuiz = null;     // unshuffled copy for shared quiz retake
let userAnswers = {};
let timerInterval = null;
let timeLeft = 0;
let startTime = null;

// ─── SHUFFLE ─────────────────────────────────────────
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function shuffleQuiz(quiz) {
    const qs = shuffleArray(quiz.questions).map(q => {
        const order = shuffleArray([0, 1, 2, 3]);
        return {
            ...q,
            choices: order.map(i => q.choices[i]),
            correct: order.indexOf(q.correct)
        };
    });
    return { ...quiz, questions: qs };
}

// ─── SHARE ───────────────────────────────────────────
function encodeQuizForShare(quiz) {
    try {
        const json = JSON.stringify(quiz);
        const b64 = btoa(unescape(encodeURIComponent(json)));
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    } catch (e) { return null; }
}

function decodeQuizFromShare(str) {
    try {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) str += '=';
        return JSON.parse(decodeURIComponent(escape(atob(str))));
    } catch (e) { return null; }
}

function getShareLink(quiz) {
    const encoded = encodeQuizForShare(quiz);
    if (!encoded) return null;
    return window.location.href.split('#')[0] + '#q=' + encoded;
}

function openShareModal(id, e) {
    if (e) e.stopPropagation();
    const quiz = quizzes.find(q => q.id === id);
    if (!quiz) return;
    const link = getShareLink(quiz);
    if (!link) { showToast('Không thể tạo link!', true); return; }
    document.getElementById('share-link-input').value = link;
    const btn = document.getElementById('copy-link-btn');
    btn.innerHTML = '<i data-lucide="copy"></i> Sao chép';
    document.getElementById('shareModal').classList.add('open');
    lucide.createIcons();
}

function closeShareModal() {
    document.getElementById('shareModal').classList.remove('open');
}

function copyShareLinkModal() {
    const input = document.getElementById('share-link-input');
    const btn = document.getElementById('copy-link-btn');
    navigator.clipboard.writeText(input.value).catch(() => {
        input.select();
        document.execCommand('copy');
    });
    btn.innerHTML = '<i data-lucide="check"></i> Đã sao chép!';
    lucide.createIcons();
    showToast('Đã sao chép link chia sẻ!');
    setTimeout(() => {
        btn.innerHTML = '<i data-lucide="copy"></i> Sao chép';
        lucide.createIcons();
    }, 2000);
}

function checkShareHash() {
    const hash = window.location.hash;
    if (!hash.startsWith('#q=')) return;
    const encoded = hash.slice(3);
    const quiz = decodeQuizFromShare(encoded);
    if (!quiz || !quiz.title || !quiz.questions) {
        showToast('Link không hợp lệ hoặc đã hết hạn!', true);
        return;
    }
    sharedQuiz = quiz;
    document.getElementById('share-title').textContent = quiz.title;

    const subjEl = document.getElementById('share-subject-badge');
    subjEl.innerHTML = quiz.subject
        ? `<span class="badge badge-blue" style="margin-bottom:4px;">${quiz.subject}</span>`
        : '';

    document.getElementById('share-meta').innerHTML = `
        <div class="share-stat"><i data-lucide="file-text"></i> ${quiz.questions.length} câu hỏi</div>
        <div class="share-stat"><i data-lucide="timer"></i> ${quiz.time} phút</div>
    `;

    const descEl = document.getElementById('share-desc-text');
    descEl.textContent = quiz.desc || '';
    descEl.style.display = quiz.desc ? 'block' : 'none';

    const alreadySaved = quizzes.some(q => q.id === quiz.id);
    const saveBtn = document.getElementById('save-shared-btn');
    if (alreadySaved) {
        saveBtn.innerHTML = '<i data-lucide="check-circle"></i> Đã có trong thư viện';
        saveBtn.disabled = true;
    }

    showPage('share');
    lucide.createIcons();
}

function startSharedQuiz(shuffle = false) {
    if (!sharedQuiz) return;
    tempQuiz = JSON.parse(JSON.stringify(sharedQuiz));
    currentQuizId = null;
    shuffleEnabled = shuffle;
    currentQuiz = shuffle ? shuffleQuiz(tempQuiz) : JSON.parse(JSON.stringify(tempQuiz));
    userAnswers = {};
    showPage('take');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('take-title').textContent = currentQuiz.title;
    document.getElementById('take-subject').textContent = currentQuiz.subject || '';
    const ind = document.getElementById('shuffle-indicator');
    if (ind) ind.style.display = shuffle ? 'flex' : 'none';
    renderTakeQuestions();
    startTimer(currentQuiz.time * 60);
    updateProgress();
}

function saveSharedQuiz() {
    if (!sharedQuiz) return;
    if (quizzes.some(q => q.id === sharedQuiz.id)) {
        showToast('Đề này đã có trong thư viện!');
        return;
    }
    const quiz = { ...sharedQuiz, createdAt: new Date().toLocaleDateString('vi-VN') };
    quizzes.unshift(quiz);
    localStorage.setItem('quizmaker_quizzes', JSON.stringify(quizzes));
    showToast('Đã lưu vào thư viện!');
    const btn = document.getElementById('save-shared-btn');
    btn.innerHTML = '<i data-lucide="check-circle"></i> Đã lưu!';
    btn.disabled = true;
    lucide.createIcons();
}

// ─── NAVIGATION ──────────────────────────────────────
function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-' + id).classList.add('active');
    document.querySelectorAll(`.nav-btn[data-page="${id}"]`).forEach(b => b.classList.add('active'));
    if (id === 'library') renderLibrary();
}

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('tab-upload').style.display = tab === 'upload' ? 'block' : 'none';
    document.getElementById('tab-manual').style.display = tab === 'manual' ? 'block' : 'none';
    if (tab === 'manual' && questions.length === 0) addQuestion();
}

// ─── QUESTIONS EDITOR ────────────────────────────────
function addQuestion(q = null) {
    const id = Date.now() + Math.random();
    questions.push({ id, text: q?.text || '', choices: q?.choices || ['', '', '', ''], correct: q?.correct || 0 });
    renderQuestions();
    // scroll to new
    setTimeout(() => {
        const cards = document.querySelectorAll('.q-card');
        cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
}

function renderQuestions() {
    const list = document.getElementById('questionList');
    list.innerHTML = '';
    questions.forEach((q, i) => {
        const div = document.createElement('div');
        div.className = 'q-card';
        div.innerHTML = `
      <button class="q-del-btn" onclick="deleteQuestion('${q.id}')">✕</button>
      <div class="q-card-header">
        <div class="q-num">${i + 1}</div>
        <textarea class="q-content-text" placeholder="Nhập câu hỏi..." oninput="updateQ('${q.id}','text',this.value)">${q.text}</textarea>
      </div>
      <div class="choices-grid">
        ${['A', 'B', 'C', 'D'].map((l, ci) => `
          <div class="choice-item">
            <div class="choice-label">${l}</div>
            <input class="choice-input" placeholder="Đáp án ${l}" value="${q.choices[ci] || ''}" oninput="updateChoice('${q.id}',${ci},this.value)">
          </div>
        `).join('')}
      </div>
      <div class="correct-row">
        <label>Đáp án đúng:</label>
        <select class="correct-select" onchange="updateQ('${q.id}','correct',parseInt(this.value))">
          ${['A', 'B', 'C', 'D'].map((l, ci) => `<option value="${ci}" ${q.correct === ci ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
    `;
        list.appendChild(div);
    });
}

function updateQ(id, field, val) {
    const q = questions.find(q => q.id == id);
    if (q) q[field] = val;
}
function updateChoice(id, idx, val) {
    const q = questions.find(q => q.id == id);
    if (q) q.choices[idx] = val;
}
function deleteQuestion(id) {
    questions = questions.filter(q => q.id != id);
    renderQuestions();
}
function clearQuestions() {
    showConfirm('Xóa tất cả câu hỏi?', 'Thao tác này không thể hoàn tác.', () => {
        questions = [];
        renderQuestions();
        document.getElementById('parsed-preview').style.display = 'none';
    });
}

// ─── FILE UPLOAD ──────────────────────────────────────
const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
});

function handleFile(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
    // reset input so same file can be re-selected
    e.target.value = '';
}

function setUploadIcon(html) {
    const icon = document.getElementById('upload-icon');
    icon.innerHTML = html;
    lucide.createIcons();
}

function setUploadState(state, msg) {
    const zone = document.getElementById('dropZone');
    const title = document.getElementById('upload-title');
    const sub = document.getElementById('upload-sub');
    const fb = document.getElementById('upload-feedback');

    if (state === 'loading') {
        setUploadIcon('<i data-lucide="loader-circle" class="icon-spin" style="width:3rem;height:3rem;color:var(--accent);"></i>');
        title.textContent = 'Đang đọc file...';
        sub.textContent = '';
        fb.style.display = 'none';
        zone.style.borderColor = 'var(--accent)';
    } else if (state === 'success') {
        setUploadIcon('<i data-lucide="circle-check" style="width:3rem;height:3rem;color:var(--success);"></i>');
        title.innerHTML = msg;
        sub.textContent = 'Click để chọn file khác';
        zone.style.borderColor = 'var(--success)';
        fb.style.display = 'flex';
        fb.style.background = 'rgba(34,201,142,.1)';
        fb.style.border = '1px solid var(--success)';
        fb.style.color = 'var(--success)';
    } else if (state === 'error') {
        setUploadIcon('<i data-lucide="circle-x" style="width:3rem;height:3rem;color:var(--danger);"></i>');
        title.textContent = msg;
        sub.innerHTML = 'Vui lòng kiểm tra lại định dạng — <span style="color:var(--accent);cursor:pointer;" onclick="downloadSample()">tải file mẫu</span>';
        zone.style.borderColor = 'var(--danger)';
        fb.style.display = 'flex';
        fb.style.background = 'rgba(245,91,91,.1)';
        fb.style.border = '1px solid var(--danger)';
        fb.style.color = 'var(--danger)';
        fb.innerHTML = '<i data-lucide="triangle-alert" style="width:16px;height:16px;flex-shrink:0;"></i> ' + msg;
        lucide.createIcons();
    } else {
        setUploadIcon('<i data-lucide="file-text" style="width:3rem;height:3rem;color:var(--muted);"></i>');
        title.innerHTML = 'Kéo thả file vào đây hoặc <span style="color:var(--accent);text-decoration:underline;">click để chọn</span>';
        sub.textContent = 'Hỗ trợ .txt và .docx — xem định dạng bên dưới';
        zone.style.borderColor = '';
        fb.style.display = 'none';
    }
}

function processFile(file) {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith('.txt')) {
        setUploadState('loading');
        const reader = new FileReader();
        reader.onload = e => {
            let text = e.target.result;
            if (text.includes('\uFFFD')) {
                const r2 = new FileReader();
                r2.onload = ev => parseTxt(ev.target.result, file.name);
                r2.onerror = () => setUploadState('error', 'Không đọc được file. Hãy lưu lại dưới dạng UTF-8.');
                r2.readAsText(file, 'windows-1258');
            } else {
                parseTxt(text, file.name);
            }
        };
        reader.onerror = () => setUploadState('error', 'Không đọc được file!');
        reader.readAsText(file, 'UTF-8');
    } else if (name.endsWith('.docx') || name.endsWith('.doc')) {
        setUploadState('loading');
        const reader = new FileReader();
        reader.onload = e => parseDocxXml(e.target.result, file.name);
        reader.onerror = () => setUploadState('error', 'Không đọc được file!');
        reader.readAsArrayBuffer(file);
    } else {
        setUploadState('error', `File "${file.name}" không được hỗ trợ. Chỉ nhận .txt hoặc .docx`);
    }
}

// ─── DOCX XML PARSER (đọc màu đỏ trực tiếp) ──────────
async function parseDocxXml(arrayBuffer, filename) {
    try {
        // Unzip docx (it's a ZIP) — dùng JSZip nếu có, fallback sang mammoth
        let rows; // [{text, isRed}]

        if (typeof JSZip !== 'undefined') {
            const zip = await JSZip.loadAsync(arrayBuffer);
            const xmlStr = await zip.file('word/document.xml').async('string');
            rows = extractRowsFromXml(xmlStr);
        } else {
            // Fallback: dùng mammoth + phân tích HTML để lấy màu đỏ
            if (typeof mammoth === 'undefined') {
                setUploadState('error', 'Thư viện chưa tải xong, vui lòng thử lại!');
                return;
            }
            const result = await mammoth.convertToHtml({ arrayBuffer });
            rows = extractRowsFromHtml(result.value);
        }

        parseRowsToQuestions(rows, filename);
    } catch (err) {
        setUploadState('error', 'Lỗi đọc file .docx: ' + err.message);
    }
}

function extractRowsFromHtml(html) {
    // Parse mammoth HTML to get paragraphs + red color info
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const rows = [];
    doc.querySelectorAll('p').forEach(p => {
        const text = p.textContent.replace(/[\ufeff\u200b]/g, '').trim();
        if (!text) return;
        // Check if any element inside has red color
        let isRed = false;
        p.querySelectorAll('[style]').forEach(el => {
            const style = el.getAttribute('style') || '';
            if (/color\s*:\s*#?[fF][fF]0{4}/i.test(style) || /color\s*:\s*red/i.test(style)) {
                isRed = true;
            }
        });
        // Also check inline style on spans with color:#FF0000
        if (!isRed) {
            const inner = p.innerHTML;
            if (/color\s*:\s*#[Ff][Ff]00{2}/i.test(inner)) isRed = true;
        }
        rows.push({ text, isRed });
    });
    return rows;
}

function extractRowsFromXml(xmlStr) {
    // Trả về [{text, isRed}] - mỗi paragraph 1 row
    // isRed = true nếu BẤT KỲ run nào trong paragraph có màu FF0000
    // Đặc biệt: cũng trả về redText = text của run đỏ (để xác định đúng đáp án)
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const paragraphs = xmlDoc.getElementsByTagNameNS(W, 'p');
    const rows = [];

    for (const p of paragraphs) {
        const runs = p.getElementsByTagNameNS(W, 'r');
        let fullText = '';
        let redText = '';   // chỉ phần text màu đỏ
        let isRed = false;

        for (const r of runs) {
            const t = r.getElementsByTagNameNS(W, 't')[0];
            const runText = (t && t.textContent) ? t.textContent : '';
            if (!runText) continue;
            fullText += runText;

            const color = r.getElementsByTagNameNS(W, 'color')[0];
            if (color) {
                const val = (color.getAttribute('w:val') || '').toUpperCase();
                if (val === 'FF0000') {
                    isRed = true;
                    redText += runText;
                }
            }
        }

        fullText = fullText.replace(/[\ufeff\u200b]/g, '').trim();
        redText = redText.replace(/[\ufeff\u200b]/g, '').trim();
        if (fullText) rows.push({ text: fullText, isRed, redText });
    }
    return rows;
}

function parseRowsToQuestions(rows, filename) {
    const questions_parsed = [];

    function isQuestion(text) {
        return /^Câu\s*\d+[A-Za-z]?\s*[:.)]/i.test(text);
    }

    // Tách "a. xxxb. yyyc. zzz" → { a: 'xxx', b: 'yyy', c: 'zzz' }
    // Tách "a. xxxb. yyyc. zzz" → { a:'xxx', b:'yyy', c:'zzz', d:'...' }
    // Không dùng lookbehind, tìm theo thứ tự a→b→c→d
    function splitChoicesFromStr(text) {
        const result = {};
        const markerPos = {};
        let searchFrom = 0;
        for (const letter of ['a', 'b', 'c', 'd']) {
            const re = new RegExp(letter + '\\s*[.)]\\s*', 'gi');
            let bestPos = null, bestEnd = null, bestScore = -1;
            let m;
            re.lastIndex = searchFrom;
            while ((m = re.exec(text)) !== null) {
                const pos = m.index;
                const prev = pos > 0 ? text[pos - 1] : '';
                const score = (prev === '' || !/[a-zA-Z0-9]/.test(prev)) ? 2 : 1;
                if (score > bestScore) { bestScore = score; bestPos = pos; bestEnd = m.index + m[0].length; }
                if (score === 2) break;
            }
            if (bestPos !== null) { markerPos[letter] = { s: bestPos, e: bestEnd }; searchFrom = bestEnd; }
        }
        const letters = Object.keys(markerPos).sort();
        letters.forEach((l, i) => {
            const cs = markerPos[l].e;
            const ce = i + 1 < letters.length ? markerPos[letters[i + 1]].s : text.length;
            const ct = text.slice(cs, ce).trim();
            if (ct) result[l] = ct;
        });
        return result;
    }

    // Xác định đáp án đúng từ redText của một row (không dùng lookbehind)
    function getRedLetter(row) {
        if (!row.isRed) return null;
        const findLetter = (str) => {
            const m = str.match(/([a-dA-D])\s*[.)]/);
            return m ? m[1].toLowerCase() : null;
        };
        const l = findLetter(row.redText);
        if (l) return l;
        // Nếu redText không chứa letter marker, tìm trong fullText tại vị trí redText xuất hiện
        const pos = row.text.indexOf(row.redText.slice(0, 10));
        if (pos >= 0) {
            const before = row.text.slice(0, pos + row.redText.length);
            const re2 = /([a-dA-D])\s*[.)]/gi;
            let m2, last = null;
            while ((m2 = re2.exec(before)) !== null) last = m2;
            if (last) return last[1].toLowerCase();
        }
        return null;
    }

    let i = 0;
    while (i < rows.length) {
        const row = rows[i];
        const qm = row.text.match(/^Câu\s*(\d+[A-Za-z]?)\s*[:.)]\s*(.+)/i);
        if (!qm) { i++; continue; }

        const qnum = qm[1];
        let qbody = qm[2].trim();
        let j = i + 1;

        // Thu thập tất cả rows của câu này
        const allRows = [row];
        while (j < rows.length && !isQuestion(rows[j].text)) {
            allRows.push(rows[j]);
            j++;
        }

        // --- Phát hiện có choices riêng dòng không ---
        const separateChoiceRows = allRows.slice(1).filter(r =>
            /^[a-dA-D]\s*[.)]\s*\S/.test(r.text)
        );
        const hasSeparateChoices = separateChoiceRows.length >= 2;

        let choicesMap = {};
        let qText = '';
        let redLetter = null;

        if (hasSeparateChoices) {
            qText = qbody;
            for (const r of allRows.slice(1)) {
                const t = r.text;
                const cm = t.match(/^([a-dA-D])\s*[.)]\s*(.+)/);
                if (cm) {
                    const letter = cm[1].toLowerCase();
                    const ctext = cm[2].trim();
                    if (!choicesMap[letter]) choicesMap[letter] = { text: ctext, isRed: r.isRed };
                    if (r.isRed) redLetter = letter;
                } else if (!isQuestion(t)) {
                    if (Object.keys(choicesMap).length === 0) qText += ' ' + t;
                }
            }
        } else {
            // Inline: tìm vị trí choice đầu tiên trong qbody (không dùng lookbehind)
            const firstChoiceMatch = qbody.match(/([a-dA-D])\s*[.)]\s*/i);
            if (firstChoiceMatch) {
                qText = qbody.slice(0, firstChoiceMatch.index).trim();
                let combinedChoices = qbody.slice(firstChoiceMatch.index);
                for (const r of allRows.slice(1)) combinedChoices += r.text;

                const split = splitChoicesFromStr(combinedChoices);
                for (const [l, t] of Object.entries(split)) choicesMap[l] = { text: t, isRed: false };

                for (const r of allRows) {
                    if (r.isRed) {
                        const rl = getRedLetter(r);
                        if (rl && choicesMap[rl]) { choicesMap[rl].isRed = true; redLetter = rl; break; }
                    }
                }
            } else {
                qText = qbody;
                for (const r of allRows.slice(1)) {
                    const t = r.text;
                    if (/[a-dA-D]\s*[.)]\s*\S/.test(t)) {
                        const split = splitChoicesFromStr(t);
                        for (const [l, ct] of Object.entries(split)) {
                            if (!choicesMap[l]) choicesMap[l] = { text: ct, isRed: r.isRed };
                        }
                        if (r.isRed) { const rl = getRedLetter(r); if (rl) redLetter = rl; }
                    } else {
                        if (Object.keys(choicesMap).length === 0) qText += ' ' + t;
                    }
                }
            }
        }

        // Build 4-slot
        const choices = ['', '', '', ''];
        let correct = redLetter ? 'abcd'.indexOf(redLetter) : -1;
        ['a', 'b', 'c', 'd'].forEach((l, ci) => {
            if (choicesMap[l]) {
                choices[ci] = choicesMap[l].text;
                if (choicesMap[l].isRed && correct === -1) correct = ci;
            }
        });
        if (correct === -1) correct = 0;
        if (!qText.trim()) { i = j; continue; }

        questions_parsed.push({
            id: Date.now() + Math.random(),
            text: qText.trim(),
            choices,
            correct
        });
        i = j;
    }

    if (!questions_parsed.length) {
        setUploadState('error', `Không tìm thấy câu hỏi hợp lệ trong "${filename}"`);
        return;
    }

    questions = questions_parsed;
    setUploadState('success', `Đã nhận <strong>${questions_parsed.length} câu hỏi</strong> từ "${filename}" ✓`);
    document.getElementById('parsed-count').innerHTML = `✅ ${questions_parsed.length} câu hỏi đã nhập`;
    renderParsedPreview();
    const preview = document.getElementById('parsed-preview');
    preview.style.display = 'block';
    preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- THAY THẾ TOÀN BỘ HÀM parseTxt CŨ ---
function parseTxt(text, filename) {
    // 1. Chuẩn hóa cực mạnh: Xóa ký tự lạ, đưa về một kiểu xuống dòng duy nhất
    text = text.replace(/[\ufeff\u200b]/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 2. Tách khối: Dùng RegEx linh hoạt, không bắt buộc phải có \n ở trước nếu là đầu file
    const blocks = text.split(/(?=^Câu\s*\d+)/im).filter(b => b.trim());
    const parsed = [];

    blocks.forEach((block) => {
        // Tách dòng để lấy câu hỏi
        let lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 1) return;

        // Lấy nội dung câu hỏi (xóa chữ Câu 1:)
        let qText = lines[0].replace(/^Câu\s*\d+\s*[:.)-]?\s*/i, '').trim();
        let choices = [];
        let correct = 0;

        // Gom toàn bộ phần còn lại của block để quét đáp án (xử lý đáp án dính liền)
        let bodyText = lines.slice(1).join(' ');

        // 3. Quét đáp án kiểu Azota: Tìm các cụm bắt đầu bằng a. b. c. d. hoặc A. B. C. D.
        // RegEx này tìm chữ cái + dấu chấm/ngoặc và lấy nội dung cho đến khi gặp chữ cái tiếp theo
        const choiceRegex = /\b([a-dA-D])\s*[.)-]\s*([^]*?)(?=\s+\b[a-dA-D]\s*[.)-]|\s*(?:ĐA|Đáp án|Answer|Key):|$)/gi;
        let m;
        while ((m = choiceRegex.exec(block)) !== null) {
            choices.push(m[2].trim());
        }

        // 4. CƠ CHẾ DỰ PHÒNG CHO CÂU 41, 42 (Khi không thấy a. b. c. d.)
        if (choices.length < 2) {
            // Nếu câu hỏi có dấu '?', lấy phần sau dấu '?' làm đáp án
            if (qText.includes('?')) {
                let parts = qText.split('?');
                let afterQ = parts.slice(1).join('?').trim();
                if (afterQ.length > 0) {
                    qText = parts[0].trim() + '?';
                    // Tách theo khoảng trắng kép hoặc xuống dòng
                    choices = afterQ.split(/\s{2,}|\n/).filter(c => c.trim().length > 0);
                }
            }

            // Nếu vẫn không có, lấy các dòng còn lại làm đáp án (cho câu 41 trong ảnh của bạn)
            if (choices.length < 2 && lines.length > 1) {
                choices = lines.slice(1).filter(l => !l.match(/^(?:ĐA|Đáp án|Answer|Key):/i));
            }
        }

        // 5. Tìm đáp án đúng
        const am = block.match(/(?:ĐA|Đáp\s*án|Answer|Key|Chọn)\s*[:\-.\s]*([A-D])/i);
        if (am) correct = 'abcd'.indexOf(am[1].toLowerCase());

        if (choices.length >= 2) {
            while (choices.length < 4) choices.push("");
            parsed.push({
                id: Date.now() + Math.random(),
                text: qText,
                choices: choices.slice(0, 4),
                correct: correct < 0 ? 0 : correct
            });
        }
    });

    // Cập nhật giao diện
    if (parsed.length > 0) {
        questions = parsed;
        setUploadState('success', `Đã nhận <strong>${parsed.length} câu hỏi</strong> ✓`);
        renderParsedPreview();
        document.getElementById('parsed-preview').style.display = 'block';
    } else {
        setUploadState('error', 'Lỗi định dạng! Hãy chắc chắn file có chữ "Câu 1:", "Câu 2:"...');
    }
}

function renderParsedPreview() {
    const list = document.getElementById('parsedList');
    list.innerHTML = '';
    questions.forEach((q, i) => {
        const div = document.createElement('div');
        div.className = 'q-card';
        div.style.pointerEvents = 'none';
        div.innerHTML = `
      <div class="q-card-header">
        <div class="q-num">${i + 1}</div>
        <div style="flex:1;font-size:.9rem;font-weight:600;line-height:1.5">${q.text}</div>
      </div>
      <div class="choices-grid">
        ${['A', 'B', 'C', 'D'].map((l, ci) => q.choices[ci] ? `
          <div class="choice-item">
            <div class="choice-label" style="${ci === q.correct ? 'background:var(--success);color:#fff' : ''}">${l}</div>
            <div style="font-size:.84rem;${ci === q.correct ? 'color:var(--success);font-weight:600' : ''}">${q.choices[ci]}</div>
          </div>
        ` : '').join('')}
      </div>
    `;
        list.appendChild(div);
    });
}

function editParsed() {
    document.querySelectorAll('.tab')[1].classList.add('active');
    document.querySelectorAll('.tab')[0].classList.remove('active');
    document.getElementById('tab-upload').style.display = 'none';
    document.getElementById('tab-manual').style.display = 'block';
    document.getElementById('parsed-preview').style.display = 'none';
    renderQuestions();
}

function downloadSample() {
    const sample = `Câu 1: Thủ đô của Việt Nam là?
A. Hồ Chí Minh
B. Hà Nội
C. Đà Nẵng
D. Huế
ĐA: B

Câu 2: Sông nào dài nhất Việt Nam?
A. Sông Đà
B. Sông Lam
C. Sông Hồng
D. Sông Mê Kông
ĐA: C

Câu 3: Việt Nam có bao nhiêu tỉnh thành?
A. 58
B. 61
C. 63
D. 65
ĐA: C`;
    const blob = new Blob([sample], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mau_cau_hoi.txt';
    a.click();
}

// ─── SAVE QUIZ ───────────────────────────────────────
function saveQuiz() {
    const title = document.getElementById('quiz-title').value.trim();
    const subject = document.getElementById('quiz-subject').value.trim();
    const time = parseInt(document.getElementById('quiz-time').value) || 30;
    const desc = document.getElementById('quiz-desc').value.trim();

    if (!title) { showToast('Vui lòng nhập tên đề thi!', true); return; }
    if (!questions.length) { showToast('Chưa có câu hỏi nào!', true); return; }

    const valid = questions.filter(q => q.text.trim() && q.choices.some(c => c.trim()));
    if (!valid.length) { showToast('Các câu hỏi chưa đầy đủ nội dung!', true); return; }

    const quiz = { id: Date.now(), title, subject, time, desc, questions: valid, createdAt: new Date().toLocaleDateString('vi-VN') };
    quizzes.unshift(quiz);
    localStorage.setItem('quizmaker_quizzes', JSON.stringify(quizzes));
    showToast('Đã lưu đề thi!');
    setTimeout(() => {
        showPage('library');
        openShareModal(quiz.id);
    }, 600);
}

// ─── LIBRARY ─────────────────────────────────────────
function renderLibrary() {
    const grid = document.getElementById('quizGrid');
    const empty = document.getElementById('library-empty');
    grid.innerHTML = '';
    if (!quizzes.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    quizzes.forEach(q => {
        const div = document.createElement('div');
        div.className = 'quiz-item';
        div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <h3>${q.title}</h3>
        <button onclick="deleteQuiz(${q.id},event)" style="background:none;border:none;cursor:pointer;color:var(--muted);display:flex;align-items:center;" title="Xóa">
          <i data-lucide="x" style="width:16px;height:16px;"></i>
        </button>
      </div>
      ${q.subject ? `<span class="badge badge-blue">${q.subject}</span>` : ''}
      ${q.desc ? `<p style="font-size:.78rem;color:var(--muted);margin-top:8px;">${q.desc}</p>` : ''}
      <div class="meta">
        <span><i data-lucide="file-text" style="width:13px;height:13px;vertical-align:middle;margin-right:3px;"></i>${q.questions.length} câu</span>
        <span><i data-lucide="timer" style="width:13px;height:13px;vertical-align:middle;margin-right:3px;"></i>${q.time} phút</span>
        <span><i data-lucide="calendar" style="width:13px;height:13px;vertical-align:middle;margin-right:3px;"></i>${q.createdAt}</span>
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="startQuiz(${q.id},event,false)">
          <i data-lucide="play" style="width:14px;height:14px;"></i> Làm bài
        </button>
        <button class="btn btn-ghost btn-sm" onclick="startQuiz(${q.id},event,true)" title="Đảo thứ tự câu hỏi và đáp án ngẫu nhiên">
          <i data-lucide="shuffle" style="width:14px;height:14px;"></i> Đảo ngẫu nhiên
        </button>
        <button class="btn btn-ghost btn-sm" onclick="openShareModal(${q.id},event)" title="Lấy link chia sẻ">
          <i data-lucide="share-2" style="width:14px;height:14px;"></i> Chia sẻ
        </button>
      </div>
    `;
        grid.appendChild(div);
    });
    lucide.createIcons();
}

function deleteQuiz(id, e) {
    e.stopPropagation();
    showConfirm('Xóa đề thi?', 'Đề thi sẽ bị xóa vĩnh viễn.', () => {
        quizzes = quizzes.filter(q => q.id !== id);
        localStorage.setItem('quizmaker_quizzes', JSON.stringify(quizzes));
        renderLibrary();
        showToast('Đã xóa đề thi');
    });
}

// ─── TAKE QUIZ ───────────────────────────────────────
function startQuiz(id, e, shuffle = false) {
    if (e) e.stopPropagation();
    const original = quizzes.find(q => q.id === id);
    if (!original) return;
    currentQuizId = id;
    shuffleEnabled = shuffle;
    currentQuiz = shuffle ? shuffleQuiz(original) : JSON.parse(JSON.stringify(original));
    userAnswers = {};
    showPage('take');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    document.getElementById('take-title').textContent = currentQuiz.title;
    document.getElementById('take-subject').textContent = currentQuiz.subject || '';

    const ind = document.getElementById('shuffle-indicator');
    if (ind) ind.style.display = shuffle ? 'flex' : 'none';

    renderTakeQuestions();
    startTimer(currentQuiz.time * 60);
    updateProgress();
}

function renderTakeQuestions() {
    const wrap = document.getElementById('take-questions');
    wrap.innerHTML = '';
    currentQuiz.questions.forEach((q, i) => {
        const card = document.createElement('div');
        card.className = 'tq-card';
        card.innerHTML = `
      <div class="tq-question"><span style="color:var(--accent);font-family:'Sora',sans-serif;">Câu ${i + 1}.</span> ${q.text}</div>
      <div class="tq-choices" id="choices-${i}">
        ${q.choices.map((c, ci) => `
          <div class="tq-choice" onclick="selectAnswer(${i},${ci})" id="c-${i}-${ci}">
            <div class="tq-choice-letter">${'ABCD'[ci]}</div>
            <span>${c || '—'}</span>
          </div>
        `).join('')}
      </div>
    `;
        wrap.appendChild(card);
    });
}

function selectAnswer(qi, ci) {
    userAnswers[qi] = ci;
    // highlight
    for (let k = 0; k < 4; k++) {
        const el = document.getElementById(`c-${qi}-${k}`);
        if (el) el.classList.toggle('selected', k === ci);
    }
    updateProgress();
}

function updateProgress() {
    const total = currentQuiz?.questions.length || 0;
    const done = Object.keys(userAnswers).length;
    document.getElementById('progress-fill').style.width = (done / total * 100) + '%';
    document.getElementById('progress-label').textContent = `${done} / ${total} câu`;
}

function startTimer(seconds) {
    clearInterval(timerInterval);
    timeLeft = seconds;
    startTime = Date.now();
    const el = document.getElementById('timer-display');
    function tick() {
        const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        const s = (timeLeft % 60).toString().padStart(2, '0');
        el.textContent = `${m}:${s}`;
        if (timeLeft <= 60) el.classList.add('warning');
        else el.classList.remove('warning');
        if (timeLeft <= 0) { clearInterval(timerInterval); submitQuiz(); return; }
        timeLeft--;
    }
    tick();
    timerInterval = setInterval(tick, 1000);
}

function submitQuiz() {
    clearInterval(timerInterval);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const total = currentQuiz.questions.length;
    let correct = 0;
    currentQuiz.questions.forEach((q, i) => {
        if (userAnswers[i] === q.correct) correct++;
    });
    const pct = Math.round(correct / total * 100);

    document.getElementById('scorePct').textContent = pct + '%';
    document.getElementById('scoreRing').style.setProperty('--pct', pct + '%');
    document.getElementById('result-title').textContent = currentQuiz.title;
    document.getElementById('r-correct').textContent = correct;
    document.getElementById('r-wrong').textContent = total - correct;
    const em = Math.floor(elapsed / 60), es = elapsed % 60;
    document.getElementById('r-time').textContent = `${em}:${es.toString().padStart(2, '0')}`;

    const msgs = ['Cần cố gắng hơn! 💪', 'Khá tốt! 🙂', 'Tốt lắm! 😊', 'Xuất sắc! 🌟', 'Hoàn hảo! 🏆'];
    document.getElementById('result-msg').textContent = msgs[Math.floor(pct / 25)] || msgs[4];

    // Review
    const rev = document.getElementById('review-list');
    rev.innerHTML = '';
    currentQuiz.questions.forEach((q, i) => {
        const ua = userAnswers[i];
        const isCorrect = ua === q.correct;
        const div = document.createElement('div');
        div.className = 'review-card';
        div.innerHTML = `
      <div class="review-q"><span style="color:${isCorrect ? 'var(--success)' : 'var(--danger)'};">${isCorrect ? '✓' : '✗'}</span> Câu ${i + 1}: ${q.text}</div>
      ${q.choices.map((c, ci) => {
            let cls = '';
            if (ci === q.correct) cls = 'correct';
            else if (ci === ua && !isCorrect) cls = 'user-wrong';
            return cls ? `<div class="review-choice ${cls}">${'ABCD'[ci]}. ${c} ${ci === q.correct ? '← Đúng' : ''}</div>` : '';
        }).join('')}
    `;
        rev.appendChild(div);
    });

    showPage('result');
}

function retakeQuiz() {
    if (currentQuizId) {
        startQuiz(currentQuizId, null, shuffleEnabled);
    } else if (tempQuiz) {
        sharedQuiz = tempQuiz;
        startSharedQuiz(shuffleEnabled);
    }
}

// ─── MODAL ───────────────────────────────────────────
let modalCallback = null;
function showConfirm(title, body, cb) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').textContent = body;
    document.getElementById('confirmModal').classList.add('open');
    modalCallback = cb;
}
function closeModal() { document.getElementById('confirmModal').classList.remove('open'); }
document.getElementById('modal-confirm-btn').onclick = () => { closeModal(); if (modalCallback) modalCallback(); };

// ─── TOAST ───────────────────────────────────────────
function showToast(msg, error = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show' + (error ? ' error' : '');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.className = '', 2500);
}

// ─── INIT ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    // Add sample quiz if empty
    if (!quizzes.length) {
        quizzes = [{
            id: 1, title: 'Kiểm tra Địa lý cơ bản', subject: 'Địa lý',
            time: 10, desc: 'Đề mẫu', createdAt: new Date().toLocaleDateString('vi-VN'),
            questions: [
                { id: 1, text: 'Thủ đô của Việt Nam là?', choices: ['Hà Nội', 'Hồ Chí Minh', 'Đà Nẵng', 'Huế'], correct: 0 },
                { id: 2, text: 'Sông dài nhất Việt Nam là?', choices: ['Sông Hồng', 'Sông Mê Kông', 'Sông Đà', 'Sông Lam'], correct: 0 },
                { id: 3, text: 'Việt Nam có bao nhiêu tỉnh thành?', choices: ['58', '61', '63', '65'], correct: 2 },
                { id: 4, text: 'Diện tích Việt Nam khoảng bao nhiêu km²?', choices: ['231.000', '331.000', '431.000', '531.000'], correct: 1 },
                { id: 5, text: 'Đỉnh núi cao nhất Việt Nam là?', choices: ['Bạch Mã', 'Ngọc Linh', 'Fansipan', 'Pu Si Lung'], correct: 2 },
            ]
        }];
        localStorage.setItem('quizmaker_quizzes', JSON.stringify(quizzes));
    }
    checkShareHash();
});
