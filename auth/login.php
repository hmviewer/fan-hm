<!DOCTYPE html>
<html lang="ko" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <!-- THE HM 로고 및 공유 이미지 -->
    <link rel="icon" type="image/png" href="/assets/logo/the-hm-favicon.png">
    <link rel="icon" type="image/png" href="/assets/logo/the-hm-logo.png">
    <link rel="apple-touch-icon" href="/assets/logo/the-hm-logo.png">
    <!-- 링크 공유 미리보기 (Open Graph · 카카오톡 · 트위터/X) -->
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="THE HM">
    <meta property="og:title" content="THE HM">
    <meta property="og:description" content="THE HM">
    <meta property="og:image" content="/assets/logo/the-hm-logo.png">
    <meta property="og:image:width" content="296">
    <meta property="og:image:height" content="298">
    <meta property="og:url" content="/auth/login.php">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="THE HM">
    <meta name="twitter:description" content="THE HM">
    <meta name="twitter:image" content="/assets/logo/the-hm-logo.png">
    <title>THE HM 로그인</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="login.css">
    <link rel="stylesheet" href="../tokens.css">
</head>
<body>

<!-- 테마 토글 -->
<button class="theme-btn" id="themeBtn">
    <span id="themeIcon">🌙</span>
    <span id="themeLabel">다크</span>
</button>

<div class="card" id="card">

    <div class="logo">
        <span class="logo-mark">THE HM</span>
        <span class="logo-sub">Member Portal</span>
        <div class="logo-divider"></div>
    </div>

    <div class="error-box" id="errorBox"></div>

    <div class="field">
        <label>비밀번호</label>
        <input type="password" id="passwordInput"
               placeholder="비밀번호 입력"
               autocomplete="current-password" autofocus>
    </div>

    <button class="login-btn" id="loginBtn" onclick="doLogin()">로그인</button>

    <p class="hint">멤버 비밀번호를 입력하세요</p>

    <!-- 커뮤니티 / 관리자 접근 -->
    <div class="admin-link">
        <a href="../">← 커뮤니티 홈</a>
        <a href="../admin/">⚙️ 관리자</a>
    </div>
</div>

<script>
    // ── 테마 ──────────────────────────────
    const html      = document.documentElement;
    const themeBtn  = document.getElementById('themeBtn');
    const themeIcon = document.getElementById('themeIcon');
    const themeLbl  = document.getElementById('themeLabel');

    (function() {
        const saved = localStorage.getItem('the_hm_theme') || 'light';
        applyTheme(saved);
    })();

    function applyTheme(t) {
        html.setAttribute('data-theme', t);
        themeIcon.textContent = t === 'dark' ? '☀️' : '🌙';
        themeLbl.textContent  = t === 'dark' ? '라이트' : '다크';
        localStorage.setItem('the_hm_theme', t);
    }
    themeBtn.addEventListener('click', () => {
        applyTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    // ── 엔터 ──────────────────────────────
    document.getElementById('passwordInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') doLogin();
    });

    // ── 에러 표시 ─────────────────────────
    function showError(msg) {
        const box = document.getElementById('errorBox');
        box.textContent = msg;
        box.classList.add('show');
        const card = document.getElementById('card');
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
    }
    function clearError() {
        document.getElementById('errorBox').classList.remove('show');
    }

    // ── 로그인 ────────────────────────────
    async function doLogin() {
        clearError();
        const p   = document.getElementById('passwordInput');
        const btn = document.getElementById('loginBtn');

        p.classList.remove('err');

        if (!p.value) { p.classList.add('err'); showError('비밀번호를 입력해주세요.'); p.focus(); return; }

        btn.disabled = true;
        btn.textContent = '로그인 중…';

        try {
            const fd = new FormData();
            fd.append('auth_action', 'login');
            fd.append('username', '');
            fd.append('password', p.value);

            const res  = await fetch('../auth/auth.php', { method: 'POST', body: fd });
            const data = await res.json();

            if (data.success) {
                btn.textContent = '✓ 로그인 성공';
                btn.style.background = '#10b981';
                setTimeout(() => location.reload(), 480);
            } else {
                showError(data.message || '로그인에 실패했습니다.');
                btn.disabled = false;
                btn.textContent = '로그인';
                p.value = '';
                p.focus();
            }
        } catch {
            showError('서버 연결 실패. 다시 시도해주세요.');
            btn.disabled = false;
            btn.textContent = '로그인';
        }
    }
</script>
</body>
</html>
